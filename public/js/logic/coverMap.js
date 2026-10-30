function clamp(value, max) {
  return Math.min(max, Math.max(0, value));
}

// Not track.getSettings(): on iPhone the settings disagree with the current orientation.
export function videoFrame(video) {
  return { width: video.videoWidth, height: video.videoHeight };
}

// Matches CSS object-fit: cover. view and video are { width, height }.
export function coverTransform(view, video) {
  if (!view.width || !view.height || !video.width || !video.height) return null;
  const scale = Math.max(view.width / video.width, view.height / video.height);
  return {
    scale,
    offsetX: (view.width - video.width * scale) / 2,
    offsetY: (view.height - video.height * scale) / 2,
  };
}

export function screenToVideo(point, view, video) {
  const transform = coverTransform(view, video);
  if (!transform) return null;
  const { scale, offsetX, offsetY } = transform;
  return {
    x: clamp((point.x - offsetX) / scale, video.width),
    y: clamp((point.y - offsetY) / scale, video.height),
  };
}

export function videoToScreen([x, y, width, height], view, video) {
  const transform = coverTransform(view, video);
  if (!transform) return null;
  const { scale, offsetX, offsetY } = transform;
  return [x * scale + offsetX, y * scale + offsetY, width * scale, height * scale];
}

// The part of the frame that object-fit: cover leaves on screen, in video pixels.
export function visibleSource(view, video) {
  const transform = coverTransform(view, video);
  if (!transform) return null;
  const sw = view.width / transform.scale;
  const sh = view.height / transform.scale;
  return { sx: (video.width - sw) / 2, sy: (video.height - sh) / 2, sw, sh };
}
