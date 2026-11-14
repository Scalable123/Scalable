import { boardService, prompts } from "./board-service.js";

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
const designs = {
  studio: "01 — Warm, tactile, editorial.",
  nocturne: "02 — Immersive, atmospheric, after dark.",
  gallery: "03 — Bold, spacious, gallery-inspired.",
};
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
function setDesign(design) {
  if (!designs[design]) return;
  document.body.dataset.design = design;
  $("#design-description").textContent = designs[design];
  $(".version").textContent = `/ 0${Object.keys(designs).indexOf(design) + 1}`;
  document
    .querySelectorAll("[data-design-choice]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.designChoice === design),
      ),
    );
  try {
    localStorage.setItem("scalable.design", design);
  } catch {
    /* Theme still works with blocked storage. */
  }
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
    $("#save-board span").textContent = "Save board";
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
function renderMusic(item) {
  const card = element("section", "board-card music-card");
  card.setAttribute("aria-label", "Sample soundtrack concept");
  const top = element("div", "music-top");
  top.append(
    element("span", "", "SET THE FREQUENCY"),
    element("span", "", "↗"),
  );
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
    element("span", "", "Soundtrack concept · no audio"),
  );
  const info = element("button", "music-info", "↗");
  info.setAttribute("aria-label", "About this soundtrack concept");
  info.addEventListener("click", () =>
    showDialog(
      item.title,
      element(
        "p",
        "dialog-copy",
        `${item.artist}. ${item.description}. This is a visual concept, not a playable track. Real artist recommendations, verified catalog links, and any licensed previews will come from the future music API.`,
      ),
    ),
  );
  bottom.append(copy, info);
  card.append(top, wave, bottom);
  return card;
}
function renderBoard() {
  $("#board-title").replaceChildren(
    document.createTextNode(board.title),
    element("span", "", "."),
  );
  $("#board-description").textContent = board.description;
  $('[data-filter="all"] span').textContent = board.items.length;
  grid.classList.toggle("filtered", filter !== "all");
  grid.replaceChildren();
  board.items
    .filter((item) => filter === "all" || item.type === filter)
    .forEach((item) => {
      if (item.type === "image") grid.append(renderImage(item));
      if (item.type === "palette") grid.append(renderPalette(item));
      if (item.type === "music") grid.append(renderMusic(item));
      if (item.type === "note") {
        const note = element("div", "board-card note-card");
        note.append(element("span", "", "✳"), element("p", "", item.text));
        grid.append(note);
      }
    });
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
document
  .querySelectorAll("[data-design-choice]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      setDesign(button.dataset.designChoice),
    ),
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
    const next = await boardService.research({ prompt, referenceFile });
    // Preserve explicitly pinned choices when refining this local exploration.
    const pinned = (board?.items || []).filter(
      (item) => item.type === "image" && item.pinned,
    );
    next.items = next.items.map(
      (item) => pinned.find((pin) => pin.id === item.id) || item,
    );
    board = next;
    selectFilter("all");
    $("#save-board span").textContent = "Save board";
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
    $("#save-board span").textContent = "Saved locally";
    await updateSavedCount();
    notify("Saved in this browser. Reference uploads are not saved.");
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
        board = saved;
        $("#prompt").value = saved.prompt;
        updateCharacters();
        removeReference();
        selectFilter("all");
        $("#save-board span").textContent = "Saved locally";
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
  $("#prompt").value = "";
  updateCharacters();
  removeReference();
  if (board)
    board.items.forEach((item) => {
      if (item.type === "image") item.pinned = false;
    });
  board = await boardService.research({ prompt: "" });
  selectFilter("all");
  $("#save-board span").textContent = "Save board";
  $("#prompt").focus();
  notify(
    "A fresh start. The canvas shows a sample until you explore your own brief.",
  );
});
$("#explore").addEventListener("click", () => $("#prompt").focus());
$("#about").addEventListener("click", () =>
  showDialog(
    "Three ways to follow a feeling",
    element(
      "p",
      "dialog-copy",
      "Use the top switcher to compare The Studio, Nocturne, and The Gallery. All three use the same interactive workspace. This frontend-only prototype uses local, curated sample photography and palettes. Briefs select sample collections; uploads are previewed only. No AI research, music playback, account, SQL database, or backend is connected. Saved boards live in browser storage.",
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
  setDesign(localStorage.getItem("scalable.design") || "studio");
} catch {
  setDesign("studio");
}
updateCharacters();
await updateSavedCount();
board = await boardService.research({ prompt: $("#prompt").value });
renderBoard();
