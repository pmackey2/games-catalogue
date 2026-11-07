// Compare catalogue versions without numeric precision loss. Stable releases sort
// after prereleases; numeric prerelease identifiers sort before text identifiers.
export function compareVersions(left, right) {
  const parse = (value) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?$/.exec(value);
    if (!match) throw Error("Invalid version");
    return { core: match.slice(1, 4).map(BigInt), pre: match[4]?.split(".") };
  };
  const a = parse(left), b = parse(right);
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i] ? 1 : -1;
  }
  if (!a.pre || !b.pre) return a.pre ? -1 : b.pre ? 1 : 0;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i];
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn && yn) {
      if (BigInt(x) === BigInt(y)) continue;
      return BigInt(x) > BigInt(y) ? 1 : -1;
    }
    if (xn !== yn) return xn ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}
