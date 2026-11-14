import {
  setupAudioImporter,
  renderAudioReference,
  retainLocalAudio,
  releaseLocalAudio,
} from "./audio-library.js";
import { boardService, prompts } from "./board-service.js";
import {
  onAppearanceChange,
  updateAppearance,
  resetAppearance,
} from "./appearance.js";

// Inline vector symbols avoid platform-dependent emoji and missing arrow glyphs.
function iconify(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode())
    if (/[✳↗↘↥]/.test(walker.currentNode.textContent))
      nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const fragment = document.createDocumentFragment();
    node.textContent
      .split(/([✳↗↘↥])/)
      .filter(Boolean)
      .forEach((part) => {
        if (!/^[✳↗↘↥]$/.test(part)) {
          fragment.append(document.createTextNode(part));
          return;
        }
        const icon = document.createElement("span");
        icon.className = `symbol ${part === "✳" ? "symbol-star" : part === "↘" ? "symbol-down" : part === "↥" ? "symbol-upload" : "symbol-arrow"}`;
        icon.setAttribute("aria-hidden", "true");
        fragment.append(icon);
      });
    node.replaceWith(fragment);
  });
}
iconify(document.body);
const $ = (selector) => document.querySelector(selector);
const grid = $("#board-grid");
let board;
let filter = "all";
let referenceFile = null;
let referenceUrl = null;
let toastTimeout;
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) {
    node.textContent = text;
    iconify(node);
  }
  return node;
}
function notify(message) {
  clearTimeout(toastTimeout);
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  toastTimeout = setTimeout(
    () => $("#toast").classList.remove("visible"),
    4000,
  );
}
function showDialog(title, content) {
  $("#dialog-title").textContent = title;
  $("#dialog-content").replaceChildren(content);
  if (!$("#dialog").open) $("#dialog").showModal();
}
function renderImage(item) {
  const card = element("figure", `board-card image-card ${item.position}`);
  const img = element("img");
  img.src = item.url;
  img.alt = item.description;
  const caption = element("figcaption");
  const source = element("a", "", "View image source ↗");
  source.href = item.sourceUrl;
  source.target = "_blank";
  source.rel = "noopener noreferrer";
  source.title = item.sourceLabel;
  caption.append(element("strong", "", item.title), source);
  const pin = element("button", "pin", item.pinned ? "✓" : "+");
  pin.type = "button";
  pin.setAttribute(
    "aria-label",
    `${item.pinned ? "Unpin" : "Pin"} ${item.title}`,
  );
  pin.setAttribute("aria-pressed", String(item.pinned));
  pin.addEventListener("click", () => {
    item.pinned = !item.pinned;
    pin.textContent = item.pinned ? "✓" : "+";
    pin.setAttribute("aria-pressed", String(item.pinned));
    pin.setAttribute(
      "aria-label",
      `${item.pinned ? "Unpin" : "Pin"} ${item.title}`,
    );
    $("#save-label").textContent = "Save board";
    notify(
      item.pinned
        ? "Pinned to your direction. Save to keep your changes."
        : "Image unpinned.",
    );
  });
  card.append(img, caption, pin);
  return card;
}
function renderPalette(item) {
  const card = element("section", "board-card palette-card");
  card.setAttribute("aria-label", "Color palette");
  const colors = element("div", "palette-colors");
  item.colors.forEach((color) => {
    const button = element("button", "color");
    button.type = "button";
    button.style.setProperty("--swatch", color.hex);
    button.title = `${color.name} · ${color.hex} · Copy color`;
    button.setAttribute("aria-label", `Copy ${color.name}, ${color.hex}`);
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(color.hex);
        notify(`${color.hex} copied. A little color to take with you.`);
      } catch {
        showDialog(
          "Your color",
          element(
            "p",
            "dialog-copy",
            `${color.name}: ${color.hex} — select and copy this value.`,
          ),
        );
      }
    });
    colors.append(button);
  });
  const footer = element("div", "palette-footer");
  footer.append(
    element("span", "", "The colors of quiet"),
    element("span", "", "Click to copy ↗"),
  );
  card.append(
    element("span", "card-eyebrow", "A PALETTE TO FEEL"),
    colors,
    footer,
  );
  return card;
}
function renderSound(item) {
  const card = element("section", "board-card music-card");
  card.setAttribute("aria-label", "Ambient sound direction");
  const top = element("div", "music-top");
  top.append(element("span", "", "AMBIENT SOUNDS"), element("span", "", "↗"));
  const wave = element("div", "waveform");
  wave.setAttribute("aria-hidden", "true");
  [
    7, 12, 19, 11, 16, 9, 15, 20, 10, 16, 8, 12, 17, 9, 14, 20, 12, 6, 13, 18,
    10, 15, 8, 11,
  ].forEach((height) => {
    const bar = element("i");
    bar.style.setProperty("--height", `${height}px`);
    wave.append(bar);
  });
  const bottom = element("div", "music-bottom");
  const copy = element("div");
  copy.append(
    element("strong", "", item.title),
    element("span", "", "Sound concept · no audio"),
  );
  const info = element("button", "music-info", "↗");
  info.setAttribute("aria-label", "About this ambient sound");
  info.addEventListener("click", () =>
    showDialog(
      item.title,
      element(
        "p",
        "dialog-copy",
        `${item.description}. This is an ambient sound direction, separate from the song recommendations below. No recording is attached. A future sound provider will supply licensed recordings and any permitted previews.`,
      ),
    ),
  );
  bottom.append(copy, info);
  card.append(top, wave, bottom);
  return card;
}
function renderSong(item, index) {
  if (item.imported)
    return renderAudioReference(item, index, referenceHandlers);
  const card = element("article", "song-card");
  card.append(
    element("span", "song-number", String(index + 1).padStart(2, "0")),
  );
  const copy = element("div", "song-copy");
  copy.append(
    element("h4", "", item.title),
    element("p", "song-artist", item.artist),
    element("p", "song-reason", item.explanation),
    element("span", "song-tags", item.tags),
  );
  card.append(copy);
  // Only allow outbound HTTPS catalog searches, including for browser-restored DTOs.
  let url;
  try {
    url = new URL(item.discoveryUrl);
  } catch {
    /* No link for absent/invalid catalog data. */
  }
  if (
    url?.protocol === "https:" &&
    url.hostname === "open.spotify.com" &&
    url.pathname.startsWith("/search/")
  ) {
    const link = element("a", "song-link", "Find on Spotify ↗");
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute(
      "aria-label",
      `Find ${item.title} by ${item.artist} on Spotify (opens a catalog search)`,
    );
    card.append(link);
  }
  return card;
}
function researchOptions() {
  return {
    includeSongs: $("#include-songs").checked,
    includeSounds: $("#include-sounds").checked,
  };
}
function renderBoard() {
  $("#board-title").replaceChildren(
    document.createTextNode(board.title),
    element("span", "", "."),
  );
  $("#board-description").textContent = board.description;
  $('[data-filter="all"] span').textContent = board.items.length;
  grid.classList.toggle("filtered", filter !== "all");
  grid.classList.toggle(
    "no-sound",
    !board.items.some((item) => item.type === "sound" && !item.imported),
  );
  document.querySelectorAll("audio").forEach((audio) => audio.pause());
  grid.replaceChildren();
  const songs = board.items.filter((item) => item.type === "song");
  $("#song-list").replaceChildren(...songs.map(renderSong));
  $("#song-section .sample-label").textContent = songs.some(
    (item) => item.imported,
  )
    ? "Samples & your references"
    : "Curated sample picks";
  const sounds = board.items.filter(
    (item) => item.type === "sound" && item.imported,
  );
  $("#sound-list").replaceChildren(
    ...sounds.map((item, index) =>
      renderAudioReference(item, index, referenceHandlers),
    ),
  );
  $("#sound-library").hidden =
    !(filter === "all" || filter === "sound") || !sounds.length;
  $("#song-section").hidden =
    !(filter === "all" || filter === "song") || songs.length === 0;
  grid.hidden =
    (filter === "song" && songs.length > 0) ||
    (filter === "sound" &&
      sounds.length > 0 &&
      !board.items.some((item) => item.type === "sound" && !item.imported));
  board.items
    .filter(
      (item) =>
        item.type !== "song" &&
        !item.imported &&
        (filter === "all" || item.type === filter),
    )
    .forEach((item) => {
      if (item.type === "image") grid.append(renderImage(item));
      if (item.type === "palette") grid.append(renderPalette(item));
      if (item.type === "sound") grid.append(renderSound(item));
      if (item.type === "note") {
        const note = element("div", "board-card note-card");
        note.append(element("span", "", "✳"), element("p", "", item.text));
        grid.append(note);
      }
    });
  if (!grid.hidden && !grid.children.length) {
    grid.append(
      element(
        "p",
        "empty-state",
        filter === "song"
          ? "No song picks in this board yet. Enable song recommendations and explore your brief again."
          : filter === "sound"
            ? "No ambient sounds in this board. Enable ambient sounds and explore your brief again."
            : "No items in this view yet.",
      ),
    );
  }
}
function selectFilter(next) {
  filter = next;
  document
    .querySelectorAll("[data-filter]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.filter === filter),
      ),
    );
  if (board) renderBoard();
}
function updateCharacters() {
  $("#character-count").textContent = `${$("#prompt").value.length}/2000`;
}
async function updateSavedCount() {
  try {
    $("#saved-count").textContent = (await boardService.listBoards()).length;
  } catch {
    $("#saved-count").textContent = "—";
  }
}
function removeReference() {
  if (referenceUrl) URL.revokeObjectURL(referenceUrl);
  referenceUrl = null;
  referenceFile = null;
  $("#reference").value = "";
  $("#reference-image").removeAttribute("src");
  $("#reference-preview").hidden = true;
  $("#upload-label").hidden = false;
}
const referenceHandlers = {
  element,
  onRemove(id) {
    document.querySelectorAll("audio").forEach((audio) => audio.pause());
    releaseLocalAudio(id);
    board.items = board.items.filter((item) => item.id !== id);
    $("#save-label").textContent = "Save board";
    renderBoard();
    notify("Reference removed. Save to keep your changes.");
    $("#import-audio").focus();
  },
  onReattach(id, fileInfo) {
    const item = board.items.find((item) => item.id === id);
    if (!item) {
      releaseLocalAudio(id);
      return;
    }
    item.fileInfo = fileInfo;
    item.sourceKey = `file:${fileInfo.name}:${fileInfo.size}:${fileInfo.lastModified}`;
    $("#save-label").textContent = "Save board";
    renderBoard();
    notify(
      "Local file attached for this visit. Save to keep its updated details.",
    );
  },
};
setupAudioImporter({
  element,
  getBoardId: () => board?.id,
  onImport(items, targetBoardId) {
    if (!board || (targetBoardId && board.id !== targetBoardId))
      throw new Error(
        "The board changed while the file was loading. Open the importer and try again.",
      );
    const existing = new Set(
      board.items.filter((item) => item.imported).map((item) => item.sourceKey),
    );
    const added = items.filter((item) => {
      if (existing.has(item.sourceKey)) return false;
      existing.add(item.sourceKey);
      return true;
    });
    board.items.push(...added);
    if (added.length) {
      selectFilter("all");
      $("#save-label").textContent = "Save board";
      notify(
        `${added.length} audio reference${added.length === 1 ? "" : "s"} added. Save your board to keep the details.`,
      );
    }
    return added.length;
  },
});
onAppearanceChange((preferences) => {
  const dark = document.documentElement.dataset.theme === "dark";
  $("#theme-toggle").setAttribute("aria-pressed", String(dark));
  $("#theme-toggle").textContent = dark ? "Light mode" : "Dark mode";
  $("#theme-toggle").setAttribute(
    "aria-label",
    dark ? "Switch to light mode" : "Switch to dark mode",
  );
  for (const field of [
    "theme",
    "density",
    "corners",
    "typography",
    "layout",
    "canvas",
    "textSize",
  ])
    $("#appearance-form").elements[field].value = preferences[field];
  $("#appearance-form").elements.accent.value = preferences.accent;
});
function appearanceStatus(saved) {
  $("#appearance-status").textContent = saved
    ? "Preferences saved in this browser."
    : "Applied for this visit. Browser storage is unavailable, so preferences could not be saved.";
}
$("#theme-toggle").addEventListener("click", () => {
  const saved = updateAppearance({
    theme: document.documentElement.dataset.theme === "dark" ? "light" : "dark",
  });
  appearanceStatus(saved);
  if (!saved)
    notify("Theme applied for this visit. Browser storage is unavailable.");
});
$("#customize").addEventListener("click", () =>
  $("#appearance-dialog").showModal(),
);
for (const id of ["close-appearance", "done-appearance"])
  $("#" + id).addEventListener("click", () => $("#appearance-dialog").close());
