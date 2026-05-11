import { describe, expect, it, vi } from "vitest";

import { createLatestAsyncRunner } from "./latestAsyncRunner";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("createLatestAsyncRunner", () => {
  it("applies a single request result", async () => {
    const applied: string[] = [];
    const runner = createLatestAsyncRunner(
      async () => "saved",
      (value) => {
        applied.push(value);
      },
    );

    await expect(runner.run()).resolves.toBe(true);
    expect(applied).toEqual(["saved"]);
  });

  it("ignores older completions after a newer refresh wins", async () => {
    const first = deferred<Set<string>>();
    const second = deferred<Set<string>>();
    const applied: string[][] = [];

    const load = vi.fn<() => Promise<Set<string>>>();
    load.mockReturnValueOnce(first.promise);
    load.mockReturnValueOnce(second.promise);

    const runner = createLatestAsyncRunner(load, (value) => {
      applied.push(Array.from(value).sort());
    });

    const firstRun = runner.run();
    const secondRun = runner.run();

    second.resolve(new Set(["20"]));
    await expect(secondRun).resolves.toBe(true);

    first.resolve(new Set(["10"]));
    await expect(firstRun).resolves.toBe(false);

    expect(applied).toEqual([["20"]]);
  });

  it("invalidates an older in-flight request after a newer state update", async () => {
    const pending = deferred<Set<string>>();
    const applied: string[][] = [];
    const runner = createLatestAsyncRunner(
      () => pending.promise,
      (value) => {
        applied.push(Array.from(value).sort());
      },
    );

    const resync = runner.run();
    runner.invalidate();

    pending.resolve(new Set(["10"]));
    await expect(resync).resolves.toBe(false);
    expect(applied).toEqual([]);
  });
});
