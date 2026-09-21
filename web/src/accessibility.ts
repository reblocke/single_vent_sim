/** Make wide numeric tables reachable without a pointer; browser handles scrolling. */
export function accessibleTables() {
  const mark = (root: Element) => {
    for (const node of [root, ...root.querySelectorAll(".table-scroll")])
      if (node.matches(".table-scroll")) {
        node.setAttribute("tabindex", "0");
        node.setAttribute("role", "region");
        node.setAttribute(
          "aria-label",
          "Scrollable numeric table; use left and right arrow keys when focused",
        );
      }
  };
  mark(document.querySelector("main")!);
  new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes)
        if (node instanceof Element) mark(node);
  }).observe(document.querySelector("main")!, {
    childList: true,
    subtree: true,
  });
}
