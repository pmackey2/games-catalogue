# Catalogue maintenance

This repository is public. Publish only approved game metadata and cover artwork.
Never copy private source, package archives, credentials or personal data here.
Read README.md before editing publishing, auth or registration behavior.

Keep the manifest v1 contract synchronized with Games Portal. Game IDs are unique,
versions/hashes immutable, existing source/entry/storage identities stable. Retain
old release pins and art; failed builds must leave the last deployed Pages site.
Validate asset URLs against the game's exact repository. Cover files use bounded
sizes, safe paths and SHA-256 filenames. No remote image fetches in the builder.

The composite publisher uses CATALOGUE_PUBLISH_TOKEN scoped only to this repo with
Contents write. Treat every holder as trusted for the entire catalogue. Never
create, broaden or configure credentials unless the user expressly approves that
specific credential operation. No game installation or private repo visibility
change is implied by publishing this catalogue.

Run npm test, npm run build and git diff --check. Before claiming publication,
verify CI for the exact commit and fetch the public catalogue URL. The game
workflow should pin a reviewed action commit. Do not move/reuse game release tags.
