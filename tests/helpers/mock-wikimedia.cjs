// Keep unrelated browser suites deterministic/offline after live Commons lookup was added.
async function mockWikimedia(context) {
  await context.route("https://commons.wikimedia.org/w/api.php?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ batchcomplete: true }),
    }),
  );
}
function isWikimediaLookup(url) {
  return url.startsWith("https://commons.wikimedia.org/w/api.php?");
}
module.exports = { mockWikimedia, isWikimediaLookup };
