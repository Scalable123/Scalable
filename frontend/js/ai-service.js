const endpoint = "/api/ai/creative-direction";

export async function createCreativeDirection({
  prompt,
  includeSongs = true,
  includeSounds = true,
}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ prompt, includeSongs, includeSounds }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `AI request failed (${response.status})`);
  }
  return payload;
}
