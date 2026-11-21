export interface LoadCache<V> {
  /** The promise for a key, starting the load the first time it is asked for. */
  get(key: string, load: () => Promise<V>): Promise<V>;
  /**
   * The value, if its load has already finished. Lets a newly mounted
   * component use a ready value without suspending: React's use() suspends
   * once on a promise it has not seen before, even a resolved one, and then
   * holds the loading state for about 300 ms.
   */
  peek(key: string): V | undefined;
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
  const values = new Map<string, V>();
  const failed = new Set<string>();
  return {
    get(key, load) {
      const cached = promises.get(key);
      if (cached !== undefined) return cached;
      const promise = load();
      promises.set(key, promise);
      promise.then(
        (value) => {
          if (promises.get(key) === promise) values.set(key, value);
        },
        () => {
          if (promises.get(key) === promise) failed.add(key);
        },
      );
      return promise;
    },
    peek(key) {
      return values.get(key);
    },
    forgetFailures() {
      for (const key of failed) promises.delete(key);
      failed.clear();
    },
  };
}