$("#appearance-form").addEventListener("submit", (event) =>
  event.preventDefault(),
);
$("#appearance-form").addEventListener("change", (event) => {
  appearanceStatus(
    updateAppearance({ [event.target.name]: event.target.value }),
  );
});
$("#reset-appearance").addEventListener("click", () =>
  appearanceStatus(resetAppearance()),
);
document
  .querySelectorAll("[data-filter]")
  .forEach((button) =>
    button.addEventListener("click", () => selectFilter(button.dataset.filter)),
  );
document.querySelectorAll("[data-prompt]").forEach((button) =>
  button.addEventListener("click", () => {
    $("#prompt").value = prompts[button.dataset.prompt];
    updateCharacters();
    $("#prompt").focus();
  }),
);
$("#prompt").addEventListener("input", updateCharacters);
$("#reference").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  $("#input-error").textContent = "";
  if (!file) return;
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  ) {
    $("#input-error").textContent =
      "Please choose a JPG, PNG or WebP image smaller than 10 MB.";
    event.target.value = "";
    return;
  }
  const candidate = URL.createObjectURL(file);
  const probe = new Image();
  probe.src = candidate;
  try {
    await probe.decode();
  } catch {
    URL.revokeObjectURL(candidate);
    event.target.value = "";
    $("#input-error").textContent =
      "This image could not be read. Please try another file.";
    return;
  }
  removeReference();
  referenceFile = file;
  referenceUrl = candidate;
  $("#reference-image").src = referenceUrl;
  $("#reference-name").textContent = file.name;
  $("#reference-preview").hidden = false;
  $("#upload-label").hidden = true;
  notify("Reference added locally. Demo results do not analyze uploads yet.");
});
$("#remove-reference").addEventListener("click", removeReference);
$("#prompt-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const prompt = $("#prompt").value.trim();
  if (!prompt) {
    $("#input-error").textContent =
      "Add a few words about your direction to get started.";
    $("#prompt").focus();
    return;
  }
  const button = $("#generate");
  button.disabled = true;
  button.firstElementChild.textContent = "Composing a sample…";
  grid.setAttribute("aria-busy", "true");
  $("#input-error").textContent = "";
  try {
    const next = await boardService.research({
      prompt,
      referenceFile,
      ...researchOptions(),
    });
    // Preserve explicitly pinned choices when refining this local exploration.
    const pinned = (board?.items || []).filter(
      (item) => item.type === "image" && item.pinned,
    );
    next.items = next.items.map(
      (item) => pinned.find((pin) => pin.id === item.id) || item,
    );
    next.items.push(...(board?.items || []).filter((item) => item.imported));
    board = next;
    selectFilter("all");
    $("#save-label").textContent = "Save board";
    notify(
      "Sample direction composed. Live research will connect through .NET.",
    );
  } catch {
    $("#input-error").textContent =
      "We could not compose this board. Your current board is still here; please try again.";
  } finally {
    button.disabled = false;
    button.firstElementChild.textContent = "Explore this feeling";
    grid.setAttribute("aria-busy", "false");
  }
});
$("#save-board").addEventListener("click", async () => {
  if (!board) return;
  try {
    await boardService.saveBoard(board);
    $("#save-label").textContent = "Saved locally";
    await updateSavedCount();
    notify(
      "Board saved locally. Audio file details are saved; files must be reattached in a new visit. Reference images are not saved.",
    );
  } catch {
    notify("Could not save. Browser storage may be disabled or full.");
  }
});
$("#saved-boards").addEventListener("click", async () => {
  try {
    const boards = await boardService.listBoards();
    const list = element("div");
    if (!boards.length)
      list.append(
        element(
          "p",
          "dialog-copy",
          "A space for your favorite directions. Save your first board to find it here. Boards stay in this browser.",
        ),
      );
    boards.forEach((saved) => {
      const row = element("div", "saved-item");
      const img = element("img");
      img.src = saved.items.find((item) => item.type === "image").url;
      img.alt = "";
      const copy = element("div");
      copy.append(
        element("strong", "", saved.title),
        element(
          "small",
          "",
          `Local demo · ${new Date(saved.createdAt).toLocaleDateString()}`,
        ),
      );
      const open = element("button", "", "Open ↗");
      open.addEventListener("click", () => {
        retainLocalAudio(saved.items);
        board = saved;
        $("#include-songs").checked =
          saved.researchOptions?.includeSongs ??
          saved.items.some((item) => item.type === "song");
        $("#include-sounds").checked =
          saved.researchOptions?.includeSounds ??
          saved.items.some((item) => item.type === "sound");
        $("#prompt").value = saved.prompt;
        updateCharacters();
        removeReference();
        selectFilter("all");
        $("#save-label").textContent = "Saved locally";
        $("#dialog").close();
      });
      row.append(img, copy, open);
      list.append(row);
    });
    showDialog("Your saved directions", list);
  } catch {
    notify("Saved boards could not be read from this browser.");
  }
});
$("#new-board").addEventListener("click", async () => {
  document.querySelectorAll("audio").forEach((audio) => audio.pause());
  retainLocalAudio([]);
  $("#prompt").value = "";
  updateCharacters();
  removeReference();
  if (board)
    board.items.forEach((item) => {
      if (item.type === "image") item.pinned = false;
    });
  $("#include-songs").checked = true;
  $("#include-sounds").checked = true;
  board = await boardService.research({ prompt: "", ...researchOptions() });
  selectFilter("all");
  $("#save-label").textContent = "Save board";
  $("#prompt").focus();
  notify(
    "A fresh start. The canvas shows a sample until you explore your own brief.",
  );
});
$("#explore").addEventListener("click", () => $("#prompt").focus());
$("#about").addEventListener("click", () =>
  showDialog(
    "Welcome to The Studio",
    element(
      "p",
      "dialog-copy",
      "Make The Studio yours with light or dark mode, accents, spacing, edges, typography, layout, and reading size. Use Import audio for music links, local recordings, or a demo provider library. Explore images, palettes, real curated song examples, and separate ambient sound directions. Briefs select sample collections; uploads are previewed only. Song links open Spotify searches. Local audio can play in this browser. Provider connections are demo previews; no live AI research, streaming service, account, SQL database, or backend is connected. Boards and appearance preferences stay in browser storage.",
    ),
  ),
);
$("#close-dialog").addEventListener("click", () => $("#dialog").close());
$("#dialog").addEventListener("click", (event) => {
  if (
    event.target === $("#dialog") &&
    (event.clientX < $("#dialog").getBoundingClientRect().left ||
      event.clientX > $("#dialog").getBoundingClientRect().right ||
      event.clientY < $("#dialog").getBoundingClientRect().top ||
      event.clientY > $("#dialog").getBoundingClientRect().bottom)
  )
    $("#dialog").close();
});
updateCharacters();
await updateSavedCount();
board = await boardService.research({
  prompt: $("#prompt").value,
  ...researchOptions(),
});
renderBoard();

$("#import-audio").disabled = false;
