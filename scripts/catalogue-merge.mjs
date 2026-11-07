import { validateCatalogue } from "./manifest.mjs";
import { compareVersions } from "./versions.mjs";
export function repositoryName(game) {
  return game.source.repository.replace(/^https:\/\/github\.com\/|^git@github\.com:/, "").replace(/\.git$/, "");
}
// Remote metadata cannot enroll new executable games or change a trusted identity.
export function mergeCatalogue(current, incoming, { allowRegistration = false } = {}) {
  validateCatalogue(current);
  validateCatalogue(incoming);
  const result = structuredClone(current);
  for (const next of incoming) {
    const index = result.findIndex((game) => game.id === next.id);
    if (index < 0) {
      if (!allowRegistration) throw Error("Remote catalogue contains an unenrolled game");
      if (!/^[a-f0-9]{40}$/.test(next.source.ref) || !next.releases?.length)
        throw Error("New remote game needs pinned releases and source");
      for (const release of next.releases)
        if (release.file || !release.url?.startsWith("https://api.github.com/repos/" + repositoryName(next) + "/releases/assets/"))
          throw Error("New remote release must belong to its trusted repository");
      result.push(structuredClone(next));
      continue;
    }
    const prior = result[index];
    if (repositoryName(prior) !== repositoryName(next) ||
        prior.entry !== next.entry || prior.browserStoragePrefix !== next.browserStoragePrefix)
      throw Error("Remote catalogue changed a trusted game identity");
    const releases = structuredClone(prior.releases || []);
    for (const release of next.releases || []) {
      const old = releases.find((r) => r.version === release.version);
      if (old && old.sha256 !== release.sha256)
        throw Error("Version already exists with a different hash; publish a new version");
      if (!old) {
        if (release.file || !release.url?.startsWith("https://api.github.com/repos/" + repositoryName(prior) + "/releases/assets/"))
          throw Error("New remote release must belong to its trusted repository");
        releases.push(structuredClone(release));
      }
    }
    if (compareVersions(next.version, prior.version) > 0) {
      if (!/^[a-f0-9]{40}$/.test(next.source.ref))
        throw Error("New remote version needs a pinned source commit");
      result[index] = { ...structuredClone(next), releases };
    } else result[index] = { ...prior, releases };
  }
  return validateCatalogue(result);
}
