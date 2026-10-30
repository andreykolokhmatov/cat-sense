const CONSTRAINTS = {
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false,
};
const UNSUPPORTED_MESSAGE = 'Камера здесь не работает. Нужен HTTPS и браузер с камерой.';
const DENIED_MESSAGE = 'Мне не дали камеру. Разреши её и нажми кнопку ещё раз.';
const FAILED_MESSAGE = 'Камера не включилась. Нажми кнопку ещё раз.';

function resumeWhenVisible(video) {
  if (document.hidden) return;
  // Autoplay rules may refuse here. The stream stays attached, so there is nothing to recover.
  video.play().catch(() => {});
}

// Returns null when the video plays, otherwise a message for the cat to say.
export async function startCamera(video) {
  if (!window.isSecureContext || !navigator.mediaDevices) return UNSUPPORTED_MESSAGE;
  try {
    video.srcObject = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
    await video.play();
  } catch (error) {
    return error.name === 'NotAllowedError' ? DENIED_MESSAGE : FAILED_MESSAGE;
  }
  document.addEventListener('visibilitychange', () => resumeWhenVisible(video));
  return null;
}
