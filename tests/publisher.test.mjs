import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { publishCatalogue } from "../scripts/publish.mjs";
const bytes=Buffer.from("synthetic-archive"), digest=createHash("sha256").update(bytes).digest("hex");
const game={specVersion:1,id:"publisher-game",title:"Publisher",description:"Fixture",version:"1.0.0",
  category:"Puzzle",tags:[],entry:"index.html",source:{repository:"https://github.com/example/game.git",ref:"a".repeat(40)},
  build:{profile:"static-copy",files:["index.html"]},browserStoragePrefix:"pub.",controls:"Keys",
  releases:[{version:"1.0.0",sha256:digest,url:"https://api.github.com/repos/example/game/releases/assets/7"}]};
const env={CATALOGUE_PUBLISH_TOKEN:"synthetic-token",CATALOGUE_ENTRY_DIRECTORY:"output",GITHUB_REPOSITORY:"example/game",
  GITHUB_SHA:"a".repeat(40),GITHUB_REF_TYPE:"tag",GITHUB_REF_NAME:"v1.0.0"};
const read=async(file)=>file.endsWith("catalogue-entry.json")?JSON.stringify(game):
  file.endsWith(".sha256")?digest+"  publisher-game-1.0.0.tgz\n":bytes;
test("registration retries a ref race without force and preserves latest base",async()=>{
  const trees=[],patches=[];let attempt=0;
  const fetchImpl=async(url,options)=>{
    assert.ok(url.startsWith("https://api.github.com/repos/pmackey2/games-catalogue/"));
    assert.equal(options.redirect,"error");
    assert.equal(options.headers.Authorization,"Bearer synthetic-token");
    const body=options.body&&JSON.parse(options.body);
    const reply=(value,status=200)=>new Response(JSON.stringify(value),{status});
    if(url.endsWith("/git/ref/heads/main")) return reply({object:{sha:"head"+(++attempt)}});
    if(url.includes("/git/commits/head")) return reply({tree:{sha:"tree"+attempt}});
    if(url.includes("/contents/entries/")) return reply({},404);
    if(url.endsWith("/git/trees")){trees.push(body);return reply({sha:"newtree"+attempt});}
    if(url.endsWith("/git/commits"))return reply({sha:"newcommit"+attempt});
    if(url.endsWith("/git/refs/heads/main")){patches.push(body);return reply({},attempt===1?422:200);}
    throw Error("Unexpected request");
  };
  const result=await publishCatalogue({env,read,fetchImpl});
  assert.equal(result.commit,"newcommit2");
  assert.deepEqual(trees.map(t=>t.base_tree),["tree1","tree2"]);
  assert.ok(patches.every(p=>p.force===false));
  assert.equal(JSON.parse(trees[1].tree[0].content).game.id,game.id);
});
test("missing secret is explicit, wrong source fails before network, secrets are sanitized",async()=>{
  assert.equal((await publishCatalogue({env:{},fetchImpl:()=>assert.fail()})).configured,false);
  await assert.rejects(publishCatalogue({env:{...env,GITHUB_REPOSITORY:"wrong/repo"},read,fetchImpl:()=>assert.fail()}),/provenance/);
  await assert.rejects(publishCatalogue({env,read,fetchImpl:()=>{throw Error("synthetic-token")}}),
    {message:"Catalogue GitHub request failed; no credentials or upstream details are logged"});
});
test("same version cannot replace an existing checksum",async()=>{
  const old={game:{...game,releases:[{...game.releases[0],sha256:"f".repeat(64)}]}};
  let posts=0;
  const fetchImpl=async(url,options)=>{
    if(options.method!=="GET")posts++;
    if(url.endsWith("/git/ref/heads/main"))return Response.json({object:{sha:"head"}});
    if(url.endsWith("/git/commits/head"))return Response.json({tree:{sha:"tree"}});
    return Response.json({content:Buffer.from(JSON.stringify(old)).toString("base64")});
  };
  await assert.rejects(publishCatalogue({env,read,fetchImpl}),/different hash/);
  assert.equal(posts,0);
});
