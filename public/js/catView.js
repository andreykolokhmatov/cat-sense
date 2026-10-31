import { CAT_BLUR_PX, CAT_LOOK, CAT_MATRIX } from './logic/catVision.js';
import { videoFrame, visibleSource } from './logic/coverMap.js';
import { QUALITY_NAMES, createGovernor } from './logic/perf.js';

// The live filter is drawn with WebGL because WebKit on iPhone ignores an SVG filter on
// <video>: the colour matrix silently did nothing there, only the blur showed.
const MAX_PIXEL_RATIO = 2;
// The picture is blurred on purpose, so it is drawn at a fraction of the screen's pixels and
// the browser stretches it: a full-resolution blur costs a phone 10x the fill for nothing.
// Level 0 is the full filter, level 1 the light one for a phone that cannot keep up.
const RENDER_SCALE = [0.6, 0.4];
const HAVE_CURRENT_DATA = 2;
const PLAY_RETRY_MS = 1000;

const VERTEX = `
attribute vec2 position;
uniform vec4 source;
varying vec2 uv;
void main() {
  vec2 unit = vec2(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
  uv = source.xy + unit * source.zw;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

// Cat vision is a blur and a light colour correction, nothing more: a 3x3 Gaussian at a
// distance of `texel`, the colour matrix, flatter contrast and a thin pale fog.
const FRAGMENT = `
precision mediump float;
uniform sampler2D frame;
uniform mat3 matrix;
uniform vec2 texel;
uniform float lite;
uniform float contrast;
uniform vec3 fog;
uniform float fogAmount;
varying vec2 uv;
vec3 at(vec2 offset) { return texture2D(frame, uv + offset * texel).rgb; }
void main() {
  // The light filter reads the frame once: the low render resolution, stretched, is the blur.
  vec3 rgb = lite > 0.5
    ? at(vec2(0.0))
    : (at(vec2(0.0)) * 4.0
      + (at(vec2(1.0, 0.0)) + at(vec2(-1.0, 0.0)) + at(vec2(0.0, 1.0)) + at(vec2(0.0, -1.0))) * 2.0
      + at(vec2(1.0, 1.0)) + at(vec2(-1.0, -1.0)) + at(vec2(1.0, -1.0)) + at(vec2(-1.0, 1.0))) / 16.0;
  vec3 color = clamp(matrix * rgb, 0.0, 1.0);
  color = mix((color - 0.6) * contrast + 0.6, fog, fogAmount);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

// GLSL reads mat3 by columns, the matrix is written by rows.
function columns(m) {
  return [0, 1, 2].flatMap((col) => m.map((row) => row[col]));
}

function setUp(gl) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  // A camera frame is not a power of two: WebGL 1 then needs clamping and no mipmaps.
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  gl.uniform3fv(gl.getUniformLocation(program, 'fog'), CAT_LOOK.fogColor);
  return {
    source: gl.getUniformLocation(program, 'source'),
    texel: gl.getUniformLocation(program, 'texel'),
    lite: gl.getUniformLocation(program, 'lite'),
    matrix: gl.getUniformLocation(program, 'matrix'),
    contrast: gl.getUniformLocation(program, 'contrast'),
    fogAmount: gl.getUniformLocation(program, 'fogAmount'),
  };
}

const IDENTITY = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

// Plain is the human view: the frame as it is, no blur, no colour change.
function applyLook(gl, uniforms, plain) {
  gl.uniformMatrix3fv(uniforms.matrix, false, columns(plain ? IDENTITY : CAT_MATRIX));
  gl.uniform1f(uniforms.contrast, plain ? 1 : CAT_LOOK.contrast);
  gl.uniform1f(uniforms.fogAmount, plain ? 0 : CAT_LOOK.fogAmount);
}

// `scale` is the share of the screen's pixels to draw; 1 means the full ratio of the screen.
function fitCanvas(canvas, rect, scale) {
  const ratio = scale === 1 ? Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO) : scale;
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

