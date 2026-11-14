// Frontend media boundary. References are JSON DTOs; local audio URLs never enter a board.
export const providers = [
  {
    id: "spotify",
    name: "Spotify",
    mark: "S",
    color: "#33774c",
    note: "Songs, albums & playlists",
  },
  {
    id: "amazon",
    name: "Amazon Music",
    mark: "a",
    color: "#526a8e",
    note: "Music & playlist references",
  },
  {
    id: "apple",
    name: "Apple Music",
    mark: "♫",
    color: "#a94f61",
    note: "Songs, albums & playlists",
  },
  {
    id: "soundcloud",
    name: "SoundCloud",
    mark: "SC",
    color: "#a65e32",
    note: "Music & independent sounds",
  },
  {
    id: "jamendo",
    name: "Jamendo",
    mark: "J",
    color: "#7a5b9e",
    note: "Independent and openly licensed music",
  },
];
const amazonHosts = new Set(
  [
    "com",
    "co.uk",
    "de",
    "fr",
    "it",
    "es",
    "co.jp",
    "ca",
    "com.au",
    "in",
    "com.br",
    "com.mx",
  ].map((region) => `music.amazon.${region}`),
);
export function parseMediaLink(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a complete music link beginning with https://.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error(
      "Use an HTTPS music link without login details or a custom port.",
    );
  const host = url.hostname;
  const parts = url.pathname.split("/").filter(Boolean);
  // Spotify's localized desktop URLs refer to the same catalog resources.
  if (
    host === "open.spotify.com" &&
    /^intl-[a-z]{2}(-[a-z]{2})?$/i.test(parts[0])
  ) {
    parts.shift();
    url.pathname = "/" + parts.join("/");
  }
  let provider;
  let resourceType = "reference";
  if (
    host === "open.spotify.com" &&
    /^(track|album|playlist|search)$/.test(parts[0]) &&
    parts[1]
  ) {
    provider = "spotify";
    resourceType = parts[0] === "track" ? "song" : parts[0];
  } else if (amazonHosts.has(host) && parts.length) {
    provider = "amazon";
    resourceType = /playlist/.test(parts[0])
      ? "playlist"
      : /album/.test(parts[0])
        ? "album"
        : "music";
  } else if (host === "music.apple.com" && parts.length >= 2) {
    provider = "apple";
    resourceType = parts.includes("playlist")
      ? "playlist"
      : parts.includes("album")
        ? "album"
        : "music";
  } else if (
    ["soundcloud.com", "www.soundcloud.com"].includes(host) &&
    parts.length
  ) {
    provider = "soundcloud";
    resourceType = parts.includes("sets") ? "playlist" : "sound";
  } else if (["jamendo.com", "www.jamendo.com"].includes(host) && parts.length) {
    provider = "jamendo";
    resourceType = "song";
  } else if (
    ["www.youtube.com", "youtube.com", "music.youtube.com"].includes(host) &&
    ((url.pathname === "/watch" && url.searchParams.get("v")) ||
      (url.pathname === "/playlist" && url.searchParams.get("list")))
  ) {
    provider = "youtube";
    resourceType = url.pathname === "/playlist" ? "playlist" : "video";
  } else if (host === "youtu.be" && parts.length === 1) {
    provider = "youtube";
    resourceType = "video";
  } else
    throw new Error(
      "Use a Spotify, Amazon Music, Apple Music, SoundCloud, or YouTube link. Short share links must be expanded in your browser first.",
    );
  for (const key of [...url.searchParams.keys()])
    if (/^(utm_|si$|ref$|ref_|feature$)/.test(key))
      url.searchParams.delete(key);
  url.hash = "";
  return { url: url.href, provider, resourceType };
}
export function providerName(id) {
  return (
    providers.find((provider) => provider.id === id)?.name ||
    (id === "youtube" ? "YouTube" : "Music service")
  );
}
const localMedia = new Map();
export function localAudioUrl(id) {
  return localMedia.get(id) || null;
}
export function releaseLocalAudio(id) {
  const url = localMedia.get(id);
  if (url) URL.revokeObjectURL(url);
  localMedia.delete(id);
}
export function retainLocalAudio(items) {
  const ids = new Set(items.map((item) => item.id));
  for (const id of localMedia.keys()) if (!ids.has(id)) releaseLocalAudio(id);
}
export async function attachLocalAudio(id, file) {
  if (
    !file ||
    !/\.(mp3|wav|ogg|m4a)$/i.test(file.name) ||
    file.size === 0 ||
    file.size > 20 * 1024 * 1024
  )
    throw new Error(
      "Choose a non-empty MP3, WAV, OGG, or M4A file up to 20 MB.",
    );
  const url = URL.createObjectURL(file);
  const probe = document.createElement("audio");
  probe.preload = "metadata";
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              "This audio could not be read in time. Try a smaller file or another format.",
            ),
          ),
        8000,
      );
      probe.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve();
      };
      probe.onerror = () => {
        clearTimeout(timer);
        reject(
          new Error(
            "This file could not be decoded as audio. Try a browser-supported MP3, WAV, OGG, or M4A.",
          ),
        );
      };
      probe.src = url;
    });
    releaseLocalAudio(id);
    localMedia.set(id, url);
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    probe.removeAttribute("src");
    probe.load();
  }
  return {
    name: file.name,
    size: file.size,
    mimeType: file.type,
    lastModified: file.lastModified,
  };
}
function reference({
  type,
  title,
  artist = "",
  url,
  sourceKind = "link",
  isSample = false,
}) {
  const parsed = parseMediaLink(url);
  return {
    id: crypto.randomUUID(),
    type,
    title: title.trim(),
    artist: artist.trim(),
    imported: true,
    sourceKind,
    provider: parsed.provider,
    resourceType: parsed.resourceType,
    discoveryUrl: parsed.url,
    sourceKey: parsed.url,
    linkKind: sourceKind === "demo-provider" ? "catalog-search" : "user-link",
    isSample,
    explanation: isSample
      ? "Demo library example, selected by you. No account is connected."
      : "A reference added by you.",
    tags: `${providerName(parsed.provider)} · ${parsed.resourceType} · ${isSample ? "demo example" : "your reference"}`,
  };
}
function demoTracks(provider) {
  return [
    ["Holocene", "Bon Iver"],
    ["A Walk", "Tycho"],
  ].map(([title, artist]) => {
    const term = encodeURIComponent(`${title} ${artist}`);
    const url =
      provider.id === "spotify"
        ? `https://open.spotify.com/search/${term}`
        : provider.id === "amazon"
          ? `https://music.amazon.com/search/${term}`
          : provider.id === "apple"
            ? `https://music.apple.com/us/search?term=${term}`
            : `https://soundcloud.com/search?q=${term}`;
    return reference({
      type: "song",
      title,
      artist,
      url,
      sourceKind: "demo-provider",
      isSample: true,
    });
  });
}
export function setupAudioImporter({ onImport, getBoardId, element }) {
  const $ = (selector) => document.querySelector(selector);
  const dialog = $("#audio-dialog");
  const status = (message) => {
    $("#audio-import-status").textContent = message;
  };
  const tabs = [...dialog.querySelectorAll("[data-import-tab]")];
  let sampleTracks = [];
  let activeProvider = null;
  let spotifyTracks = [];
  function chooseTab(name, focus = false) {
    tabs.forEach((tab) => {
      const selected = tab.dataset.importTab === name;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      $(`#${tab.dataset.importTab}-panel`).hidden = !selected;
      if (selected && focus) tab.focus();
    });
    status("");
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => chooseTab(tab.dataset.importTab));
    tab.addEventListener("keydown", (event) => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft")
        next = (index + tabs.length - 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next !== undefined) {
        event.preventDefault();
        chooseTab(tabs[next].dataset.importTab, true);
      }
    });
  });
  $("#import-audio").addEventListener("click", () => {
    status("");
    dialog.showModal();
  });
  $("#close-audio").addEventListener("click", () => dialog.close());
  $("#audio-link-form").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const title = $("#link-title").value.trim();
      if (!title) throw new Error("Give this reference a title.");
      const item = reference({
        type: $("#link-kind").value,
        title,
        artist: $("#link-artist").value,
        url: $("#audio-link").value,
      });
      const count = onImport([item]);
      status(
        count
          ? "Reference added. Save your board to keep it."
          : "That link is already on this board.",
      );
      if (count) event.target.reset();
    } catch (error) {
      status(error.message);
    }
  });
  $("#spotify-search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = $("#spotify-search").value.trim();
    const statusNode = $("#spotify-search-status");
    const results = $("#spotify-search-results");
    const provider = $("#music-provider").value;
    if (!query) return;
    statusNode.textContent = `Searching ${provider}…`;
    results.replaceChildren();
    try {
      const response = await fetch(`/api/music/${provider}/search?q=${encodeURIComponent(query)}`, { credentials: "same-origin" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Spotify search is unavailable.");
      spotifyTracks = payload.items.map((track) => reference({
        type: "song",
        title: track.title,
        artist: track.artist,
        url: track.discoveryUrl,
        sourceKind: `${provider}-api`,
        isSample: false,
      }));
      spotifyTracks.forEach((item, index) => {
        const label = element("label", "demo-track");
        const checkbox = element("input");
        checkbox.type = "checkbox";
        checkbox.value = String(index);
        const copy = element("span");
        copy.append(element("strong", "", item.title), element("small", "", `${item.artist} · ${provider}`));
        label.append(checkbox, copy);
        results.append(label);
      });
      statusNode.textContent = spotifyTracks.length ? "Choose songs to add to your board." : "No Spotify tracks matched that search.";
      if (spotifyTracks.length) {
        const add = element("button", "done-button", "Add selected songs ↗");
        add.type = "button";
        add.addEventListener("click", () => {
          const selected = [...results.querySelectorAll("input:checked")].map((input) => spotifyTracks[Number(input.value)]);
          if (!selected.length) { statusNode.textContent = "Choose at least one song."; return; }
          const count = onImport(selected);
          statusNode.textContent = count ? `${count} Spotify song${count === 1 ? "" : "s"} added. Save your board to keep it.` : "Those songs are already on this board.";
        });
        results.append(add);
      }
    } catch (error) {
      statusNode.textContent = error.message;
    }
  });
  $("#audio-file-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#add-file");
    button.disabled = true;
    status("Checking this local audio file…");
    const id = crypto.randomUUID();
    const targetBoardId = getBoardId();
    try {
      const file = $("#audio-file").files[0];
      const fileInfo = await attachLocalAudio(id, file);
      const item = {
        id,
        type: $("#file-kind").value,
        title:
          $("#file-title").value.trim() || file.name.replace(/\.[^.]+$/, ""),
        artist: "",
        imported: true,
        sourceKind: "local-file",
        fileInfo,
        sourceKey: `file:${file.name}:${file.size}:${file.lastModified}`,
        explanation:
          "Local audio. Only file details are saved; reattach after reopening in a new visit.",
        tags: "Local file · stays on this device",
        isSample: false,
      };
      const count = onImport([item], targetBoardId);
      if (!count) releaseLocalAudio(id);
      status(
        count
          ? "Local audio added. The recording stays in this tab; save keeps its details only."
          : "This file is already on this board.",
      );
      if (count) event.target.reset();
    } catch (error) {
      releaseLocalAudio(id);
      status(error.message);
    } finally {
      button.disabled = false;
    }
  });
  for (const provider of providers) {
    const card = element("article", "provider-card");
    const mark = element("span", "provider-mark", provider.mark);
    mark.style.setProperty("--provider-color", provider.color);
    mark.setAttribute("aria-hidden", "true");
    const copy = element("div", "provider-copy");
    copy.append(
      element("h3", "", provider.name),
      element("p", "", provider.note),
      element("small", "", "Not connected · frontend preview"),
    );
    const button = element("button", "toolbar-button", "Preview");
    button.setAttribute("aria-label", `Preview ${provider.name} connection`);
    button.addEventListener("click", () => {
      activeProvider = provider.id;
      sampleTracks = demoTracks(provider);
      $("#provider-preview").hidden = false;
      $("#provider-preview-title").textContent =
        `${provider.name} · library preview`;
      $("#provider-tracks").replaceChildren();
      sampleTracks.forEach((item, index) => {
        const label = element("label", "demo-track");
        const checkbox = element("input");
        checkbox.type = "checkbox";
        checkbox.name = "demo-track";
        checkbox.value = String(index);
        const copy = element("span");
        copy.append(
          element("strong", "", item.title),
          element("small", "", `${item.artist} · demo example`),
        );
        label.append(checkbox, copy);
        $("#provider-tracks").append(label);
      });
      document
        .querySelectorAll(".provider-card")
        .forEach((card) => card.classList.remove("previewing"));
      card.classList.add("previewing");
      status(
        `${provider.name} preview opened. No connection or sign-in has taken place.`,
      );
      $("#provider-preview-title").tabIndex = -1;
      $("#provider-preview-title").focus();
    });
    card.append(mark, copy, button);
    $("#provider-list").append(card);
  }
  $("#leave-provider").addEventListener("click", () => {
    const previous = activeProvider;
    activeProvider = null;
    sampleTracks = [];
    $("#provider-preview").hidden = true;
    document
      .querySelectorAll(".provider-card")
      .forEach((card) => card.classList.remove("previewing"));
    if (previous)
      $(`[aria-label="Preview ${providerName(previous)} connection"]`).focus();
    status("Preview closed. No accounts are connected.");
  });
  $("#provider-import-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const selected = [...event.target.querySelectorAll("input:checked")].map(
      (input) => sampleTracks[Number(input.value)],
    );
    if (!selected.length) {
      status("Choose at least one demo reference to add.");
      return;
    }
    const count = onImport(selected);
    status(
      count
        ? `${count} demo reference${count === 1 ? "" : "s"} added. Existing links were skipped. No account is connected.`
        : "These references are already on your board.",
    );
    event.target.reset();
  });
}

