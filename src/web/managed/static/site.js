(() => {
  const topbar = document.querySelector(".topbar");
  const toggle = document.getElementById("topbar-toggle");
  const actions = document.getElementById("topbar-actions");
  const locale = document.getElementById("locale-switch");
  const localeTrigger = document.getElementById("locale-trigger");
  const localeMenu = document.getElementById("locale-menu");
  const localeOptions = [...document.querySelectorAll(".locale-option")];
  const sidebar = document.getElementById("docs-sidebar");
  const sidebarToggle = document.getElementById("docs-sidebar-toggle");
  const mobileHeader = matchMedia("(max-width: 820px)");
  const mobileDocs = matchMedia("(max-width: 900px)");
  const zh = document.documentElement.lang === "zh-CN";
  for (const sample of document.querySelectorAll(".code-example pre code")) {
    if (window.highlightKinal)
      sample.innerHTML = window.highlightKinal(sample.textContent);
  }

  const announcement = document.createElement("span");
  announcement.className = "sr-only";
  announcement.setAttribute("role", "status");
  document.body.append(announcement);
  for (const button of document.querySelectorAll("[data-copy-command]")) {
    const label = button.textContent;
    let reset;
    button.addEventListener("click", async () => {
      clearTimeout(reset);
      try {
        await navigator.clipboard.writeText(button.dataset.copyCommand);
        button.textContent = zh ? "已复制" : "Copied";
        announcement.textContent = zh
          ? "命令已复制到剪贴板。"
          : "Command copied to clipboard.";
      } catch {
        button.textContent = zh ? "请手动复制" : "Select to copy";
        announcement.textContent = zh
          ? "无法访问剪贴板，请选中命令后手动复制。"
          : "Clipboard unavailable. Select and copy the command manually.";
      }
      reset = setTimeout(() => {
        button.textContent = label;
      }, 2200);
    });
  }

  function setLocale(open, restoreFocus = false) {
    locale.classList.toggle("open", open);
    localeTrigger.setAttribute("aria-expanded", String(open));
    localeMenu.inert = !open;
    if (restoreFocus) localeTrigger.focus();
  }

  function setHeader(open, restoreFocus = false) {
    topbar.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    actions.inert = mobileHeader.matches && !open;
    if (!open) setLocale(false);
    if (restoreFocus) toggle.focus();
  }

  function setSidebar(open, restoreFocus = false) {
    if (!sidebar) return;
    sidebar.classList.toggle("open", open);
    sidebarToggle.setAttribute("aria-expanded", String(open));
    sidebar.inert = mobileDocs.matches && !open;
    if (restoreFocus) sidebarToggle.focus();
  }

  function syncLocaleHrefs() {
    for (const link of localeOptions) {
      link.dataset.baseHref ||= link.getAttribute("href").split("#")[0];
      const isDocs = Boolean(sidebar);
      const sharedRoute =
        isDocs &&
        [...document.querySelectorAll(".docs-nav-link")].some(
          (entry) => location.hash.slice(1).split("#")[0] === entry.dataset.doc,
        );
      link.href =
        link.dataset.baseHref +
        (document.querySelector(".home-main") || sharedRoute
          ? location.hash
          : "");
    }
  }

  setHeader(false);
  setSidebar(false);
  syncLocaleHrefs();
  mobileHeader.addEventListener("change", () => setHeader(false));
  mobileDocs.addEventListener("change", () => setSidebar(false));

  toggle.addEventListener("click", () => {
    setHeader(!topbar.classList.contains("menu-open"));
    setSidebar(false);
  });

  localeTrigger.addEventListener("click", () => {
    syncLocaleHrefs();
    setLocale(!locale.classList.contains("open"));
  });
  localeTrigger.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    syncLocaleHrefs();
    setLocale(true);
    localeOptions[0]?.focus();
  });
  topbar.querySelector(".topnav").addEventListener("click", (event) => {
    if (event.target.closest("a")) setHeader(false);
  });

  if (sidebarToggle) {
    sidebarToggle.setAttribute("aria-controls", sidebar.id);
    sidebarToggle.addEventListener("click", () => {
      const open = !sidebar.classList.contains("open");
      setHeader(false);
      setSidebar(open);
    });
  }

  document.addEventListener("click", (event) => {
    if (!locale.contains(event.target)) setLocale(false);
    if (!topbar.contains(event.target)) setHeader(false);
    if (
      sidebar &&
      !sidebar.contains(event.target) &&
      !sidebarToggle.contains(event.target)
    )
      setSidebar(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (locale.classList.contains("open")) setLocale(false, true);
    else if (topbar.classList.contains("menu-open")) setHeader(false, true);
    else if (sidebar?.classList.contains("open")) setSidebar(false, true);
  });
  document.addEventListener("kinal:close-navigation", () => {
    const focusInDrawer =
      mobileDocs.matches && sidebar?.contains(document.activeElement);
    setHeader(false);
    setSidebar(false, focusInDrawer);
  });
  window.addEventListener("hashchange", () => {
    setHeader(false);
    setSidebar(false);
    syncLocaleHrefs();
  });

  const filter = document.getElementById("docs-filter");
  if (filter) {
    const groups = [...sidebar.querySelectorAll(".docs-nav-section")];
    const empty = document.getElementById("docs-filter-empty");
    filter.addEventListener("input", () => {
      const query = filter.value.trim().toLowerCase();
      let hasResults = false;
      for (const group of groups) {
        let visible = 0;
        for (const link of group.querySelectorAll(".docs-nav-link")) {
          link.hidden = !link.textContent.toLowerCase().includes(query);
          if (!link.hidden) visible++;
        }
        group.hidden = visible === 0;
        if (visible) hasResults = true;
      }
      empty.hidden = hasResults;
    });
  }
  document.querySelector(".skip-link")?.addEventListener("click", (event) => {
    event.preventDefault();
    const main = document.getElementById("main-content");
    main.focus({ preventScroll: true });
    main.scrollIntoView();
  });

  const faqFilter = document.getElementById("faq-filter");
  if (faqFilter) {
    const groups = [...document.querySelectorAll(".faq-group")];
    const empty = document.getElementById("faq-empty");
    faqFilter.addEventListener("input", () => {
      const terms = faqFilter.value
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      let hasResults = false;
      for (const group of groups) {
        let matches = false;
        for (const question of group.querySelectorAll("details")) {
          const text = question.textContent.toLowerCase();
          question.hidden = !terms.every((term) => text.includes(term));
          if (!question.hidden) matches = true;
        }
        group.hidden = !matches;
        if (matches) hasResults = true;
      }
      for (const link of document.querySelectorAll(
        ".faq-layout .section-links a",
      )) {
        const group = document.getElementById(link.hash.slice(1));
        link.hidden = group.hidden;
        const count = link.querySelector(".faq-count");
        if (count)
          count.textContent = String(
            group.querySelectorAll("details:not([hidden])").length,
          ).padStart(2, "0");
      }
      empty.hidden = hasResults;
    });
  }
})();
