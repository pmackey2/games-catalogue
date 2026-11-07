import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { build, validateEntry, sha256 } from "../scripts/build.mjs";
import { mergeCatalogue } from "../scripts/catalogue-merge.mjs";
const game = {
  specVersion:1,id:"example-game",title:"Example",description:"A test game.",version:"1.0.0",
  category:"Puzzle",tags:[],entry:"index.html",
  source:{repository:"https://github.com/example/game.git",ref:"a".repeat(40)},
  build:{profile:"static-copy",files:["index.html"]},browserStoragePrefix:"example.",controls:"Keyboard",
  releases:[{version:"1.0.0",sha256:"b".repeat(64),url:"https://api.github.com/repos/example/game/releases/assets/12"}]
};
test("registration, wrong identity and unsafe covers", () => {
  assert.equal(validateEntry({game}, game.id).game.id, game.id);
  assert.throws(() => validateEntry({game}, "other"), /identity/);
  for (const cover of [
    {path:"../secret",sha256:"b".repeat(64),alt:"cover"},
    {path:"artwork/example-game/"+ "b".repeat(64)+".png",sha256:"b".repeat(64),alt:""},
  ]) assert.throws(() => validateEntry({game,cover},game.id), /cover/);
  assert.equal(mergeCatalogue([], [game], {allowRegistration:true}).length,1);
  assert.throws(() => mergeCatalogue([game], [{...game, source:{...game.source,repository:"https://github.com/other/game.git"}}]), /identity/);
});
test("immutable pins, retained history and monotonic recommendation", () => {
  const next = structuredClone(game);
  next.version = "1.1.0"; next.releases=[{...game.releases[0],version:"1.1.0",sha256:"c".repeat(64)}];
  const merged = mergeCatalogue([game],[next])[0];
  assert.equal(merged.releases.length,2);
  assert.equal(mergeCatalogue([merged],[game])[0].version,"1.1.0");
  assert.throws(() => mergeCatalogue([game],[{...game,releases:[{...game.releases[0],sha256:"c".repeat(64)}]}]),/different hash/);
});
test("build outputs public metadata and checksum-verified cover only", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(),"catalogue-test-"));
  try {
    await mkdir(path.join(root,"entries"));
    const bytes = Buffer.from("synthetic-cover");
    const digest = sha256(bytes), relative = "artwork/example-game/"+digest+".png";
    await mkdir(path.dirname(path.join(root,relative)),{recursive:true});
    await writeFile(path.join(root,relative),bytes);
    await writeFile(path.join(root,"entries/example-game.json"),JSON.stringify({game,cover:{path:relative,sha256:digest,alt:"Test cover"}}));
    const result=await build(root);
    assert.equal(result.games.length,1);
    assert.deepEqual(await readFile(path.join(root,"dist",relative)),bytes);
    await writeFile(path.join(root,relative),"corrupted");
    await assert.rejects(build(root),/checksum/);
  } finally { await rm(root,{recursive:true,force:true}); }
});
