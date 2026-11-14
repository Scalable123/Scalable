import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const frontendRoot = join(root, "frontend");
const port = Number(process.env.PORT || 3000);

async function loadEnv() {
  try {
    const text = await readFile(join(root, ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
      }
    }
  } catch {
    // Environment variables supplied by the host are sufficient in production.
  }
}

function corsHeaders(request) {
  const configuredOrigin = process.env.FRONTEND_ORIGIN?.trim();
  const requestOrigin = request.headers.origin;
  if (!configuredOrigin || !requestOrigin || requestOrigin !== configuredOrigin) return {};
  return {
    "Access-Control-Allow-Origin": requestOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

const json = (response, status, body, request) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(request) });
  response.end(JSON.stringify(body));
};

async function readJson(request, maximumCharacters = 20_000) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > maximumCharacters) throw new Error("Request is too large.");
  }
  return JSON.parse(body || "{}");
}

function directionSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      note: { type: "string" },
      palette: { type: "array", minItems: 5, maxItems: 5, items: { type: "object", additionalProperties: false, properties: { hex: { type: "string" }, name: { type: "string" } }, required: ["hex", "name"] } },
      imageQueries: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", minLength: 3, maxLength: 120 } },
      songs: { type: "array", maxItems: 5, items: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, artist: { type: "string" }, explanation: { type: "string" }, tags: { type: "string" } }, required: ["title", "artist", "explanation", "tags"] } },
      sounds: { type: "array", maxItems: 3, items: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, artist: { type: "string" }, description: { type: "string" } }, required: ["title", "artist", "description"] } },
    },
    required: ["title", "description", "note", "palette", "imageQueries", "songs", "sounds"],
  };
}

async function createDirection(input) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server.");
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const content = [{ type: "input_text", text: `Brief: ${input.prompt}\nSong recommendations requested: ${input.includeSongs}\nAmbient sounds requested: ${input.includeSounds}\nReturn up to three concise Wikimedia Commons visual-search phrases that describe the subject, setting, materials, and composition. Do not include provider names, URLs, or licensing claims.` }];
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [{ role: "system", content: "Create a concise, imaginative mood-board direction from the written brief. Do not claim that songs are verified or that external research was performed. Do not generate image files; visual references come from Wikimedia Commons." }, { role: "user", content }],
      text: { format: { type: "json_schema", name: "creative_direction", strict: true, schema: directionSchema() } },
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || "The AI provider rejected the request.");
  const output = payload.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text || payload.output_text;
  if (!output) throw new Error("The AI provider returned no direction.");
  return JSON.parse(output);
}

const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml" };
async function serve(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === "/api/ai/creative-direction") {
    const configuredOrigin = process.env.FRONTEND_ORIGIN?.trim();
    const requestOrigin = request.headers.origin;
    if (requestOrigin && configuredOrigin && requestOrigin !== configuredOrigin) return json(response, 403, { error: "Origin is not allowed." }, request);
    if (request.method === "OPTIONS") return json(response, 204, {}, request);
    if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." }, request);
    try {
      const input = await readJson(request, 15_000_000);
      if (typeof input.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 2000) return json(response, 400, { error: "Prompt must be between 1 and 2000 characters." }, request);
      return json(response, 200, await createDirection({ ...input, prompt: input.prompt.trim() }), request);
    } catch (error) {
      return json(response, 502, { error: error.message || "AI request failed." }, request);
    }
  }
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." }, request);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = normalize(join(frontendRoot, requested));
  if (!file.startsWith(frontendRoot)) return json(response, 404, { error: "Not found." }, request);
  try {
    const contents = await readFile(file);
    response.writeHead(200, { "Content-Type": `${mime[extname(file)] || "application/octet-stream"}; charset=utf-8` });
    response.end(contents);
  } catch {
    json(response, 404, { error: "Not found." }, request);
  }
}

await loadEnv();
createServer(serve).listen(port, () => console.log(`Scalable server listening on http://localhost:${port}`));
