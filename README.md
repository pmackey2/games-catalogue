# Games catalogue

Public release metadata and cover artwork for Games Portal. Private game source
repositories and package archives are not published here.

- Catalogue: https://pmackey2.github.io/games-catalogue/catalogue.json
- Per-game source: entries/<id>.json
- Immutable artwork: artwork/<id>/<sha256>.<png|jpg|webp>
- Build: npm test && npm run build
- Pages publishes only the validated dist directory, on pushes to main.

## Register a game and update it on release

A tested private game release supplies game.json metadata, a full source commit,
an immutable version, an exact private GitHub API asset URL and SHA-256. It also supplies optional artwork inside the package (or a standalone catalogue-cover image). Its release job calls this
repository's pinned composite action .github/actions/publish.

The first release creates entries/<id>.json. Later releases update descriptions,
controls, version and cover while retaining old version/hash records. Existing
IDs cannot change source repository, HTML entry or browser-storage namespace.
Do not reuse a version for different package bytes. Late older releases cannot
downgrade the recommendation. Prereleases do not become recommended automatically.

The publisher commits the entry and artwork together through the Git data API.
Non-force ref updates retry on a refreshed tree after concurrent publication.
There are no arbitrary paths, shell commands, repository URLs or credentials in
catalogue inputs. The Pages workflow validates the complete catalogue, immutable
history and image hashes before replacing the last successful site.

## Authentication setup

One fine-grained personal access token is needed for automatic publication:

1. Resource owner: pmackey2.
2. Repository access: Only select repositories -> games-catalogue.
3. Repository permissions: Contents -> Read and write. Metadata read is automatic.
   No Actions, Administration, Pages, Workflows or private-game read permission.
4. Choose a suitable expiry and record a rotation reminder.
5. Add its value as the Actions repository secret CATALOGUE_PUBLISH_TOKEN in each
   trusted game repository that will publish here. Do not put it in source files,
   game.json, catalogue JSON, the portal, a URL or a chat message.

This token has repository-wide write access, not path-only access. Every game
workflow given it is trusted as a catalogue publisher and could change another
game's metadata or archive checksum. A separate token per game limits revocation
and exposure but not its path scope. Branch protections may reject direct
publication; do not bypass them silently. This design requires an allowed direct
commit flow or a separately reviewed PR-publishing design.

The ordinary built-in GITHUB_TOKEN stays scoped to its game repository and
publishes the private package. It cannot write this separate repository. A PAT
commit here triggers Pages normally, avoiding the built-in-token trigger limit.

The portal reads this public catalogue without authentication. Its separate,
existing read-only GITHUB_TOKEN (or GITHUB_TOKEN_FILE) accesses private package
assets only, with Contents read on the selected game repositories. Browsers
never receive either credential. Catalogue/source repository names, version
numbers, commit IDs, private asset URLs, descriptions and cover images are public.

No publisher PAT is created or configured by this repository. Without the secret,
the game release still completes and reports a catalogue-publication warning.
Once configured, publish a new release, or rerun the separate Sync catalogue
workflow on an existing version tag without overwriting its private release.

## Game-repository integration

The composite action input entry-directory points to release build output holding:
- catalogue-entry.json, after its file record has become the private asset URL;
- <id>-<version>.tgz and its .sha256 sidecar;
- Optional catalogue-cover.png/.jpg/.webp; otherwise the publisher reads only the declared artwork image from the verified archive with a bounded extraction.

Use an exact reviewed commit SHA for this action. After the private release is
published, the action checks the workflow tag, repository and source commit,
archive hash and size, version record and cover. It does not execute game code,
download private sources or need read access to them. Do not call it from
untrusted pull requests or expose publisher secrets to fork workflows.

## Portal behavior and compatibility

Update all refreshes the catalogue and covers into an atomic, last-known-good
cache, then updates installed games with newer recommendations. Newly registered
games appear for individual Install. Existing launches use immutable version URLs.
Failed refreshes do not replace the verified cache; failed installs retain active
versions. No automatic game installation, container deployment or server-save
migration occurs.

The current portal must be upgraded before using the envelope catalogue or
artwork-enabled manifests. Older strict validators reject the artwork field.
The legacy bundled Falling Blocks seed intentionally retains its local package
record and original hash; its next published version must be a new version.
