import { CAT_BLUR_PX, CAT_MATRIX, CAT_VIGNETTE } from './logic/catVision.js';
import { videoFrame, visibleSource } from './logic/coverMap.js';

// The live filter is drawn with WebGL because WebKit on iPhone ignores an SVG filter on
// <video>: the colour matrix silently did nothing there, only the blur showed.
const MAX_PIXEL_RATIO = 2;
const HAVE_CURRENT_DATA = 2;
const PLAY_RETRY_MS = 1000;

const VERTEX = `
attribute vec2 position;
uniform vec4 source;
varying vec2 uv;
varying vec2 unit;
void main() {
  unit = vec2(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
  uv = source.xy + unit * source.zw;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

// A 3x3 Gaussian at a distance of `texel`, then the colour matrix, then a soft vignette.
const FRAGMENT = `
precision mediump float;
uniform sampler2D frame;
uniform mat3 matrix;
uniform vec2 texel;
uniform float vignette;
varying vec2 uv;
varying vec2 unit;
vec3 at(vec2 offset) { return texture2D(frame, uv + offset * texel).rgb; }
void main() {
  vec3 color = at(vec2(0.0)) * 4.0
    + (at(vec2(1.0, 0.0)) + at(vec2(-1.0, 0.0)) + at(vec2(0.0, 1.0)) + at(vec2(0.0, -1.0))) * 2.0
    + at(vec2(1.0, 1.0)) + at(vec2(-1.0, -1.0)) + at(vec2(1.0, -1.0)) + at(vec2(-1.0, 1.0));
  color = clamp(matrix * (color / 16.0), 0.0, 1.0);
  color *= 1.0 - vignette * smoothstep(0.35, 0.75, distance(unit, vec2(0.5)));
  gl_FragColor = vec4(color, 1.0);
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
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  gl.uniformMatrix3fv(gl.getUniformLocation(program, 'matrix'), false, columns(CAT_MATRIX));
  gl.uniform1f(gl.getUniformLocation(program, 'vignette'), CAT_VIGNETTE);
  return {
    source: gl.getUniformLocation(program, 'source'),
    texel: gl.getUniformLocation(program, 'texel'),
  };
}

function fitCanvas(canvas, rect) {
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  const width = Math.round(rect.width * ratio);
  const height = Math.round(rect.height * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

// Draws the video through the cat filter on every animation frame while isOn() is true.
// Returns null without WebGL; onFail runs if drawing breaks later, so the caller can fall
// back to the CSS filter instead of leaving a black canvas over the camera.
export function startCatView(canvas, video, { isOn, onFail }) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false });
  if (!gl) return null;
  let uniforms;
  let failed = false;
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
    } catch (error) {
      fail(error);
    }
  });

  // Returns true when the canvas holds the current frame.
  function render() {
    if (failed || gl.isContextLost() || video.readyState < HAVE_CURRENT_DATA) return false;
    const frame = videoFrame(video);
    const rect = canvas.getBoundingClientRect();
    const source = visibleSource(rect, frame);
    if (!source) return false;
    try {
      fitCanvas(canvas, rect);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
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

  function loop(now) {
    if (failed) return;
    if (isOn() && !document.hidden) {
      keepPlaying(now);
      render();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  return { render };
}
