// Worst-case stand-in for next/cache: once a key is stored it is served
// forever, like an entry whose background refresh keeps failing. Any
// time-bearing read wrapped in unstable_cache would therefore go stale here.
const store = new Map();
export const cachedKeys = [];

export function unstable_cache(fn, keyParts = []) {
  return async (...args) => {
    const key = JSON.stringify(keyParts);
    cachedKeys.push(keyParts[0]);

    if (!store.has(key)) {
      store.set(key, await fn(...args));
    }

    return store.get(key);
  };
}

export function revalidatePath() {}
export function revalidateTag() {}
