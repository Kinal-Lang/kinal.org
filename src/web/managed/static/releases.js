(() => {
  const zh = document.documentElement.lang === "zh-CN";
  const strings = zh
    ? {
        latest: "最新",
        prerelease: "预发行",
        download: "下载",
        assets: "发行包",
        notes: "更新日志",
        unavailable: "本页暂无发行包列表。可前往 GitHub 查找可用版本。",
        github: "前往 GitHub Releases",
      }
    : {
        latest: "Latest",
        prerelease: "Pre-release",
        download: "Download",
        assets: "Packages",
        notes: "Release notes",
        unavailable:
          "The package list is unavailable here. Browse GitHub for available versions.",
        github: "Open GitHub Releases",
      };
  const container = document.getElementById("releases-container");
  const releasesUrl = "https://github.com/Kinal-Lang/Kinal/releases";
  const dates = new Intl.DateTimeFormat(zh ? "zh-CN" : "en-US", {
    dateStyle: "medium",
  });
  const platformButtons = [...document.querySelectorAll("[data-platform]")];
  const platformTitle = document.getElementById("package-title");
  const platformDescription = document.getElementById("package-description");
  const platformDownload = document.getElementById("platform-download");
  const platformNames = { windows: "Windows", macos: "macOS", linux: "Linux" };
  const platformCodes = { windows: "WIN", macos: "MAC", linux: "LNX" };
  let selectedPlatform = /Mac|iPhone|iPad/.test(navigator.platform)
    ? "macos"
    : /Linux/.test(navigator.platform)
      ? "linux"
      : "windows";
  let currentAssets = [];
  let feedAvailable = false;
  const packageChoice = element("div", "package-choice");
  const packageLabel = element("label", "", zh ? "发行包" : "Package");
  const packageSelect = element("select");
  packageSelect.id = "package-variant";
  packageLabel.htmlFor = packageSelect.id;
  packageChoice.append(packageLabel, packageSelect);
  platformDescription?.after(packageChoice);
  packageSelect.addEventListener("change", () => {
    const asset = currentAssets.find(
      (item) => item.download_url === packageSelect.value,
    );
    if (asset) selectAsset(asset);
  });
  for (const button of platformButtons) {
    button.addEventListener("click", () => {
      selectedPlatform = button.dataset.platform;
      updatePlatform();
    });
  }

  function selectAsset(asset) {
    platformDownload.hidden = false;
    platformDownload.href = httpsUrl(asset.download_url);
    platformDownload.textContent =
      (zh ? "下载发行包" : "Download package") + " ↓";
  }

  function updatePlatform() {
    if (!platformTitle || !platformDownload) return;
    for (const button of platformButtons)
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.platform === selectedPlatform),
      );
    const name = platformNames[selectedPlatform];
    platformTitle.textContent = zh
      ? "获取 " + name + " 发行包"
      : "Get Kinal for " + name;
    const packages = currentAssets.filter(
      (asset) =>
        typeof asset.name === "string" &&
        packagePlatform(asset.name) === platformCodes[selectedPlatform] &&
        httpsUrl(asset.download_url),
    );
    packageChoice.hidden = packages.length === 0;
    packageSelect.replaceChildren(
      ...packages.map((asset) => {
        const option = element(
          "option",
          "",
          asset.name +
            (Number.isFinite(asset.size_bytes)
              ? " · " + fileSize(asset.size_bytes)
              : ""),
        );
        option.value = asset.download_url;
        return option;
      }),
    );
    if (packages.length) {
      platformDescription.textContent = zh
        ? "选择与你的 CPU 架构匹配的完整发行包。"
        : "Choose the complete archive for your CPU architecture.";
      if (packages.length === 1) {
        selectAsset(packages[0]);
      } else {
        const prompt = element("option", "", zh ? "选择发行包…" : "Select a package…");
        prompt.value = "";
        prompt.disabled = true;
        packageSelect.prepend(prompt);
        packageSelect.value = "";
        platformDownload.removeAttribute("href");
        platformDownload.hidden = true;
      }
    } else {
      platformDescription.textContent = feedAvailable
        ? zh
          ? "当前发行版中没有此平台的安装包，可查看其他发行版本。"
          : "This release has no package for this platform. Check other releases."
        : zh
          ? "在 GitHub Releases 中选择对应架构的完整发行包。"
          : "Choose a complete archive for your architecture on GitHub Releases.";
      platformDownload.href = releasesUrl;
      platformDownload.hidden = false;
      platformDownload.textContent =
        (zh ? "前往下载" : "View downloads") + " ↗";
    }
  }
  updatePlatform();

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function external(url, text, className) {
    const link = element("a", className, text);
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }

  function httpsUrl(input) {
    try {
      const url = new URL(input);
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function fileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function packagePlatform(name) {
    if (/sha256|checksum|\.txt$/i.test(name)) return "SHA";
    if (/windows|(^|[-_.])win(32|64)?([-_.]|$)/i.test(name)) return "WIN";
    if (/mac|darwin/i.test(name)) return "MAC";
    if (/linux/i.test(name)) return "LNX";
    return "PKG";
  }

  function renderPackages(assets) {
    const list = element("div", "asset-list");
    for (const asset of assets) {
      const url = httpsUrl(asset.download_url);
      if (!url || typeof asset.name !== "string") continue;
      const link = external(url, "", "asset-row");
      const icon = element(
        "span",
        "asset-platform",
        packagePlatform(asset.name),
      );
      icon.setAttribute("aria-hidden", "true");
      const name = element("span", "asset-name", asset.name);
      const size = element("span", "asset-size", fileSize(asset.size_bytes));
      const label = element("span", "asset-action", strings.download + " ↓");
      link.append(icon, name, size, label);
      list.append(link);
    }
    return list;
  }

  function renderRelease(release, latest) {
    const card = element("article", "release-card");
    if (release.tag_name) card.id = "release-" + release.tag_name;
    const heading = element("header", "release-header");
    const title = element("h3", "", release.name || release.tag_name);
    const meta = element("div", "release-meta");
    if (latest)
      meta.append(element("span", "badge badge-accent", strings.latest));
    if (release.prerelease)
      meta.append(element("span", "badge", strings.prerelease));
    const date = new Date(release.published_at);
    if (release.published_at && !Number.isNaN(date.valueOf()))
      meta.append(element("time", "", dates.format(date)));
    heading.append(title, meta);
    card.append(heading);

    const packages = renderPackages(
      Array.isArray(release.assets) ? release.assets : [],
    );
    if (packages.childElementCount) {
      card.append(
        element("h4", "release-assets-title", strings.assets),
        packages,
      );
    }
    if (release.body_markdown) {
      const notes = element("details", "release-notes");
      const body = element("div", "release-body docs-rendered");
      notes.append(element("summary", "", strings.notes), body);
      notes.addEventListener("toggle", () => {
        if (notes.open && !body.hasChildNodes())
          window.renderKinalMarkdown(body, release.body_markdown);
      });
      card.append(notes);
    }
    const url = httpsUrl(release.html_url);
    if (url)
      card.append(external(url, "GitHub ↗", "release-source text-link"));
    return card;
  }

  function fallback() {
    const box = element("div", "release-fallback");
    box.append(
      element("p", "", strings.unavailable),
      external(releasesUrl, strings.github + " ↗", "button ghost"),
    );
    container.replaceChildren(box);
  }

  fetch("/static/data/releases.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("Release list unavailable");
      return response.json();
    })
    .then((data) => {
      if (!Array.isArray(data.releases) || !data.releases.length)
        return fallback();
      const latest =
        data.releases.find((release) => !release.prerelease) ||
        data.releases[0];
      currentAssets = Array.isArray(latest.assets) ? latest.assets : [];
      feedAvailable = true;
      updatePlatform();
      container.replaceChildren(
        ...data.releases.map((release) =>
          renderRelease(release, release === latest),
        ),
      );
      const anchor = location.hash.slice(1);
      if (anchor) document.getElementById(anchor)?.scrollIntoView();
    })
    .catch(fallback);
})();
