/** UI boundary. Replace this instance with ApiBoardService when .NET is available.
 * DTOs are JSON-friendly: camelCase, string IDs, ISO dates. File uploads are separate.
 */
const STORAGE_KEY = "scalable.boards.v1";
export const prompts = {
  "Coastal calm":
    "A quiet coastal escape. Misty mornings, weathered stone, soft greens. A little nostalgic, a little wild.",
  "After hours":
    "A cinematic city after midnight. Deep indigo, warm amber light, grainy photography, and atmospheric electronic music.",
  "Earth & form":
    "An earthy design studio. Sculptural forms, warm clay, natural textures, and quiet instrumental music.",
};
const collections = {
  coast: {
    title: "Somewhere slower",
    description: "Coastal stillness. Organic textures. Room to breathe.",
    quote: "Less noise.\nMore feeling.",
    colors: ["#475C53", "#899A88", "#C8C8B5", "#E6DFD0", "#B8816B"],
    names: ["Pine", "Sage", "Lichen", "Oat", "Clay"],
  },
  night: {
    title: "When the city sleeps",
    description:
      "Deep shadows. Electric atmosphere. A different kind of quiet.",
    quote: "Stay a little\nafter dark.",
    colors: ["#202632", "#4C5472", "#8C7B93", "#B78264", "#E5CCAC"],
    names: ["Midnight", "Slate", "Haze", "Copper", "Glow"],
  },
  earth: {
    title: "A softer kind of form",
    description: "Grounded colors. Honest materials. Space for the unexpected.",
    quote: "Made of earth.\nFull of possibility.",
    colors: ["#72533F", "#AF8164", "#C8B494", "#DBD3BD", "#7D856C"],
    names: ["Umber", "Terracotta", "Sand", "Linen", "Olive"],
  },
};
const assetRoot = new URL("../assets/", import.meta.url);
const image = (id, filename, title, description, sourceUrl, position) => ({
  id,
  type: "image",
  url: new URL(filename, assetRoot).href,
  title,
  description,
  sourceUrl,
  sourceLabel: "Start Bootstrap sample photography",
  position,
  pinned: false,
});
export class DemoBoardService {
  async research({ prompt }) {
    // Deliberate preview delay; this is local sample selection, not AI research.
    await new Promise((resolve) => setTimeout(resolve, 650));
    const key = /night|midnight|city|indigo/i.test(prompt)
      ? "night"
      : /earth|clay|sculptur|studio/i.test(prompt)
        ? "earth"
        : "coast";
    const collection = collections[key];
    return {
      id: crypto.randomUUID(),
      title: collection.title,
      description: collection.description,
      prompt,
      createdAt: new Date().toISOString(),
      mode: "demo",
      items: [
        image(
          "mountains",
          "mountains.jpg",
          "Into the quiet",
          "Layers of mountain peaks dissolving into mist.",
          "https://github.com/StartBootstrap/startbootstrap-grayscale",
          "hero",
        ),
        {
          id: "palette",
          type: "palette",
          colors: collection.colors.map((hex, i) => ({
            hex,
            name: collection.names[i],
          })),
        },
        image(
          "coast",
          "coast.jpg",
          "The in-between",
          "Dark mountain silhouettes above a soft bank of cloud.",
          "https://github.com/StartBootstrap/startbootstrap-grayscale",
          "detail",
        ),
        { id: "note", type: "note", text: collection.quote },
        image(
          "water",
          "water.jpg",
          "A moment of blue",
          "Ripples of blue water catching the daylight.",
          "https://github.com/StartBootstrap/startbootstrap-landing-page",
          "water",
        ),
        {
          id: "music",
          type: "music",
          title:
            key === "night"
              ? "Night / Motion"
              : key === "earth"
                ? "Form / Stillness"
                : "Slow / Tides",
          artist: "An imagined soundtrack",
          description: "Ambient · instrumental · unhurried",
          isSample: true,
        },
      ],
    };
  }
  async listBoards() {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed))
      throw new Error("Saved board storage is not readable.");
    return parsed;
  }
  async saveBoard(board) {
    const boards = await this.listBoards();
    const record = structuredClone(board);
    const next = [record, ...boards.filter((item) => item.id !== board.id)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return record;
  }
}

/** Future .NET adapter. Not enabled or claimed to be implemented by the server. */
export class ApiBoardService {
  constructor(baseUrl = "/api") {
    this.baseUrl = baseUrl;
  }
  async request(path, options = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      credentials: "same-origin",
      ...options,
    });
    if (!response.ok)
      throw new Error(`Request failed (${response.status}). Please try again.`);
    return response.status === 204 ? null : response.json();
  }
  // Proposed job API: the UI will also need polling/cancellation when this is enabled.
  startResearch(prompt, referenceFile) {
    const form = new FormData();
    form.append("prompt", prompt);
    if (referenceFile) form.append("reference", referenceFile);
    return this.request("/research-runs", { method: "POST", body: form });
  }
  getResearchRun(id) {
    return this.request(`/research-runs/${encodeURIComponent(id)}`);
  }
  listBoards() {
    return this.request("/boards");
  }
  saveBoard(board) {
    return this.request(`/boards/${encodeURIComponent(board.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(board),
    });
  }
}
export const boardService = new DemoBoardService();