// Draws the video through the cat filter once per new camera frame while isOn() is true;
// isPlain() true draws it unfiltered and sharp. The human view goes through here too: the
// canvas crops the frame itself, while WebKit on some iPhones ignores object-fit: cover on a
// <video> and letterboxes it.
// Returns null without WebGL; onFail runs if drawing breaks later, so the caller can fall
// back to the CSS filter instead of leaving a black canvas over the camera. The same fallback
// is the last step for a phone that stays slow even with the light filter.
export function startCatView(canvas, video, { isOn, isPlain = () => false, onFail }) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false });
  if (!gl) return null;
  let uniforms;
  let failed = false;
  let level = 0;
  let look = null;
  const governor = createGovernor();
  try {
    uniforms = setUp(gl);
  } catch (error) {
    console.warn('Cat view shader failed', error);
    return null;
  }

  function fail(error) {
    if (failed) return;
    failed = true;
    console.warn('Cat view stopped', error);
    onFail();
  }

  // iOS drops WebGL contexts of apps sent to the background; restoring keeps the filter
  // alive after a trip to the gallery.
  canvas.addEventListener('webglcontextlost', (event) => event.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => {
    try {
      uniforms = setUp(gl);
      look = null;
    } catch (error) {
      fail(error);
    }
  });

  // Returns true when the canvas holds the current frame. `full` draws at the screen's own
  // resolution with the full filter: the saved photo is made from this canvas.
  function render({ full = false } = {}) {
    if (failed || gl.isContextLost() || video.readyState < HAVE_CURRENT_DATA) return false;
    const frame = videoFrame(video);
    const rect = canvas.getBoundingClientRect();
    const source = visibleSource(rect, frame);
    if (!source) return false;
    const plain = isPlain() && !full;
    const light = plain || (level >= 1 && !full);
    try {
      if (look !== plain) {
        applyLook(gl, uniforms, plain);
        look = plain;
      }
      // The plain view is not blurred, so it needs the screen's own sharpness.
      fitCanvas(canvas, rect, full || plain ? 1 : RENDER_SCALE[Math.min(level, RENDER_SCALE.length - 1)]);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
      gl.uniform1f(uniforms.lite, light ? 1 : 0);
      gl.uniform4f(uniforms.source, source.sx / frame.width, source.sy / frame.height, source.sw / frame.width, source.sh / frame.height);
      // One CSS pixel on screen covers sw / rect.width video pixels.
      const step = (CAT_BLUR_PX * source.sw) / rect.width;
      gl.uniform2f(uniforms.texel, step / frame.width, step / frame.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return true;
    } catch (error) {
      fail(error);
      return false;
    }
  }

  // iOS may pause a video it considers hidden; the filter would then show one still frame.
  let lastPlayTry = 0;
  function keepPlaying(now) {
    if (!video.paused || now - lastPlayTry < PLAY_RETRY_MS) return;
    lastPlayTry = now;
    video.play().catch(() => {});
  }

  // The screen refreshes 60 times a second, the camera delivers 30 or fewer: drawing the same
  // camera frame twice only costs a texture upload and a full-screen pass.
  let lastVideoTime = null;
  function newCameraFrame() {
    const time = video.currentTime;
    // A source without a clock (not a real video) is drawn every time.
    if (typeof time !== 'number' || time !== lastVideoTime) {
      lastVideoTime = time;
      return true;
    }
    return false;
  }

  function stepDown(next) {
    level = next;
    console.warn(`Cat view is slow, quality: ${QUALITY_NAMES[next]}`);
    // The last step leaves WebGL: the plain CSS filter is cheaper for the compositor.
    if (next >= RENDER_SCALE.length) fail(new Error('too slow even with the light filter'));
  }

  function loop(now) {
    if (failed) return;
    if (isOn() && !document.hidden) {
      keepPlaying(now);
      const dropped = governor.frame(now);
      if (dropped !== null) stepDown(dropped);
      if (!failed && newCameraFrame()) render();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  return { render, stats: () => ({ fps: governor.fps, level }) };
}
