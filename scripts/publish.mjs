import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifest } from "./manifest.mjs";
import { validateEntry, sha256 } from "./build.mjs";
import { mergeCatalogue } from "./catalogue-merge.mjs";

const target = "pmackey2/games-catalogue";
export async function publishCatalogue({ env = process.env, fetchImpl = globalThis.fetch, read = readFile } = {}) {
  const token = env.CATALOGUE_PUBLISH_TOKEN || "";
  if (!token) {
    console.log("::warning::Catalogue publication is not configured. Add CATALOGUE_PUBLISH_TOKEN; the private release remains available.");
    return { configured: false };
  }
  if (!/^[\x21-\x7e]+$/.test(token)) throw Error("Invalid catalogue credential");
  const directory = env.CATALOGUE_ENTRY_DIRECTORY;
  if (!directory) throw Error("Catalogue entry directory is required");
  const game = validateManifest(JSON.parse(await read(path.join(directory, "catalogue-entry.json"), "utf8")));
  if (game.source.repository !== "https://github.com/" + env.GITHUB_REPOSITORY + ".git" ||
      game.source.ref !== (env.CATALOGUE_SOURCE_COMMIT || env.GITHUB_SHA) || !/^[a-f0-9]{40}$/.test(game.source.ref) ||
      (!env.CATALOGUE_SOURCE_TAG && env.GITHUB_REF_TYPE !== "tag") || (env.CATALOGUE_SOURCE_TAG || env.GITHUB_REF_NAME) !== "v" + game.version)
    throw Error("Catalogue provenance does not match this version-tag workflow");
  if (game.version.includes("-")) return { configured: true, prerelease: true };
  if (game.releases?.length !== 1 || game.releases[0].version !== game.version ||
      !new RegExp("^https://api\\.github\\.com/repos/" + env.GITHUB_REPOSITORY.replace(/[.*+?^$()|[\]\\]/g, "\\$&") + "/releases/assets/[0-9]+$").test(game.releases[0].url || ""))
    throw Error("Catalogue must reference this game's published private asset");
  const filename = game.id + "-" + game.version + ".tgz";
  const archive = await read(path.join(directory, filename));
  if (archive.length > 64 * 1024 * 1024 || sha256(archive) !== game.releases[0].sha256 ||
      await read(path.join(directory, filename + ".sha256"), "utf8") !== game.releases[0].sha256 + "  " + filename + "\n")
    throw Error("Published archive does not match the catalogue checksum");
  let cover, coverBytes;
  if (game.artwork) {
    const ext = path.posix.extname(game.artwork.src);
    try { coverBytes = await read(path.join(directory, "catalogue-cover" + ext)); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      // Only read the validated image entry, never unpack or execute game code.
      const extraction = spawnSync("tar", ["-xOf", path.resolve(directory, filename), "public/" + game.artwork.src],
        { maxBuffer: 8 * 1024 * 1024, windowsHide: true, timeout: 30000 });
      if (extraction.status !== 0 || extraction.error) throw Error("Unable to read bounded catalogue cover from the package");
      coverBytes = extraction.stdout;
    }
    if (!coverBytes.length || coverBytes.length > 8 * 1024 * 1024) throw Error("Invalid catalogue cover size");
    const hash = sha256(coverBytes);
    cover = { path: "artwork/" + game.id + "/" + hash + ext, sha256: hash, alt: game.artwork.alt };
  }
  async function api(endpoint, method = "GET", body, allow404 = false) {
    let response;
    try {
      response = await fetchImpl("https://api.github.com/repos/" + target + endpoint, {
        method, redirect: "error", signal: AbortSignal.timeout(30000),
        headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + token,
          "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch { throw Error("Catalogue GitHub request failed; no credentials or upstream details are logged"); }
    if (allow404 && response.status === 404) return null;
    if (!response.ok) {
      await response.body?.cancel();
      throw Object.assign(Error("Catalogue GitHub request failed (" + response.status + ")"), { status: response.status });
    }
    return response.json();
  }
  // Optimistic, non-force Git ref updates: retries rebuild on the latest tree.
  // This prevents simultaneous releases of different games from losing updates.
  for (let attempt = 0; attempt < 5; attempt++) {
    const head = (await api("/git/ref/heads/main")).object.sha;
    const commit = await api("/git/commits/" + head);
    const location = "/contents/entries/" + game.id + ".json?ref=" + head;
    const previousFile = await api(location, "GET", undefined, true);
    const previous = previousFile && validateEntry(JSON.parse(Buffer.from(previousFile.content, "base64").toString("utf8")), game.id);
    const merged = mergeCatalogue(previous ? [previous.game] : [], [game], { allowRegistration: true })[0];
    const entry = { game: merged };
    // A late old release must not replace newer artwork either.
    if (merged.version === game.version && cover) entry.cover = cover;
    else if (previous?.cover) entry.cover = previous.cover;
    validateEntry(entry, game.id);
    const content = JSON.stringify(entry, null, 2) + "\n";
    if (previousFile && content === Buffer.from(previousFile.content, "base64").toString("utf8"))
      return { configured: true, unchanged: true, version: merged.version };
    const tree = [{ path: "entries/" + game.id + ".json", mode: "100644", type: "blob", content }];
    if (entry.cover === cover && coverBytes) {
      const blob = await api("/git/blobs", "POST", { encoding: "base64", content: coverBytes.toString("base64") });
      tree.push({ path: cover.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const createdTree = await api("/git/trees", "POST", { base_tree: commit.tree.sha, tree });
    const created = await api("/git/commits", "POST", {
      message: "Update " + game.id + " catalogue to " + game.version,
      tree: createdTree.sha, parents: [head],
    });
    try {
      await api("/git/refs/heads/main", "PATCH", { sha: created.sha, force: false });
      return { configured: true, commit: created.sha, version: merged.version };
    } catch (error) {
      if (![409, 422].includes(error.status) || attempt === 4) throw error;
      // A protection-rule rejection is not bypassed. It will fail after bounded retries.
    }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(await publishCatalogue()));
