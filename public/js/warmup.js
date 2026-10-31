// The first call to a serverless function after a pause pays for its cold start, and a new
// connection pays for the handshake: a second or more on top of the model, exactly on the
// first tap. A GET to /api/ask is answered with 405 right away and costs no model quota, but
// it wakes the same function and opens the connection the real POST will reuse.
const WARM_URL = '/api/ask';
// Functions go cold after some idle minutes; a stand keeps one page open for hours.
const REPEAT_MS = 4 * 60 * 1000;

let timer = null;

function ping() {
  if (document.hidden) return;
  fetch(WARM_URL, { method: 'GET', cache: 'no-store' }).catch(() => {});
}

export function startWarmup() {
  if (timer) return;
  ping();
  timer = setInterval(ping, REPEAT_MS);
  // Back from the background after a long time: the function may have gone cold meanwhile.
  document.addEventListener('visibilitychange', ping);
}
