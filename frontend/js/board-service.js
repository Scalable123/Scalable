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
// Hand-picked examples, never presented as live research or verified track IDs.
const songPicks = {
  coast: [
    [
      "Holocene",
      "Bon Iver",
      "Wide-open space and a reflective vocal for a slower pace.",
      "Indie folk · vocals",
    ],
    [
      "Pink Moon",
      "Nick Drake",
      "Intimate acoustic guitar with a quietly nostalgic mood.",
      "Folk · vocals",
    ],
    [
      "Sunset Lover",
      "Petit Biscuit",
      "Soft electronic textures with a little coastal warmth.",
      "Electronic · instrumental",
    ],
  ],
  night: [
    [
      "Nightcall",
      "Kavinsky",
      "Neon synths and late-night momentum.",
      "Synthwave · vocals",
    ],
    [
      "Intro",
      "The xx",
      "Minimal guitar and a spacious, cinematic pulse.",
      "Indie electronic · instrumental",
    ],
    [
      "Open Eye Signal",
      "Jon Hopkins",
      "A patient electronic build for an after-hours atmosphere.",
      "Electronic · instrumental",
    ],
  ],
  earth: [
    [
      "Bloom",
      "The Paper Kites",
      "Gentle acoustic detail and an intimate, handmade feel.",
      "Indie folk · vocals",
    ],
    [
      "A Walk",
      "Tycho",
      "Warm layers and an easy rhythm to shape ideas around.",
      "Electronic · instrumental",
    ],
    [
      "Says",
      "Nils Frahm",
      "Gradual, tactile layers with room to think.",
      "Ambient · instrumental",
    ],
  ],
};
function songsFor(key) {
  return songPicks[key].map(([title, artist, explanation, tags], index) => ({
    id: `song-${key}-${index}`,
    type: "song",
    title,
    artist,
    explanation,
    tags,
    discoveryUrl: `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artist}`)}`,
    linkKind: "catalog-search",
    isSample: true,
  }));
}
// Read without normalization when deleting so unrelated saved records stay unchanged.
function readStoredBoards() {
  const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  if (!Array.isArray(parsed))
    throw new Error("Saved board storage is not readable.");
  return parsed;
}
// Keep existing browser-saved boards usable after the former music concept became sound.
function normalizeBoard(board) {
  return {
    ...board,
    items: board.items.map((item) =>
      item.type === "music" ? { ...item, type: "sound", isSample: true } : item,
    ),
  };
}
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
  async research({ prompt, includeSongs = true, includeSounds = true }) {
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
      researchOptions: { includeSongs, includeSounds },
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
        ...(includeSounds
          ? [
              {
                id: "sound",
                type: "sound",
                title:
                  key === "night"
                    ? "Rain / City"
                    : key === "earth"
                      ? "Wind / Leaves"
                      : "Ocean / Tides",
                artist: "Ambient sound direction",
                description:
                  key === "night"
                    ? "Distant rain, soft city hum, an occasional passing car"
                    : key === "earth"
                      ? "A breeze through leaves, birds in the distance, a quiet outdoor space"
                      : "Slow waves, a little wind, a distant shoreline",
                isSample: true,
              },
            ]
          : []),
        ...(includeSongs ? songsFor(key) : []),
      ],
    };
  }
  async listBoards() {
    return readStoredBoards().map(normalizeBoard);
  }
  async deleteBoard(id) {
    const boards = readStoredBoards();
    const next = boards.filter((board) => board.id !== id);
    if (next.length === boards.length) return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
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
  startResearch(
    prompt,
    referenceFile,
    { includeSongs = true, includeSounds = true } = {},
  ) {
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("includeSongs", String(includeSongs));
    form.append("includeSounds", String(includeSounds));
    if (referenceFile) form.append("reference", referenceFile);
    return this.request("/research-runs", { method: "POST", body: form });
  }
  getResearchRun(id) {
    return this.request(`/research-runs/${encodeURIComponent(id)}`);
  }
  listBoards() {
    return this.request("/boards");
  }
  async deleteBoard(id) {
    await this.request(`/boards/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return true;
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
