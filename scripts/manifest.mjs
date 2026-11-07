import path from "node:path";
export function safePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 240 &&
    !value.includes("\\") &&
    !value.includes(":") &&
    !value.includes("\0") &&
    !value.startsWith("/") &&
    value
      .split("/")
      .every((p) => p && p !== "." && p !== ".." && !p.startsWith("."))
  );
}
export function validateManifest(m) {
  const fail = (message) => {
    throw Error(`Invalid game manifest: ${message}`);
  };
  if (!m || Array.isArray(m) || typeof m !== "object") fail("object required");
  const fields = [
    "specVersion",
    "id",
    "title",
    "description",
    "artwork",
    "version",
    "category",
    "tags",
    "entry",
    "source",
    "build",
    "browserStoragePrefix",
    "controls",
    "releases",
  ];
  if (Object.keys(m).some((k) => !fields.includes(k))) fail("unknown field");
  if (m.specVersion !== 1) fail("specVersion must be 1");
  if (typeof m.id !== "string" || !/^[a-z][a-z0-9-]{0,47}$/.test(m.id))
    fail("id");
  for (const [key, limit] of Object.entries({
    title: 80,
    description: 300,
    version: 40,
    category: 40,
    browserStoragePrefix: 80,
    controls: 500,
  }))
    if (typeof m[key] !== "string" || !m[key].trim() || m[key].length > limit)
      fail(key);
  if (
    !Array.isArray(m.tags) ||
    m.tags.length > 8 ||
    m.tags.some((t) => typeof t !== "string" || !t || t.length > 40)
  )
    fail("tags");
  if (!safePath(m.entry) || path.posix.extname(m.entry) !== ".html")
    fail("entry must be a relative HTML path");
  if (
    !m.source ||
    Object.keys(m.source).some((k) => !["repository", "ref"].includes(k)) ||
    !/^(https:\/\/github\.com\/|git@github\.com:)[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/.test(
      m.source.repository || "",
    ) ||
    typeof m.source.ref !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$/.test(m.source.ref) ||
    m.source.ref.includes("..")
  )
    fail("GitHub repository/ref");
  if (
    !m.build ||
    m.build.profile !== "static-copy" ||
    Object.keys(m.build).some((k) => !["profile", "files"].includes(k)) ||
    !Array.isArray(m.build.files) ||
    !m.build.files.length ||
    m.build.files.some((f) => !safePath(f))
  )
    fail("static-copy files");
  if (m.artwork !== undefined) {
    const art = m.artwork;
    if (!art || Array.isArray(art) || typeof art !== "object" ||
        Object.keys(art).some((key) => !["src", "alt"].includes(key)) ||
        !safePath(art.src) || !/\.(png|jpg|webp)$/.test(art.src) ||
        typeof art.alt !== "string" || !art.alt.trim() || art.alt.length > 200)
      fail("artwork requires a relative PNG, JPG or WebP and plain-text alt");
    if (!m.build.files.some((file) => art.src === file || art.src.startsWith(file + "/")))
      fail("artwork must be included in build.files");
  }
  if (!m.build.files.some((f) => m.entry === f || m.entry.startsWith(f + "/")))
    fail("entry must be included in build.files");
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?$/.test(m.version))
    fail("version must be semver");
  if (m.releases !== undefined) {
    if (
      !Array.isArray(m.releases) ||
      !m.releases.length ||
      m.releases.length > 100
    )
      fail("releases");
    for (const r of m.releases) {
      if (
        !r ||
        typeof r !== "object" ||
        Array.isArray(r) ||
        Object.keys(r).some(
          (k) => !["version", "sha256", "file", "url"].includes(k),
        ) ||
        typeof r.version !== "string" ||
        r.version.length > 40 ||
        !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?$/.test(r.version) ||
        typeof r.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(r.sha256)
      )
        fail("release version/hash");
      if (!!r.file === !!r.url) fail("release needs exactly one file or url");
      if (r.file && (!safePath(r.file) || !r.file.endsWith(".tgz")))
        fail("package file");
      if (
        r.url &&
        !/^https:\/\/(?:github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/releases\/download\/[^?#]+\.tgz|api\.github\.com\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/releases\/assets\/[0-9]+)$/.test(
          r.url,
        )
      )
        fail("package URL must be a GitHub release asset");
    }
    if (
      new Set(m.releases.map((r) => r.version)).size !== m.releases.length ||
      !m.releases.some((r) => r.version === m.version)
    )
      fail("duplicate or missing recommended release");
  }
  return m;
}
export function validateCatalogue(list) {
  if (!Array.isArray(list)) throw Error("Catalogue must be an array");
  list.forEach(validateManifest);
  if (new Set(list.map((m) => m.id)).size !== list.length)
    throw Error("Duplicate game id");
  return list;
}
