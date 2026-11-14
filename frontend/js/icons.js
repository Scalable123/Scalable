// Inline vector symbols avoid platform-dependent emoji and missing arrow glyphs.
export function iconify(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode())
    if (/[✳↗↘↥▶]/.test(walker.currentNode.textContent))
      nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const fragment = document.createDocumentFragment();
    node.textContent
      .split(/([✳↗↘↥▶])/)
      .filter(Boolean)
      .forEach((part) => {
        if (!/^[✳↗↘↥▶]$/.test(part)) {
          fragment.append(document.createTextNode(part));
          return;
        }
        const icon = document.createElement("span");
        icon.className = `symbol ${part === "▶" ? "symbol-play" : part === "✳" ? "symbol-star" : part === "↘" ? "symbol-down" : part === "↥" ? "symbol-upload" : "symbol-arrow"}`;
        icon.setAttribute("aria-hidden", "true");
        fragment.append(icon);
      });
    node.replaceWith(fragment);
  });
}
