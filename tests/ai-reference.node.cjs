const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

(async () => {
  const root = path.resolve(__dirname, "..");
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const server = spawn(process.execPath, [path.join(root, "server.js")], {
    cwd: root,
    env: { ...process.env, PORT: String(port), OPENAI_API_KEY: "", FRONTEND_ORIGIN: "https://scalable123.github.io" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  server.stdout.on("data", chunk => logs += chunk);
  server.stderr.on("data", chunk => logs += chunk);
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch {}
      if (attempt > 100 || server.exitCode !== null) throw new Error(`Node server did not start: ${logs}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const endpoint = `http://127.0.0.1:${port}/api/ai/creative-direction`;
    const post = body => fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const preflight = await fetch(endpoint, { method: "OPTIONS", headers: { Origin: "https://scalable123.github.io", "Access-Control-Request-Method": "POST" } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://scalable123.github.io");
    assert.equal((await fetch(endpoint, { method: "POST", headers: { Origin: "https://malicious.example", "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "coast" }) })).status, 403);
    assert.equal((await post({ prompt: "coast", referenceImage: "data:image/gif;base64,AAAA" })).status, 400);
    assert.equal((await post({ prompt: "coast", referenceImage: "not-an-image" })).status, 400);
    assert.equal((await post({ prompt: "coast", referenceImage: `data:image/jpeg;base64,${"A".repeat(14_000_001)}` })).status, 400);
    assert.equal((await post({ prompt: "coast" })).status, 502, "valid prompt reaches provider configuration validation");
    console.log("AI reference and Render CORS validation checks passed (6 assertions).");
  } finally {
    server.kill("SIGTERM");
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
