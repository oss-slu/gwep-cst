import { describe, expect, it, vi } from "vitest";
import { createLoadCache } from "./load-cache.ts";

describe("load cache", () => {
  it("starts each load once and returns the same promise", async () => {
    const cache = createLoadCache<string>();
    const load = vi.fn(() => Promise.resolve("value"));
    const first = cache.get("a", load);
    expect(cache.get("a", load)).toBe(first);
    await expect(first).resolves.toBe("value");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps a failure until forgetFailures, then loads again", async () => {
    const cache = createLoadCache<string>();
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue("value");
    const failed = cache.get("a", load);
    await expect(failed).rejects.toThrow("offline");
    expect(cache.get("a", load)).toBe(failed);

    cache.forgetFailures();
    await expect(cache.get("a", load)).resolves.toBe("value");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("forgetFailures keeps successful loads", async () => {
    const cache = createLoadCache<string>();
    const kept = cache.get("a", () => Promise.resolve("value"));
    await kept;
    cache.forgetFailures();
    expect(cache.get("a", () => Promise.resolve("other"))).toBe(kept);
  });

  it("peek gives a finished value, and nothing while loading or after a failure", async () => {
    const cache = createLoadCache<string>();
    let resolve: (value: string) => void = () => undefined;
    const pending = cache.get(
      "a",
      () => new Promise((done) => (resolve = done)),
    );
    expect(cache.peek("a")).toBeUndefined();
    resolve("value");
    await pending;
    expect(cache.peek("a")).toBe("value");

    const failed = cache.get("b", () => Promise.reject(new Error("offline")));
    await expect(failed).rejects.toThrow("offline");
    expect(cache.peek("b")).toBeUndefined();
  });
});
