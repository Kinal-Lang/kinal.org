(() => {
    const isChinese = document.documentElement.lang === "zh-CN";
    const labels = isChinese
        ? { copy: "复制", copied: "已复制", failed: "复制失败" }
        : { copy: "Copy", copied: "Copied", failed: "Copy failed" };

    function enhanceCode(scope) {
        for (const pre of scope.querySelectorAll("pre")) {
            const code = pre.querySelector("code");
            if (!code) continue;

            const language = code.className.match(/language-([\w+-]+)/)?.[1] || "text";
            const source = code.textContent.replace(/^\n/, "");
            code.textContent = source;
            if (["kinal", "kn"].includes(language) && window.highlightKinal) {
                code.innerHTML = window.highlightKinal(source);
            } else if (window.hljs?.getLanguage(language)) {
                window.hljs.highlightElement(code);
            }

            const wrapper = document.createElement("div");
            const toolbar = document.createElement("div");
            const name = document.createElement("span");
            const copy = document.createElement("button");
            wrapper.className = "code-block-wrapper";
            toolbar.className = "code-block-header";
            name.textContent = language === "kn" ? "kinal" : language;
            copy.className = "code-block-copy";
            copy.type = "button";
            copy.textContent = labels.copy;
            let reset;
            copy.addEventListener("click", async () => {
                clearTimeout(reset);
                try {
                    await navigator.clipboard.writeText(source);
                    copy.textContent = labels.copied;
                } catch {
                    copy.textContent = labels.failed;
                }
                reset = setTimeout(() => { copy.textContent = labels.copy; }, 1600);
            });
            toolbar.append(name, copy);
            pre.tabIndex = 0;
            pre.before(wrapper);
            wrapper.append(toolbar, pre);
        }

        for (const table of scope.querySelectorAll("table")) {
            const wrapper = document.createElement("div");
            wrapper.className = "table-scroll";
            wrapper.tabIndex = 0;
            table.before(wrapper);
            wrapper.append(table);
        }
    }

    window.renderKinalMarkdown = (target, source) => {
        if (!window.marked) {
            target.textContent = source;
            return false;
        }
        target.innerHTML = window.marked.parse(source);
        enhanceCode(target);
        return true;
    };
})();
