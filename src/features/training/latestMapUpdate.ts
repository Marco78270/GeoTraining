export function createLatestMapUpdateGuard() {
  let version = 0;

  return {
    begin() {
      const updateVersion = ++version;
      return {
        isCurrent: () => updateVersion === version,
      };
    },
    invalidate() {
      version += 1;
    },
  };
}
