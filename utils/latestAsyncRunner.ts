export function createLatestAsyncRunner<T>(
  load: () => Promise<T>,
  apply: (value: T) => void,
): {
  invalidate: () => void;
  run: () => Promise<boolean>;
} {
  let latestRequestId = 0;

  return {
    invalidate: () => {
      latestRequestId += 1;
    },
    run: async () => {
      const requestId = ++latestRequestId;
      const value = await load();
      if (requestId !== latestRequestId) return false;

      apply(value);
      return true;
    },
  };
}
