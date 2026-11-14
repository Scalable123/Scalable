import assert from "node:assert/strict";
import { searchWikimedia } from "../frontend/js/wikimedia-source.js";

const originalFetch = globalThis.fetch;
let calls = 0;
const valid = {
  status: "available",
  image: {
    id: "wikimedia-12345", type: "image", provider: "wikimedia", externalPhotoId: "12345",
    url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/Quiet.jpg/1200px-Quiet.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Quiet_coast.jpg",
    creatorUrl: "https://commons.wikimedia.org/wiki/File:Quiet_coast.jpg",
    creatorName: "Artist <b>", licenseName: "CC BY-SA 4.0", title: "File:Quiet coast.jpg", description: "A quiet coast",
  },
};
globalThis.fetch = async (_url, options) => {
  calls++;
  assert.equal(options.method, "POST");
  assert.equal(JSON.parse(options.body).prompt, "quiet coast");
  return new Response(JSON.stringify(valid), { status: 200 });
};
const result = await searchWikimedia("quiet coast");
assert.equal(result.status, "available");
assert.equal(result.image.position, "detail");
assert.equal(calls, 1);

globalThis.fetch = async () => new Response(JSON.stringify({ ...valid, image: { ...valid.image, licenseName: "" } }), { status: 200 });
assert.equal((await searchWikimedia("quiet coast")).status, "unavailable");
globalThis.fetch = async () => new Response(JSON.stringify({ status: "rate_limited", image: null }), { status: 429 });
assert.equal((await searchWikimedia("quiet coast")).status, "rate_limited");
globalThis.fetch = originalFetch;
console.log("Wikimedia source adapter checks passed (3 assertions).");
