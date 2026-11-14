import { aiOrigin } from "./config/ai-origin.js";

function endpoint() {
  return new URL("/api/ai/creative-direction", aiOrigin()).toString();
}

function fileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The reference image could not be prepared for AI analysis."));
    reader.readAsDataURL(file);
  });
}

export async function createCreativeDirection({
  prompt,
  includeSongs = true,
  includeSounds = true,
  referenceFile = null,
}) {
  const referenceImage = referenceFile ? await fileDataUrl(referenceFile) : undefined;
  const response = await fetch(endpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ prompt, includeSongs, includeSounds, ...(referenceImage ? { referenceImage } : {}) }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `AI request failed (${response.status})`);
  }
  return payload;
}
