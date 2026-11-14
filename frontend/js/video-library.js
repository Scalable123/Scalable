// Video DTOs contain references/metadata only. Browser object URLs stay in this registry.
const localVideos = new Map();
export function parseYouTubeLink(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a complete HTTPS YouTube video link.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error(
      "Use an HTTPS YouTube link without login details or a custom port.",
    );
  const parts = url.pathname.split("/").filter(Boolean);
  let id;
  if (url.hostname === "youtu.be" && parts.length === 1) id = parts[0];
  else if (
    [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "music.youtube.com",
    ].includes(url.hostname)
  ) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else if (["shorts", "embed"].includes(parts[0]) && parts.length === 2)
      id = parts[1];
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id))
    throw new Error(
      "Use a YouTube watch, Shorts, or youtu.be link to a single video.",
    );
  const raw = url.searchParams.get("t") || url.searchParams.get("start") || "0";
  let start = 0;
  if (/^\d+$/.test(raw)) start = Number(raw);
  else {
    const time = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!time || !time[0])
      throw new Error("Use a numeric start time or a time such as 1m30s.");
    start =
      Number(time[1] || 0) * 3600 +
      Number(time[2] || 0) * 60 +
      Number(time[3] || 0);
  }
  if (!Number.isSafeInteger(start) || start > 604800)
    throw new Error("Use a start time between 0 and 604800 seconds.");
  return {
    videoId: id,
    startSeconds: start,
    sourceUrl: `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ""}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ""}`,
  };
}
export function releaseLocalVideo(id) {
  const url = localVideos.get(id);
  if (url) URL.revokeObjectURL(url);
  localVideos.delete(id);
}
export function retainLocalVideos(items) {
  const ids = new Set(items.map((item) => item.id));
  for (const id of localVideos.keys()) if (!ids.has(id)) releaseLocalVideo(id);
}
export async function attachLocalVideo(id, file) {
  if (
    !file ||
    !/\.(mp4|webm|mov)$/i.test(file.name) ||
    !file.size ||
    file.size > 100 * 1024 * 1024
  )
    throw new Error("Choose a non-empty MP4, WebM, or MOV video up to 100 MB.");
  const url = URL.createObjectURL(file);
  const probe = document.createElement("video");
  probe.preload = "metadata";
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          reject(
            new Error("This video took too long to load. Try a smaller clip."),
          ),
        10000,
      );
      probe.onloadedmetadata = () => {
        clearTimeout(timeout);
        if (probe.videoWidth > 0 && probe.videoHeight > 0) resolve();
        else
          reject(
            new Error("This file does not contain a playable video track."),
          );
      };
      probe.onerror = () => {
        clearTimeout(timeout);
        reject(
          new Error(
            "This video could not be decoded. Try another browser-supported MP4, WebM, or MOV.",
          ),
        );
      };
      probe.src = url;
    });
    const fileInfo = {
      name: file.name,
      size: file.size,
      mimeType: file.type,
      lastModified: file.lastModified,
      width: probe.videoWidth,
      height: probe.videoHeight,
      duration: Number.isFinite(probe.duration) ? probe.duration : null,
    };
    releaseLocalVideo(id);
    localVideos.set(id, url);
    return fileInfo;
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    probe.removeAttribute("src");
    probe.load();
  }
}
export function setupVideoImporter({ element, getBoardId, onImport }) {
  const $ = (selector) => document.querySelector(selector);
  const status = (message) => {
    $("#video-import-status").textContent = message;
  };
  const tabs = [...document.querySelectorAll("[data-video-tab]")];
  const choose = (name, focus = false) => {
    tabs.forEach((tab) => {
      const active = tab.dataset.videoTab === name;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      $(`#${tab.dataset.videoTab}-panel`).hidden = !active;
      if (active && focus) tab.focus();
    });
    status("");
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => choose(tab.dataset.videoTab));
    tab.addEventListener("keydown", (event) => {
      let next;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft")
        next = (index + 1) % 2;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = 1;
      if (next !== undefined) {
        event.preventDefault();
        choose(tabs[next].dataset.videoTab, true);
      }
    });
  });
  $("#import-video").addEventListener("click", () => {
    status("");
    $("#video-dialog").showModal();
  });
  $("#close-video").addEventListener("click", () => $("#video-dialog").close());
  $("#youtube-form").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const parsed = parseYouTubeLink($("#youtube-url").value);
      const title = $("#youtube-title").value.trim();
      if (!title) throw new Error("Give this video reference a title.");
      const count = onImport({
        id: crypto.randomUUID(),
        type: "video",
        title,
        imported: true,
        sourceKind: "youtube",
        provider: "youtube",
        sourceUrl: parsed.sourceUrl,
        videoId: parsed.videoId,
        startSeconds: parsed.startSeconds,
        sourceKey: `youtube:${parsed.videoId}:${parsed.startSeconds}`,
        isSample: false,
      });
      status(
        count
          ? "YouTube reference added. Save the board to keep it. Its player loads only when you choose."
          : "This YouTube moment is already on your board.",
      );
      if (count) event.target.reset();
    } catch (error) {
      status(error.message);
    }
  });
  $("#local-video-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = crypto.randomUUID();
    const target = getBoardId();
    const button = $("#add-local-video");
    button.disabled = true;
    status("Checking this local video…");
    try {
      const file = $("#video-file").files[0];
      const fileInfo = await attachLocalVideo(id, file);
      const count = onImport(
        {
          id,
          type: "video",
          title:
            $("#video-file-title").value.trim() ||
            file.name.replace(/\.[^.]+$/, ""),
          imported: true,
          sourceKind: "local-video",
          provider: "local",
          fileInfo,
          sourceKey: `video-file:${file.name}:${file.size}:${file.lastModified}`,
          isSample: false,
        },
        target,
      );
      if (!count) releaseLocalVideo(id);
      status(
        count
          ? "Local video added. The file stays in this tab; save keeps its details only."
          : "This file is already on your board.",
      );
      if (count) event.target.reset();
    } catch (error) {
      releaseLocalVideo(id);
      status(error.message);
    } finally {
      button.disabled = false;
    }
  });
}
export function renderVideoReference(item, { element, onRemove, onReattach }) {
  const card = element("article", "video-card");
  card.dataset.itemId = item.id;
  const media = element("div", "video-frame");
  const detail = element("div", "video-detail");
  detail.append(
    element(
      "span",
      "card-eyebrow",
      item.sourceKind === "youtube" ? "YOUTUBE REFERENCE" : "LOCAL VIDEO",
    ),
    element("h4", "", item.title),
  );
  if (item.sourceKind === "youtube") {
    try {
      const parsed = parseYouTubeLink(item.sourceUrl);
      const placeholder = element("div", "youtube-placeholder");
      placeholder.append(
        element("span", "play-mark", "▶"),
        element(
          "p",
          "",
          `YouTube video · ${parsed.startSeconds ? `starts at ${parsed.startSeconds}s` : "linked reference"}`,
        ),
      );
      const load = element("button", "done-button", "Load YouTube player");
      load.type = "button";
      placeholder.append(load);
      media.append(placeholder);
      const unload = element("button", "text-button", "Unload player");
      unload.hidden = true;
      load.addEventListener("click", () => {
        const frame = element("iframe");
        frame.src = parsed.embedUrl;
        frame.title = `YouTube player: ${item.title}`;
        frame.allow = "encrypted-media; picture-in-picture; fullscreen";
        frame.allowFullscreen = true;
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        media.replaceChildren(frame);
        unload.hidden = false;
      });
      unload.addEventListener("click", () => {
        media.replaceChildren(placeholder);
        unload.hidden = true;
      });
      const source = element("a", "song-link", "Open on YouTube ↗");
      source.href = parsed.sourceUrl;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      detail.append(
        element(
          "p",
          "field-help",
          "The player contacts YouTube when loaded. If playback is unavailable or embedding is restricted, open the source.",
        ),
        source,
        unload,
      );
    } catch {
      media.append(
        element(
          "p",
          "field-help",
          "This saved YouTube reference has an unsupported URL.",
        ),
      );
    }
  } else if (item.sourceKind === "local-video") {
    const url = localVideos.get(item.id);
    if (url) {
      const video = element("video");
      video.src = url;
      video.controls = true;
      video.preload = "metadata";
      video.playsInline = true;
      video.setAttribute("aria-label", `Play local video: ${item.title}`);
      video.addEventListener("play", () =>
        document.querySelectorAll("audio,video").forEach((other) => {
          if (other !== video) other.pause();
        }),
      );
      media.append(video);
      video.addEventListener("error", () => {
        notice.textContent =
          "This local video cannot play. Reattach a supported file.";
      });
    } else
      media.append(
        element(
          "div",
          "youtube-placeholder",
          "Reattach your local video to watch it here.",
        ),
      );
    const notice = element(
      "p",
      "field-help",
      `${item.fileInfo?.name || "Local video"} · file details saved, video bytes stay on your device.`,
    );
    notice.setAttribute("role", "status");
    const label = element(
      "label",
      "reattach-button",
      url ? "Replace video file" : "Reattach video",
    );
    const input = element("input");
    input.type = "file";
    input.accept = "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov";
    input.setAttribute("aria-label", `Reattach video for ${item.title}`);
    input.addEventListener("change", async () => {
      if (!input.files[0]) return;
      input.disabled = true;
      notice.textContent = "Checking local video…";
      try {
        const info = await attachLocalVideo(item.id, input.files[0]);
        onReattach(item.id, info);
      } catch (error) {
        notice.textContent = error.message;
        input.disabled = false;
      }
    });
    label.append(input);
    detail.append(notice, label);
  }
  const remove = element(
    "button",
    "text-button remove-reference",
    "Remove video",
  );
  remove.setAttribute("aria-label", `Remove video ${item.title}`);
  remove.addEventListener("click", () => onRemove(item.id));
  detail.append(remove);
  card.append(media, detail);
  return card;
}
