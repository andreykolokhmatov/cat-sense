// The value of `promise`, or `fallback` once `ms` pass or it rejects, whichever comes first.
// For waits that must not hang the caller when a promise never settles.
export function withTimeout(promise, ms, fallback) {
  let timer;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  const settled = Promise.resolve(promise).catch(() => fallback);
  return Promise.race([settled, late]).finally(() => clearTimeout(timer));
}
