// Local demo data only. Replace this service with authorized, paginated backend DTOs.
const assets = new URL("../assets/", import.meta.url);
const sampleSource =
  "https://github.com/StartBootstrap/startbootstrap-grayscale";
const pin = (id, title, asset, description) => ({
  id,
  title,
  description,
  imageUrl: new URL(asset, assets).href,
  imageSourceUrl:
    asset === "water.jpg"
      ? "https://github.com/StartBootstrap/startbootstrap-landing-page"
      : sampleSource,
});
const demoBoards = [
  {
    id: "demo-slow-coast",
    title: "The slow coast",
    description: "Misty mornings, quiet water, and a little room to breathe.",
    pins: [
      pin(
        "coast-mist",
        "Mornings in the mist",
        "mountains.jpg",
        "Clouds moving through a forested mountain valley.",
      ),
      pin(
        "coast-tides",
        "Follow the tide",
        "water.jpg",
        "Soft blue water meeting a pale horizon.",
      ),
      pin(
        "coast-ridges",
        "A slower perspective",
        "coast.jpg",
        "Layers of dark mountain ridges above the clouds.",
      ),
      pin(
        "coast-still",
        "The art of standing still",
        "water.jpg",
        "Fine ripples across calm blue water.",
      ),
      pin(
        "coast-horizon",
        "Leave a little space",
        "mountains.jpg",
        "An open, misty mountain landscape.",
      ),
      pin(
        "coast-fog",
        "Between sky and earth",
        "coast.jpg",
        "A quiet silhouette against a cloudy sky.",
      ),
    ],
  },
  {
    id: "demo-earth",
    title: "Earth & atmosphere",
    description: "Natural forms and soft, grounded landscapes.",
    pins: [
      pin(
        "earth-layers",
        "Layers of the landscape",
        "coast.jpg",
        "Sculptural mountain shapes in monochrome.",
      ),
      pin(
        "earth-forest",
        "In the folds of the forest",
        "mountains.jpg",
        "Trees disappearing into a low bank of fog.",
      ),
      pin(
        "earth-water",
        "An organic rhythm",
        "water.jpg",
        "An abstract pattern of gentle ripples.",
      ),
      pin(
        "earth-distance",
        "A sense of distance",
        "coast.jpg",
        "Dark ridges fading toward the horizon.",
      ),
    ],
  },
  {
    id: "demo-after-rain",
    title: "After the rain",
    description: "Moody silhouettes, softer edges, and reflective moments.",
    pins: [
      pin(
        "rain-clouds",
        "Let the clouds settle",
        "mountains.jpg",
        "Bright fog suspended between dark mountains.",
      ),
      pin(
        "rain-ridges",
        "Silhouettes at dusk",
        "coast.jpg",
        "Shadowy mountain layers under an overcast sky.",
      ),
      pin(
        "rain-surface",
        "A reflective mood",
        "water.jpg",
        "Cool blue water with delicate surface texture.",
      ),
      pin(
        "rain-air",
        "A change in the air",
        "mountains.jpg",
        "A hazy, open landscape after rain.",
      ),
      pin(
        "rain-blue",
        "The last of the blue",
        "water.jpg",
        "A still, blue horizon.",
      ),
    ],
  },
];
export class DemoPinterestService {
  listBoards() {
    return structuredClone(demoBoards);
  }
  // Pure conversion keeps pin identity/provenance independent of the DOM and layout.
  toBoardItems(boards, selectedPinIds) {
    const selected = new Set(selectedPinIds);
    return boards.flatMap((board) =>
      board.pins
        .filter((pin) => selected.has(pin.id))
        .map((pin) => ({
          id: crypto.randomUUID(),
          type: "image",
          title: pin.title,
          description: pin.description,
          url: pin.imageUrl,
          sourceUrl: pin.imageSourceUrl,
          sourceLabel: "Local sample photography — not fetched from Pinterest",
          position: "pinterest",
          pinned: false,
          imported: true,
          provider: "pinterest",
          sourceKind: "pinterest-demo",
          sourceKey: `pinterest-demo:${pin.id}`,
          externalPinId: pin.id,
          sourceBoard: { id: board.id, title: board.title, url: null },
          originalPinUrl: null,
          isSample: true,
        })),
    );
  }
}
export function setupPinterestImporter({
  element,
  onImport,
  service = new DemoPinterestService(),
}) {
  const $ = (selector) => document.querySelector(selector);
  const library = service.listBoards();
  const selectedBoards = new Set();
  const pinChoices = new Map();
  let step = "connect";
  const status = (message) => {
    $("#pinterest-status").textContent = message;
  };
  const chosenBoards = () =>
    library.filter((board) => selectedBoards.has(board.id));
  const chosenPins = () =>
    chosenBoards()
      .flatMap((board) => board.pins)
      .filter((pin) => pinChoices.get(pin.id) !== false);
  function showStep(next) {
    step = next;
    for (const name of ["connect", "boards", "review", "complete"]) {
      $(`#pinterest-${name}`).hidden = name !== next;
      const indicator = $(`[data-pinterest-step="${name}"]`);
      if (name === next) indicator.setAttribute("aria-current", "step");
      else indicator.removeAttribute("aria-current");
    }
    status("");
    const heading = $(`#pinterest-${next}-heading`);
    $("#pinterest-dialog").scrollTop = 0;
    heading.focus();
  }
  function updateBoardCount() {
    const count = chosenBoards().length;
    $("#pinterest-board-count").textContent =
      `${count} board${count === 1 ? "" : "s"} selected`;
    $("#review-pinterest").disabled = !count;
  }
  function renderBoards() {
    const term = $("#pinterest-search").value.trim().toLowerCase();
    const matches = library.filter((board) =>
      `${board.title} ${board.description}`.toLowerCase().includes(term),
    );
    $("#pinterest-board-list").replaceChildren();
    $("#pinterest-no-boards").hidden = matches.length > 0;
    for (const board of matches) {
      const card = element("label", "pinterest-board-card");
      const check = element("input");
      check.type = "checkbox";
      check.value = board.id;
      check.checked = selectedBoards.has(board.id);
      check.setAttribute("aria-label", `Select board ${board.title}`);
      check.addEventListener("change", () => {
        if (check.checked) selectedBoards.add(board.id);
        else selectedBoards.delete(board.id);
        updateBoardCount();
      });
      const mosaic = element("span", "pinterest-board-mosaic");
      mosaic.setAttribute("aria-hidden", "true");
      board.pins.slice(0, 3).forEach((pin) => {
        const img = element("img");
        img.src = pin.imageUrl;
        img.alt = "";
        mosaic.append(img);
      });
      const copy = element("span", "pinterest-board-copy");
      copy.append(
        element("strong", "", board.title),
        element("span", "", `${board.pins.length} sample pins`),
        element("small", "", board.description),
      );
      card.append(check, mosaic, copy);
      $("#pinterest-board-list").append(card);
    }
    updateBoardCount();
  }
  function updatePinCount() {
    const total = chosenBoards().reduce(
      (sum, board) => sum + board.pins.length,
      0,
    );
    const count = chosenPins().length;
    $("#pinterest-pin-count").textContent =
      `${count} of ${total} pins selected`;
    $("#select-pinterest-pins").checked = count === total && total > 0;
    $("#select-pinterest-pins").indeterminate = count > 0 && count < total;
    $("#confirm-pinterest-import").disabled = count === 0;
    $("#confirm-pinterest-import").textContent =
      `Import ${count} sample pin${count === 1 ? "" : "s"} ↗`;
  }
  function renderReview() {
    $("#pinterest-pin-list").replaceChildren();
    const boards = chosenBoards();
    $("#pinterest-review-description").textContent =
      `${boards.length} selected board${boards.length === 1 ? "" : "s"}. Every pin is included unless you deselect it.`;
    for (const board of boards) {
      const group = element("fieldset", "pinterest-pin-group");
      group.append(
        element(
          "legend",
          "",
          `${board.title} · ${board.pins.length} sample pins`,
        ),
      );
      const list = element("div", "pinterest-pin-grid");
      for (const pin of board.pins) {
        const label = element("label", "pinterest-pin-choice");
        const input = element("input");
        input.type = "checkbox";
        input.checked = pinChoices.get(pin.id) !== false;
        input.dataset.pinId = pin.id;
        input.setAttribute("aria-label", `Import pin ${pin.title}`);
        input.addEventListener("change", () => {
          pinChoices.set(pin.id, input.checked);
          updatePinCount();
        });
        const img = element("img");
        img.src = pin.imageUrl;
        img.alt = pin.description;
        label.append(input, img, element("span", "", pin.title));
        list.append(label);
      }
      group.append(list);
      $("#pinterest-pin-list").append(group);
    }
    if (!$("#pinterest-new-title").value.trim())
      $("#pinterest-new-title").value =
        boards.length === 1
          ? boards[0].title
          : "A Pinterest-inspired direction";
    updatePinCount();
  }
  $("#import-pinterest").addEventListener("click", () => {
    $("#pinterest-dialog").showModal();
    showStep(step);
  });
  for (const id of ["close-pinterest", "view-pinterest-board"])
    $(`#${id}`).addEventListener("click", () => $("#pinterest-dialog").close());
  $("#preview-pinterest").addEventListener("click", () => {
    renderBoards();
    showStep("boards");
  });
  $("#end-pinterest-preview").addEventListener("click", () => {
    selectedBoards.clear();
    pinChoices.clear();
    $("#pinterest-search").value = "";
    $("#pinterest-review-form").reset();
    $("#pinterest-new-board").hidden = true;
    $("#pinterest-new-title").required = false;
    showStep("connect");
  });
  $("#pinterest-search").addEventListener("input", renderBoards);
  $("#select-pinterest-boards").addEventListener("click", () => {
    library.forEach((board) => selectedBoards.add(board.id));
    renderBoards();
  });
  $("#clear-pinterest-boards").addEventListener("click", () => {
    selectedBoards.clear();
    renderBoards();
  });
  $("#review-pinterest").addEventListener("click", () => {
    if (!selectedBoards.size) return;
    renderReview();
    showStep("review");
  });
  for (const id of ["back-pinterest-boards", "more-pinterest-boards"])
    $(`#${id}`).addEventListener("click", () => {
      renderBoards();
      showStep("boards");
    });
  $("#select-pinterest-pins").addEventListener("change", (event) => {
    chosenBoards().forEach((board) =>
      board.pins.forEach((pin) => pinChoices.set(pin.id, event.target.checked)),
    );
    $("#pinterest-pin-list")
      .querySelectorAll("input")
      .forEach((input) => {
        input.checked = event.target.checked;
      });
    updatePinCount();
  });
  $("#pinterest-review-form").addEventListener("change", () => {
    const isNew =
      $("#pinterest-review-form").elements.destination.value === "new";
    $("#pinterest-new-board").hidden = !isNew;
    $("#pinterest-new-title").required = isNew;
  });
  $("#pinterest-review-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const pins = chosenPins();
    if (!pins.length) {
      status("Select at least one pin to import.");
      return;
    }
    const destination = event.target.elements.destination.value;
    const title = $("#pinterest-new-title").value.trim();
    if (destination === "new" && !title) {
      status("Give the new mood board a name.");
      $("#pinterest-new-title").focus();
      return;
    }
    try {
      const result = onImport({
        items: service.toBoardItems(
          chosenBoards(),
          pins.map((pin) => pin.id),
        ),
        destination,
        title,
        boards: chosenBoards().map(({ id, title }) => ({ id, title })),
      });
      $("#pinterest-result").textContent =
        `${result.added} sample pin${result.added === 1 ? "" : "s"} ${destination === "new" ? "imported into a new mood board" : "added to your current mood board"}.${result.skipped ? ` ${result.skipped} already-present pin${result.skipped === 1 ? " was" : "s were"} skipped.` : ""}`;
      showStep("complete");
    } catch (error) {
      status(error.message);
    }
  });
}
