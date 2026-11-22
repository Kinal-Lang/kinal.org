(() => {
  const isChinese = document.documentElement.lang === "zh-CN";
  const localePath = isChinese ? "zh-CN/" : "";
  const labels = isChinese
    ? {
        loading: "正在加载文档…",
        failed: "暂时无法加载文档。",
        source: "在 GitHub 阅读原文 ↗",
      }
    : {
        loading: "Loading document…",
        failed: "This document could not be loaded.",
        source: "Read the source on GitHub ↗",
      };
  const welcome = document.getElementById("docs-welcome");
  const article = document.getElementById("docs-article");
  const topic = document.getElementById("docs-topic");
  const rendered = document.getElementById("docs-rendered");
  const outline = document.getElementById("docs-outline");
  const outlineLinks = document.getElementById("docs-outline-links");
  const pagination = document.getElementById("doc-pagination");
  const navLinks = [...document.querySelectorAll(".docs-nav-link[data-doc]")];
  const markdown = new Map();
  let request = 0;
  let displayed = "";

  function readRoute() {
    const fragment = location.hash.slice(1);
    try {
      return decodeURIComponent(fragment);
    } catch {
      return fragment;
    }
  }

  function routeHref(path, anchor = "") {
    return "#" + path + (anchor ? "#" + encodeURIComponent(anchor) : "");
  }

  function setActive(path) {
    for (const link of navLinks) {
      if (link.dataset.doc === path) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    if (!pagination) return;
    const index = navLinks.findIndex((link) => link.dataset.doc === path);
    pagination.replaceChildren();
    if (index < 0) return;
    for (const offset of [-1, 1]) {
      const entry = navLinks[index + offset];
      if (!entry) continue;
      const link = document.createElement("a");
      const label = document.createElement("span");
      const title = document.createElement("strong");
      link.href = entry.getAttribute("href");
      link.className = offset < 0 ? "doc-previous" : "doc-next";
      label.textContent =
        offset < 0
          ? isChinese
            ? "← 上一篇"
            : "← Previous"
          : isChinese
            ? "下一篇 →"
            : "Next →";
      title.textContent = entry.textContent;
      link.append(label, title);
      pagination.append(link);
    }
  }

  function message(text, path) {
    const box = document.createElement("p");
    box.className = "loading-message";
    box.textContent = text;
    if (path) {
      const source = document.createElement("a");
      source.href =
        "https://github.com/Kinal-Lang/Kinal/blob/main/docs/" +
        localePath +
        path +
        ".md";
      source.textContent = labels.source;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      box.append(" ", source);
    }
    rendered.replaceChildren(box);
    outline.hidden = true;
  }

  function resolveMarkdownLink(path, href) {
    if (href.startsWith("#") && href.length > 1) return "#" + path + href;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(href)) return null;
    const match = href.match(/^(.+)\.md(#[\s\S]*)?$/i);
    if (!match) return null;
    const file = new URL(
      match[1],
      "https://docs.invalid/" + path + ".md",
    ).pathname.slice(1);
    // Locale switches use the page URL; locale-prefixed Markdown links may go to the other docs viewer.
    if (file.startsWith("zh-CN/"))
      return "/zh-CN/docs#" + file.slice(6) + (match[2] || "");
    return "#" + file + (match[2] || "");
  }

  function addOutline(path) {
    const usedIds = new Map();
    const items = [];
    for (const heading of rendered.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
      // Keep the site's existing Unicode anchors and duplicate suffixes.
      const slug = heading.textContent
        .toLowerCase()
        .replace(/[^\p{L}\p{N}_\s-]/gu, "")
        .trim()
        .replace(/\s/g, "-");
      const count = usedIds.get(slug) || 0;
      usedIds.set(slug, count + 1);
      heading.id = slug + (count ? "-" + count : "");
      if (heading.tagName !== "H2" && heading.tagName !== "H3") continue;
      const item = document.createElement("li");
      const link = document.createElement("a");
      if (heading.tagName === "H3") item.className = "outline-subsection";
      link.href = routeHref(path, heading.id);
      link.textContent = heading.textContent;
      link.dataset.anchor = heading.id;
      item.append(link);
      items.push(item);
    }
    outlineLinks.replaceChildren(...items);
    outline.hidden = items.length === 0;
  }

  function scrollToRoute(anchor) {
    for (const link of outlineLinks.querySelectorAll("a")) {
      if (link.dataset.anchor === anchor)
        link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
    const target = anchor && document.getElementById(anchor);
    if (target && rendered.contains(target)) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }

  async function update() {
    const navigation = ++request;
    const route = readRoute();
    const delimiter = route.indexOf("#");
    const path = delimiter < 0 ? route : route.slice(0, delimiter);
    const anchor = delimiter < 0 ? "" : route.slice(delimiter + 1);
    if (!/^[a-z0-9][a-z0-9/-]*$/.test(path)) {
      displayed = "";
      article.hidden = true;
      outline.hidden = true;
      welcome.hidden = false;
      setActive("");
      window.scrollTo(0, 0);
      return;
    }

    welcome.hidden = true;
    article.hidden = false;
    topic.textContent =
      navLinks.find((link) => link.dataset.doc === path)?.textContent || path;
    setActive(path);
    if (displayed === path) {
      scrollToRoute(anchor);
      return;
    }

    displayed = "";
    message(labels.loading);
    try {
      if (!markdown.has(path)) {
        const response = await fetch(
          "/static/docs/" + localePath + path + ".md",
        );
        if (!response.ok) throw new Error("Unable to fetch document");
        markdown.set(path, await response.text());
      }
      if (navigation !== request) return;
      if (!window.renderKinalMarkdown(rendered, markdown.get(path))) {
        message(labels.failed, path);
        return;
      }
      for (const link of rendered.querySelectorAll("a[href]")) {
        const next = resolveMarkdownLink(path, link.getAttribute("href"));
        if (next) link.setAttribute("href", next);
      }
      displayed = path;
      addOutline(path);
      scrollToRoute(anchor);
    } catch {
      if (navigation === request) message(labels.failed, path);
    }
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (
      !link ||
      link.classList.contains("skip-link") ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    if (!link.closest(".docs-layout")) return;
    if (link.closest(".docs-sidebar"))
      document.dispatchEvent(new Event("kinal:close-navigation"));
    if (link.hash === location.hash) {
      event.preventDefault();
      update();
    }
  });
  window.addEventListener("hashchange", update);
  update();
})();
