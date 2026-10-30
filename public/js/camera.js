const CONSTRAINTS = {
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false,
};
const UNSUPPORTED_MESSAGE = 'Камера здесь не работает. Нужен HTTPS и браузер с камерой.';
const DENIED_MESSAGE = 'Мне не дали камеру. Разреши её и нажми кнопку ещё раз.';
const FAILED_MESSAGE = 'Камера не включилась. Нажми кнопку ещё раз.';
// Time for the camera to wake up on its own after the page comes back.
const RESUME_CHECK_MS = 1000;

let stream = null;
let reopening = false;

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openStream(video) {
  stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
  video.srcObject = stream;
  await video.play();
}

// iOS takes the camera away when another app covers the page (the gallery after saving a
// photo). On return the track may have ended or stay muted, and play() alone shows black.
async function resumeWhenVisible(video) {
  if (document.hidden || reopening) return;
  // Autoplay rules may refuse here; the frame check below catches a video that stays dead.
  video.play().catch(() => {});
  const startedAt = video.currentTime;
  await pause(RESUME_CHECK_MS);
  if (document.hidden || reopening) return;

  const track = stream?.getVideoTracks()[0];
  const alive = track?.readyState === 'live' && !track.muted && video.currentTime !== startedAt;
  if (alive) return;

  reopening = true;
  try {
    stream?.getTracks().forEach((oldTrack) => oldTrack.stop());
    await openStream(video);
  } catch (error) {
    console.warn('The camera did not come back', error);
  } finally {
    reopening = false;
  }
}

// Returns null when the video plays, otherwise a message for the cat to say.
export async function startCamera(video) {
  if (!window.isSecureContext || !navigator.mediaDevices) return UNSUPPORTED_MESSAGE;
  try {
    await openStream(video);
  } catch (error) {
    return error.name === 'NotAllowedError' ? DENIED_MESSAGE : FAILED_MESSAGE;
  }
  document.addEventListener('visibilitychange', () => resumeWhenVisible(video));
  // Safari restores pages from its back-forward cache without a visibilitychange.
  window.addEventListener('pageshow', () => resumeWhenVisible(video));
  return null;
}
