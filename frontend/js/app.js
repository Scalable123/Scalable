import { iconify } from "./icons.js";
import {
  setupVideoImporter,
  renderVideoReference,
  retainLocalVideos,
  releaseLocalVideo,
} from "./video-library.js";
import {
  setupAudioImporter,
  renderAudioReference,
  retainLocalAudio,
  releaseLocalAudio,
} from "./audio-library.js";
import { boardService, prompts } from "./board-service.js";
import { setupCustomization } from "./customize.js";
import { createCreativeDirection } from "./ai-service.js";

iconify(document.body);
const $ = (selector) => document.querySelector(selector);
const grid = $("#board-grid");
let board;
let boardVersion = 0;
let filter = "all";
let referenceFile = null;
let referenceUrl = null;
let toastTimeout;
let pendingBoardDeletion = null;
let deletingBoard = false;
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
  const card = element(
    "figure",
    `board-card image-card ${item.imported ? "imported" : item.position}`,
  );
  const img = element("img");
  img.src = item.url;
  img.alt = item.description;
  if (item.imagePosition) img.style.objectPosition = item.imagePosition;
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
  if (item.imported) {
    const remove = element("button", "remove-imported-image", "×");
    remove.setAttribute("aria-label", `Remove imported image ${item.title}`);
    remove.addEventListener("click", () => referenceHandlers.onRemove(item.id));
    card.append(remove);
  }
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
    "has-imported-images",
    board.items.some((item) => item.type === "image" && item.imported),
  );
  $("#import-audio").disabled = false;
  $("#import-video").disabled = false;
  grid.classList.toggle(
    "no-sound",
    !board.items.some((item) => item.type === "sound" && !item.imported),
  );
  document.querySelectorAll("audio,video").forEach((audio) => audio.pause());
  grid.replaceChildren();
  const videos = board.items.filter((item) => item.type === "video");
  $("#video-list").replaceChildren(
    ...videos.map((item) => renderVideoReference(item, videoHandlers)),
  );
  $("#video-library").hidden =
    !(filter === "all" || filter === "video") || !videos.length;
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
    (filter === "video" && videos.length > 0) ||
    (filter === "song" && songs.length > 0) ||
    (filter === "sound" &&
      sounds.length > 0 &&
      !board.items.some((item) => item.type === "sound" && !item.imported));
  board.items
    .filter(
      (item) =>
        item.type !== "song" &&
        (!item.imported || item.type === "image") &&
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
          : filter === "video"
            ? "No videos yet. Use Import video to add a YouTube reference or a local clip."
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
    document.querySelectorAll("audio,video").forEach((audio) => audio.pause());
    const removed = board.items.find((item) => item.id === id);
    releaseLocalAudio(id);
    releaseLocalVideo(id);
    board.items = board.items.filter((item) => item.id !== id);
    $("#save-label").textContent = "Save board";
    renderBoard();
    notify("Reference removed. Save to keep your changes.");
    $(
      removed?.type === "video"
        ? "#import-video"
        : removed?.type === "image"
          ? "#prompt"
          : "#import-audio",
    ).focus();
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
const videoHandlers = {
  element,
  onRemove: referenceHandlers.onRemove,
  onReattach(id, fileInfo) {
    const item = board.items.find((item) => item.id === id);
    if (!item) {
      releaseLocalVideo(id);
      return;
    }
    item.fileInfo = fileInfo;
    item.sourceKey = `video-file:${fileInfo.name}:${fileInfo.size}:${fileInfo.lastModified}`;
    $("#save-label").textContent = "Save board";
    renderBoard();
    notify(
      "Video attached for this visit. Save to keep its updated file details.",
    );
  },
};
setupVideoImporter({
  element,
  getBoardId: () => board?.id,
  onImport(item, targetBoardId) {
    if (!board || (targetBoardId && board.id !== targetBoardId))
      throw new Error(
        "The board changed while the video was loading. Open the importer and try again.",
      );
    if (board.items.some((existing) => existing.sourceKey === item.sourceKey))
      return 0;
    board.items.push(item);
    selectFilter("all");
    $("#save-label").textContent = "Save board";
    return 1;
  },
});
function resetResearchUI() {
  $("#generate").disabled = false;
  $("#generate").firstElementChild.textContent = "Explore this feeling";
  grid.setAttribute("aria-busy", "false");
}
setupCustomization();
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
  const runVersion = ++boardVersion;
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
    try {
      const direction = await createCreativeDirection({
        prompt,
        ...researchOptions(),
      });
      next.title = direction.title;
      next.description = direction.description;
      next.mode = "ai";
      next.items = next.items.map((item) =>
        item.type === "palette"
          ? { ...item, colors: direction.palette }
          : item.type === "note"
            ? { ...item, text: direction.note }
            : item,
      );
      next.items = next.items.filter(
        (item) =>
          (item.type !== "song" || researchOptions().includeSongs) &&
          (item.type !== "sound" || researchOptions().includeSounds),
      );
      if (researchOptions().includeSongs) {
        next.items.push(...direction.songs.map((song, index) => ({
          id: `ai-song-${index}`,
          type: "song",
          ...song,
          discoveryUrl: `https://open.spotify.com/search/${encodeURIComponent(`${song.title} ${song.artist}`)}`,
          linkKind: "catalog-search",
          isSample: false,
        })));
      }
      if (researchOptions().includeSounds) {
        next.items.push(...direction.sounds.map((sound, index) => ({
          id: `ai-sound-${index}`,
          type: "sound",
          ...sound,
          isSample: false,
        })));
      }
    } catch {
      notify("AI is unavailable, so a local sample direction is shown instead.");
    }
    if (runVersion !== boardVersion) return;
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
    notify(next.mode === "ai" ? "AI direction composed." : "Sample direction composed.");
  } catch {
    if (runVersion === boardVersion)
      $("#input-error").textContent =
        "We could not compose this board. Your current board is still here; please try again.";
  } finally {
    if (runVersion === boardVersion) resetResearchUI();
  }
});
$("#save-board").addEventListener("click", async () => {
  if (!board) return;
  try {
    await boardService.saveBoard(board);
    $("#save-label").textContent = "Saved locally";
    await updateSavedCount();
    notify(
      "Board saved locally, including imported media references. Uploaded images are not saved; local audio/video files need reattaching in a new visit.",
    );
  } catch {
    notify("Could not save. Browser storage may be disabled or full.");
  }
});
async function renderSavedBoards() {
  const boards = await boardService.listBoards();
  $("#saved-count").textContent = boards.length;
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
    row.dataset.boardId = saved.id;
    const image = saved.items.find((item) => item.type === "image");
    const img = image?.url
      ? element("img")
      : element("span", "saved-thumbnail", "✳");
    if (image?.url) {
      img.src = image.url;
      img.alt = "";
    } else img.setAttribute("aria-hidden", "true");
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
      boardVersion += 1;
      resetResearchUI();
      retainLocalAudio(saved.items);
      retainLocalVideos(saved.items);
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
    open.dataset.openBoard = saved.id;
    const remove = element("button", "saved-delete", "Delete");
    remove.type = "button";
    remove.setAttribute("aria-label", `Delete saved mood board ${saved.title}`);
    remove.addEventListener("click", () => {
      pendingBoardDeletion = {
        id: saved.id,
        title: saved.title,
        index: boards.indexOf(saved),
      };
      $("#delete-board-name").textContent = saved.title;
      $("#delete-board-error").textContent = "";
      $("#delete-board-dialog").showModal();
      $("#cancel-delete-board").focus();
    });
    const actions = element("div", "saved-actions");
    actions.append(open, remove);
    row.append(img, copy, actions);
    list.append(row);
  });
  showDialog("Your saved directions", list);
  return list;
}
$("#saved-boards").addEventListener("click", async () => {
  try {
    await renderSavedBoards();
  } catch {
    notify("Saved boards could not be read from this browser.");
  }
});
const deleteDialog = $("#delete-board-dialog");
$("#cancel-delete-board").addEventListener("click", () => {
  if (!deletingBoard) deleteDialog.close();
});
deleteDialog.addEventListener("cancel", (event) => {
  if (deletingBoard) event.preventDefault();
});
deleteDialog.addEventListener("close", () => {
  if (!deleteDialog.open && !deletingBoard) pendingBoardDeletion = null;
});
$("#confirm-delete-board").addEventListener("click", async () => {
  if (!pendingBoardDeletion || deletingBoard) return;
  const target = pendingBoardDeletion;
  deletingBoard = true;
  $("#confirm-delete-board").disabled = true;
  $("#confirm-delete-board").textContent = "Deleting…";
  $("#cancel-delete-board").disabled = true;
  $("#delete-board-error").textContent = "";
  let removed;
  try {
    removed = await boardService.deleteBoard(target.id);
  } catch {
    $("#delete-board-error").textContent =
      "Deletion could not be confirmed. Please try again. Your current canvas has been kept.";
    deletingBoard = false;
    $("#confirm-delete-board").disabled = false;
    $("#confirm-delete-board").textContent = "Delete mood board";
    $("#cancel-delete-board").disabled = false;
    $("#cancel-delete-board").focus();
    return;
  }
  const keptDraft = board?.id === target.id;
  if (keptDraft) {
    // Do not let a late research result restore the deleted saved identity.
    boardVersion += 1;
    resetResearchUI();
    board = {
      ...board,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    $("#save-label").textContent = "Save board";
  }
  await updateSavedCount();
  let list;
  try {
    list = await renderSavedBoards();
  } catch {
    showDialog(
      "Your saved directions",
      element(
        "p",
        "dialog-copy",
        "The saved copy was removed, but the list could not be refreshed. Close this window and open Saved boards again.",
      ),
    );
  }
  deletingBoard = false;
  pendingBoardDeletion = null;
  deleteDialog.close();
  $("#confirm-delete-board").disabled = false;
  $("#confirm-delete-board").textContent = "Delete mood board";
  $("#cancel-delete-board").disabled = false;
  const remaining = list?.querySelectorAll("[data-open-board]");
  (remaining?.length
    ? remaining[Math.min(target.index, remaining.length - 1)]
    : $("#close-dialog")
  ).focus();
  notify(
    `${removed ? "Saved mood board deleted." : "This mood board was already deleted."}${keptDraft ? " Your current canvas is now an unsaved draft." : ""}`,
  );
});
$("#new-board").addEventListener("click", async () => {
  const runVersion = ++boardVersion;
  resetResearchUI();
  document.querySelectorAll("audio,video").forEach((audio) => audio.pause());
  retainLocalAudio([]);
  retainLocalVideos([]);
  $("#prompt").value = "";
  updateCharacters();
  removeReference();
  if (board)
    board.items.forEach((item) => {
      if (item.type === "image") item.pinned = false;
    });
  $("#include-songs").checked = true;
  $("#include-sounds").checked = true;
  const next = await boardService.research({
    prompt: "",
    ...researchOptions(),
  });
  if (runVersion !== boardVersion) return;
  board = next;
  selectFilter("all");
  $("#save-label").textContent = "Save board";
  $("#prompt").focus();
  notify(
    "A fresh start. The canvas shows a sample until you explore your own brief.",
  );
});
$("#about").addEventListener("click", () =>
  showDialog(
    "Welcome to The Studio",
    element(
      "p",
      "dialog-copy",
      "Make The Studio yours with light or dark mode, accents, spacing, edges, typography, layout, and reading size. Use Import audio for music links, local recordings, or a demo provider library. Explore images, palettes, real curated song examples, and separate ambient sound directions. Briefs select sample collections; uploads are previewed only. Song links open Spotify searches. Local audio and video can play in this browser. YouTube players load only when requested. Login and account pages are frontend previews, not authenticated accounts. Provider connections are demo previews; no live AI research, streaming service, account, SQL database, or backend is connected. Boards and appearance preferences stay in browser storage.",
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
try {
  const profile = JSON.parse(localStorage.getItem("scalable.profile.v1"));
  if (
    typeof profile?.name === "string" &&
    profile.name.trim() &&
    profile.name.length <= 80
  ) {
    $(".profile > .avatar").textContent = Array.from(
      profile.name.trim(),
    )[0].toUpperCase();
    $(".profile > div").replaceChildren(
      document.createTextNode(profile.name),
      element("small", "", "Local demo profile ↗"),
    );
  }
} catch {
  /* The default local workspace is available without a profile. */
}
updateCharacters();
await updateSavedCount();
const initialVersion = boardVersion;
const initialBoard = await boardService.research({
  prompt: $("#prompt").value,
  ...researchOptions(),
});
if (initialVersion === boardVersion) {
  board = initialBoard;
  renderBoard();
}

// Account connection cards can deep-link to the appropriate local import preview.
const importTarget = new URL(location.href).searchParams.get("import");
const importButtons = {
  audio: "#import-audio",
  video: "#import-video",
};
if (Object.hasOwn(importButtons, importTarget) && board) {
  $(importButtons[importTarget]).click();
  const clean = new URL(location.href);
  clean.searchParams.delete("import");
  history.replaceState(null, "", clean.pathname + clean.search + clean.hash);
}
