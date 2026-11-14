const DEFAULT_NAMES = ["Deep tone", "Natural shade", "Soft neutral", "Light note", "Accent"];
const PROMPT_COLORS = [
  ["red", "warm red"], ["rose", "dusty rose"], ["pink", "soft pink"],
  ["orange", "burnt orange"], ["amber", "amber"], ["yellow", "sunlit yellow"],
  ["green", "leaf green"], ["olive", "olive"], ["sage", "sage"],
  ["blue", "quiet blue"], ["indigo", "deep indigo"], ["navy", "navy"],
  ["purple", "muted violet"], ["violet", "violet"], ["brown", "earth brown"],
  ["clay", "clay"], ["sand", "sand"], ["beige", "warm beige"],
  ["cream", "cream"], ["white", "soft white"], ["black", "charcoal"],
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function loadPixels(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, size, size);
        resolve(context.getImageData(0, 0, size, size).data);
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function promptHint(prompt) {
  const text = String(prompt || "").toLowerCase();
  return PROMPT_COLORS.find(([word]) => new RegExp(`\\b${word}\\b`).test(text))?.[1] || null;
}

function colorName(rgb, prompt, index) {
  const hint = promptHint(prompt);
  if (hint && index === 0) return hint;
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 18) return max < 70 ? "charcoal" : max > 205 ? "soft white" : "stone";
  if (r > g * 1.2 && r > b * 1.2) return "warm earth";
  if (g > r * 1.12 && g > b * 1.05) return "leaf green";
  if (b > r * 1.12 && b > g * 1.04) return "quiet blue";
  return DEFAULT_NAMES[index] || DEFAULT_NAMES[DEFAULT_NAMES.length - 1];
}

// Extracts representative colors from the actual rendered image sources. A failed
// image/CORS read returns null so the caller can retain its prompt-based palette.
export async function paletteFromImages(images, prompt, fallback = []) {
  const sources = (Array.isArray(images) ? images : [])
    .map((item) => item?.url)
    .filter((url) => typeof url === "string")
    .slice(0, 6);
  if (!sources.length) return fallback;

  const pixelSets = await Promise.all(sources.map(loadPixels));
  const bins = new Map();
  for (const pixels of pixelSets) {
    if (!pixels) continue;
    for (let i = 0; i < pixels.length; i += 16) {
      const alpha = pixels[i + 3];
      if (alpha < 180) continue;
      const color = [pixels[i], pixels[i + 1], pixels[i + 2]];
      const key = color.map((value) => Math.round(value / 24) * 24).join(",");
      const entry = bins.get(key) || { color: [0, 0, 0], count: 0 };
      entry.color = entry.color.map((value, index) => value + color[index]);
      entry.count += 1;
      bins.set(key, entry);
    }
  }
  if (!bins.size) return fallback;

  const candidates = [...bins.values()]
    .map(({ color, count }) => ({ color: color.map((value) => Math.round(value / count)), count }))
    .sort((a, b) => b.count - a.count);
  const selected = [];
  for (const candidate of candidates) {
    if (selected.every((color) => distance(color, candidate.color) >= 42)) selected.push(candidate.color);
    if (selected.length === 5) break;
  }
  while (selected.length < 5) {
    const source = fallback[selected.length]?.hex;
    if (!source) break;
    selected.push(source.match(/[0-9a-f]{2}/gi)?.map((value) => parseInt(value, 16)) || [128, 128, 128]);
  }
  return selected.map((color, index) => ({ hex: rgbToHex(...color.map((value) => clamp(value, 0, 255))), name: colorName(color, prompt, index) }));
}
