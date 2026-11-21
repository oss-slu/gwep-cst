export interface LoadCache<V> {
  /** The promise for a key, starting the load the first time it is asked for. */
  get(key: string, load: () => Promise<V>): Promise<V>;
  /** Forgets loads that failed, so the next get() starts them again. */
  readonly forgetFailures: () => void;
}

/**
 * Remembers one promise per key, so every render that asks for the same thing
 * gets the same promise, as React's use() requires. A failed load is kept
 * (React renders once more after an error, and must see the same failure)
 * until forgetFailures() is called when the user chooses to try again.
 */
export function createLoadCache<V>(): LoadCache<V> {
  const promises = new Map<string, Promise<V>>();
  const failed = new Set<string>();
  return {
    get(key, load) {
      const cached = promises.get(key);
      if (cached !== undefined) return cached;
      const promise = load();
      promises.set(key, promise);
      promise.catch(() => {
        if (promises.get(key) === promise) failed.add(key);
      });
      return promise;
    },
    forgetFailures() {
      for (const key of failed) promises.delete(key);
      failed.clear();
    },
  };
}
