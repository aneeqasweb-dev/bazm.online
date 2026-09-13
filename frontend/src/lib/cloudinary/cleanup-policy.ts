export function removedMediaPaths(
  previous: Array<{ path: string }>,
  next: Array<{ path: string }>,
) {
  const nextPaths = new Set(next.map((item) => item.path));
  return previous
    .map((item) => item.path)
    .filter((path) => !nextPaths.has(path));
}