export function renderAudioReference(
  item,
  index,
  { element, onRemove, onReattach },
) {
  const card = element(
    "article",
    `song-card imported-audio-card ${item.type === "song" ? "" : "imported-sound-card"}`,
  );
  card.dataset.itemId = item.id;
  card.append(
    element("span", "song-number", String(index + 1).padStart(2, "0")),
  );
  const copy = element("div", "song-copy");
  copy.append(
    element("h4", "", item.title),
    element(
      "p",
      "song-artist",
      item.artist ||
        (item.type === "sound"
          ? "Your ambient reference"
          : "Your music reference"),
    ),
    element("p", "song-reason", item.explanation),
    element("span", "song-tags", item.tags),
  );
  const actions = element("div", "reference-actions");
  if (item.sourceKind === "local-file") {
    const url = localAudioUrl(item.id);
    if (url) {
      const audio = element("audio");
      audio.src = url;
      audio.controls = true;
      audio.preload = "metadata";
      audio.setAttribute("aria-label", `Play local audio: ${item.title}`);
      audio.addEventListener("play", () =>
        document.querySelectorAll("audio,video").forEach((other) => {
          if (other !== audio) other.pause();
        }),
      );
      const error = element("p", "field-help");
      audio.addEventListener("error", () => {
        error.textContent =
          "This recording cannot play. Reattach a supported audio file.";
      });
      copy.append(audio, error);
    } else
      copy.append(
        element(
          "p",
          "reattach-notice",
          `Reattach ${item.fileInfo?.name || "the original audio file"} to play. Audio files are not saved.`,
        ),
      );
    const label = element(
      "label",
      "reattach-button",
      url ? "Replace file" : "Reattach audio",
    );
    const input = element("input");
    input.type = "file";
    input.accept =
      "audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/mp4,.mp3,.wav,.ogg,.m4a";
    input.setAttribute("aria-label", `Reattach audio for ${item.title}`);
    const message = element("p", "field-help");
    message.setAttribute("role", "status");
    input.addEventListener("change", async () => {
      if (!input.files[0]) return;
      input.disabled = true;
      message.textContent = "Checking local audio…";
      try {
        const fileInfo = await attachLocalAudio(item.id, input.files[0]);
        onReattach(item.id, fileInfo);
      } catch (error) {
        message.textContent = error.message;
        input.disabled = false;
      }
    });
    label.append(input);
    actions.append(label);
    copy.append(message);
  } else {
    try {
      const parsed = parseMediaLink(item.discoveryUrl);
      const link = element(
        "a",
        "song-link",
        `Open ${providerName(parsed.provider)} ↗`,
      );
      link.href = parsed.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute(
        "aria-label",
        `Open ${item.title} on ${providerName(parsed.provider)} (opens a new tab)`,
      );
      actions.append(link);
    } catch {
      copy.append(
        element(
          "p",
          "field-help",
          "This saved reference has an unsupported source link.",
        ),
      );
    }
  }
  const remove = element("button", "text-button remove-reference", "Remove");
  remove.setAttribute("aria-label", `Remove ${item.title} from board`);
  remove.addEventListener("click", () => onRemove(item.id));
  actions.append(remove);
  card.append(copy, actions);
  return card;
}
