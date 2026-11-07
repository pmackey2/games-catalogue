import { readFile, readdir, mkdir, writeFile, copyFile, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifest, validateCatalogue } from "./manifest.mjs";
import { mergeCatalogue } from "./catalogue-merge.mjs";
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function validateEntry(entry, id) {
  if (!entry || Object.keys(entry).some((key) => !["game", "cover"].includes(key)))
    throw Error("Unexpected catalogue entry fields");
  const game = validateManifest(entry.game);
  if (game.id !== id || !game.releases?.length) throw Error("Entry identity/release mismatch");
  if (entry.cover) {
    const cover = entry.cover;
    if (Object.keys(cover).some((key) => !["path", "sha256", "alt"].includes(key)) ||
        !/^[a-f0-9]{64}$/.test(cover.sha256 || "") ||
        !new RegExp("^artwork/" + id + "/" + cover.sha256 + "\\.(png|jpg|webp)$").test(cover.path || "") ||
        typeof cover.alt !== "string" || !cover.alt.trim() || cover.alt.length > 200)
      throw Error("Invalid cover metadata");
  }
  return entry;
}
export async function build(root, { checkHistory = false } = {}) {
  const files = (await readdir(path.join(root, "entries"))).sort();
  if (files.length > 100) throw Error("Catalogue supports at most 100 games");
  const games = [], covers = {};
  for (const file of files) {
    if (!/^[a-z][a-z0-9-]{0,47}\.json$/.test(file)) throw Error("Invalid catalogue entry filename");
    const id = file.slice(0, -5), entryFile = path.join(root, "entries", file);
    const info = await lstat(entryFile);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 65536) throw Error("Invalid catalogue entry file");
    const entry = validateEntry(JSON.parse(await readFile(entryFile, "utf8")), id);
    if (checkHistory) {
      const old = spawnSync("git", ["show", "HEAD^:entries/" + file], { cwd: root, encoding: "utf8" });
      if (old.status === 0) {
        const previous = validateEntry(JSON.parse(old.stdout), id);
        const merged = mergeCatalogue([previous.game], [entry.game])[0];
        if (merged.version !== entry.game.version || merged.releases.length !== entry.game.releases.length)
          throw Error("Catalogue must retain prior pins and recommendations");
      }
    }
    games.push(entry.game);
    if (entry.cover) {
      const source = path.join(root, entry.cover.path);
      const info = await lstat(source);
      if (!info.isFile() || info.isSymbolicLink() || !info.size || info.size > 8 * 1024 * 1024)
        throw Error("Invalid cover image file");
      const bytes = await readFile(source);
      if (sha256(bytes) !== entry.cover.sha256) throw Error("Cover checksum mismatch");
      const destination = path.join(root, "dist", entry.cover.path);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(source, destination);
      covers[id] = entry.cover;
    }
  }
  validateCatalogue(games);
  if (checkHistory) {
    const oldFiles = spawnSync("git", ["ls-tree", "--name-only", "HEAD^", "entries/"], { cwd: root, encoding: "utf8" });
    if (oldFiles.status === 0 && oldFiles.stdout.trim().split("\n").filter(Boolean).some((f) => !files.includes(f.slice("entries/".length))))
      throw Error("Do not remove registered games from the catalogue");
  }
  const output = JSON.stringify({ schemaVersion: 1, games, covers }, null, 2) + "\n";
  if (Buffer.byteLength(output) > 1024 * 1024) throw Error("Aggregate catalogue exceeds 1 MiB");
  await mkdir(path.join(root, "dist"), { recursive: true });
  await writeFile(path.join(root, "dist", "catalogue.json"), output);
  await writeFile(path.join(root, "dist", ".nojekyll"), "");
  const escape = (value) => value.replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  await writeFile(path.join(root, "dist", "index.html"),
    "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>Games catalogue</title><style>body{font:18px system-ui;max-width:760px;margin:4rem auto;padding:1rem;background:#10151c;color:#e7edf5}a{color:#91c7ff}li{margin:1.5rem 0}</style><h1>Games catalogue</h1><p>Public release information and artwork. Game downloads remain private.</p><p><a href=\"catalogue.json\">Download the catalogue JSON</a></p><ul>" +
    games.map((game) => "<li><strong>" + escape(game.title) + "</strong> " + escape(game.version) + "<br>" + escape(game.description) + "</li>").join("") + "</ul></html>");
  return { games, covers };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log("Built", (await build(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), { checkHistory: process.argv.includes("--check-history") })).games.length, "games");
