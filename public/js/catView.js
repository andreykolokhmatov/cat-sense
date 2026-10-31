import { CAT_BLUR_PX, CAT_MATRIX, CAT_MOTION, CAT_NIGHT, CAT_VIGNETTE } from './logic/catVision.js';
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
// A reference older than this is from before a pause, and comparing with it would glow everywhere.
const STALE_REFERENCE_MS = 1000;

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

// A 3x3 Gaussian at a distance of `texel`, the colour matrix, shadows lifted for night vision,
// a yellow glow where the picture moved, then a soft vignette.
const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D frame;
uniform sampler2D previous;
uniform mat3 matrix;
uniform vec2 texel;
uniform float vignette;
uniform float night;
uniform float motion;
uniform float threshold;
uniform vec2 seed;
uniform float lite;
varying vec2 uv;
varying vec2 unit;
vec3 blur3(sampler2D image) {
  return (texture2D(image, uv).rgb * 4.0
    + (texture2D(image, uv + vec2(texel.x, 0.0)).rgb + texture2D(image, uv - vec2(texel.x, 0.0)).rgb
      + texture2D(image, uv + vec2(0.0, texel.y)).rgb + texture2D(image, uv - vec2(0.0, texel.y)).rgb) * 2.0
    + texture2D(image, uv + texel).rgb + texture2D(image, uv - texel).rgb
    + texture2D(image, uv + vec2(texel.x, -texel.y)).rgb + texture2D(image, uv + vec2(-texel.x, texel.y)).rgb) / 16.0;
}
float noise(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  // The light filter: colour matrix and vignette from one texture read. The blur comes from
  // the low render resolution being stretched.
  if (lite > 0.5) {
    vec3 plain = clamp(matrix * texture2D(frame, uv).rgb, 0.0, 1.0);
    plain *= 1.0 - vignette * smoothstep(0.35, 0.75, distance(unit, vec2(0.5)));
    gl_FragColor = vec4(plain, 1.0);
    return;
  }
  vec3 now = blur3(frame);
  vec3 color = clamp(matrix * now, 0.0, 1.0);

  // Shadows only: a gamma curve blended in by how dark the pixel is, with grain like a dim
  // room on a camera, so a lifted shadow does not look flat.
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float dark = night * (1.0 - smoothstep(0.15, 0.7, luma));
  color = mix(color, pow(color, vec3(0.55)), dark);
  color += (noise(unit * vec2(521.0, 613.0) + seed * 100.0) - 0.5) * 0.07 * dark;

  float change = distance(now, blur3(previous));
  float moved = motion * smoothstep(threshold, threshold + 0.18, change);
  color = mix(color, vec3(1.0, 0.88, 0.4), moved * 0.7);

  color *= 1.0 - vignette * smoothstep(0.35, 0.75, distance(unit, vec2(0.5)));
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

  // Unit 0 holds the current frame, unit 1 the one from a moment ago, for the motion glow.
  const textures = [gl.TEXTURE0, gl.TEXTURE1].map((unit) => {
    gl.activeTexture(unit);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // A camera frame is not a power of two: WebGL 1 then needs clamping and no mipmaps.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  });
  gl.uniform1i(gl.getUniformLocation(program, 'frame'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'previous'), 1);

  gl.uniformMatrix3fv(gl.getUniformLocation(program, 'matrix'), false, columns(CAT_MATRIX));
  gl.uniform1f(gl.getUniformLocation(program, 'vignette'), CAT_VIGNETTE);
  gl.uniform1f(gl.getUniformLocation(program, 'night'), CAT_NIGHT);
  gl.uniform1f(gl.getUniformLocation(program, 'motion'), CAT_MOTION.strength);
  gl.uniform1f(gl.getUniformLocation(program, 'threshold'), CAT_MOTION.threshold);
  return {
    source: gl.getUniformLocation(program, 'source'),
    texel: gl.getUniformLocation(program, 'texel'),
    seed: gl.getUniformLocation(program, 'seed'),
    lite: gl.getUniformLocation(program, 'lite'),
    textures,
  };
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

// Draws the video through the cat filter once per new camera frame while isOn() is true.
// Returns null without WebGL; onFail runs if drawing breaks later, so the caller can fall
// back to the CSS filter instead of leaving a black canvas over the camera. The same fallback
// is the last step for a phone that stays slow even with the light filter.
export function startCatView(canvas, video, { isOn, onFail }) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false });
  if (!gl) return null;
  let uniforms;
  let failed = false;
  let level = 0;
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
      hasReference = false;
    } catch (error) {
      fail(error);
    }
  });

  // The picture the motion glow compares against, refreshed every CAT_MOTION.lagMs. Without
  // one (first frame, after the app was in the background) the current frame stands in, so
  // the whole picture does not flash as "moved".
  let referenceAt = -Infinity;
  let hasReference = false;
  function uploadReference(now) {
    gl.activeTexture(gl.TEXTURE1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
    gl.activeTexture(gl.TEXTURE0);
    referenceAt = now;
    hasReference = true;
  }

  // Returns true when the canvas holds the current frame. `full` draws at the screen's own
  // resolution with the full filter: the saved photo is made from this canvas.
  function render({ full = false } = {}) {
    if (failed || gl.isContextLost() || video.readyState < HAVE_CURRENT_DATA) return false;
    const frame = videoFrame(video);
    const rect = canvas.getBoundingClientRect();
    const source = visibleSource(rect, frame);
    if (!source) return false;
    const light = level >= 1 && !full;
    try {
      fitCanvas(canvas, rect, full ? 1 : RENDER_SCALE[Math.min(level, RENDER_SCALE.length - 1)]);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
      const now = performance.now();
      gl.uniform1f(uniforms.lite, light ? 1 : 0);
      if (!light && (!hasReference || now - referenceAt > STALE_REFERENCE_MS)) uploadReference(now);
      gl.uniform2f(uniforms.seed, Math.random(), Math.random());
      gl.uniform4f(uniforms.source, source.sx / frame.width, source.sy / frame.height, source.sw / frame.width, source.sh / frame.height);
      // One CSS pixel on screen covers sw / rect.width video pixels.
      const step = (CAT_BLUR_PX * source.sw) / rect.width;
      gl.uniform2f(uniforms.texel, step / frame.width, step / frame.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      // After the draw: this frame becomes the reference only for the frames that follow.
      if (!light && now - referenceAt >= CAT_MOTION.lagMs) uploadReference(now);
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
