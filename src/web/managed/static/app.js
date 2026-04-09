(function () {
    function detectLocale() {
        const lang = document.documentElement.lang || "";
        if (lang.toLowerCase() === "zh-cn") {
            return "zh-CN";
        }
        return "en";
    }

    function readTemplateText(id) {
        const node = document.getElementById(id);
        if (!node) {
            return "";
        }

        const text = node.textContent || "";
        if (text === "" || text.indexOf("{{") >= 0) {
            return "";
        }
        return text.replace(/\r\n/g, "\n");
    }

    const heroFallbackCode = [
        "Unit App;",
        "",
        "Get IO.Console;",
        "",
        "Static Function int Main()",
        "{",
        "    IO.Console.PrintLine(\"Hello, World!\");",
        "    Return 0;",
        "}"
    ].join("\n");

    const heroCode = readTemplateText("kinal-hero-code") || heroFallbackCode;
    const initialSampleId = "block";
    const initialSampleCode = readTemplateText("kinal-sample-code");

    function samplePath(id) {
        return "/static/content/" + id + ".kn";
    }

    const samples = {
        block: {
            label: {
                en: "Block",
                "zh-CN": "代码块"
            },
            path: samplePath("block"),
            code: initialSampleId === "block" ? initialSampleCode : null,
            pending: null
        },
        meta: {
            label: {
                en: "Meta",
                "zh-CN": "元数据"
            },
            path: samplePath("meta"),
            code: initialSampleId === "meta" ? initialSampleCode : null,
            pending: null
        },
        oop: {
            label: {
                en: "OOP",
                "zh-CN": "面向对象"
            },
            path: samplePath("oop"),
            code: initialSampleId === "oop" ? initialSampleCode : null,
            pending: null
        },
        scope: {
            label: {
                en: "Scope",
                "zh-CN": "作用域"
            },
            path: samplePath("scope"),
            code: initialSampleId === "scope" ? initialSampleCode : null,
            pending: null
        },
        custom: {
            label: {
                en: "Custom",
                "zh-CN": "自定义"
            },
            path: samplePath("custom"),
            code: initialSampleId === "custom" ? initialSampleCode : null,
            pending: null
        }
    };

    const localeText = {
        en: {
            outputTitle: "Output",
            ready: "Ready",
            edited: "Edited",
            running: "Running...",
            completed: "Completed",
            rejected: "Rejected",
            offline: "Offline",
            tooLarge: "Too Large",
            noOutput: "(no output)",
            runPlaceholder: "Click Run to execute a sample, or edit the code first.",
            compiling: "Compiling and executing...",
            networkError: "Network error",
            payloadTooLarge: "Code payload exceeds 4 KB.",
            sampleChip: "sample"
        },
        "zh-CN": {
            outputTitle: "输出",
            ready: "就绪",
            edited: "已修改",
            running: "运行中...",
            completed: "完成",
            rejected: "已拒绝",
            offline: "离线",
            tooLarge: "过大",
            noOutput: "(无输出)",
            runPlaceholder: "点击运行来执行示例，或者先编辑代码。",
            compiling: "正在编译并执行...",
            networkError: "网络错误",
            payloadTooLarge: "代码内容超过 4 KB。",
            sampleChip: "示例"
        }
    };

    samples.block.label["zh-CN"] = "\u4ee3\u7801\u5757";
    samples.meta.label["zh-CN"] = "\u5143\u6570\u636e";
    samples.oop.label["zh-CN"] = "\u9762\u5411\u5bf9\u8c61";
    samples.scope.label["zh-CN"] = "\u4f5c\u7528\u57df";
    samples.custom.label["zh-CN"] = "\u81ea\u5b9a\u4e49";

    localeText["zh-CN"] = {
        outputTitle: "\u8f93\u51fa",
        ready: "\u5c31\u7eea",
        edited: "\u5df2\u4fee\u6539",
        running: "\u8fd0\u884c\u4e2d...",
        completed: "\u5b8c\u6210",
        rejected: "\u5df2\u62d2\u7edd",
        offline: "\u79bb\u7ebf",
        tooLarge: "\u8fc7\u5927",
        noOutput: "(\u65e0\u8f93\u51fa)",
        runPlaceholder: "\u70b9\u51fb\u8fd0\u884c\u6765\u6267\u884c\u793a\u4f8b\uff0c\u6216\u8005\u5148\u7f16\u8f91\u4ee3\u7801\u3002",
        compiling: "\u6b63\u5728\u7f16\u8bd1\u5e76\u6267\u884c...",
        networkError: "\u7f51\u7edc\u9519\u8bef",
        payloadTooLarge: "\u4ee3\u7801\u5185\u5bb9\u8d85\u8fc7 4 KB\u3002",
        sampleChip: "\u793a\u4f8b"
    };

    const keywordSet = new Set([
        "Unit", "Get", "Set", "By", "Property", "Function", "Return", "If", "Else",
        "ElseIf", "While", "For", "Switch", "Case", "Break", "Continue", "Try", "Catch",
        "Throw", "Class", "Interface", "Struct", "Enum", "Public", "Private", "Protected",
        "Internal", "Static", "Async", "Await", "Virtual", "Override", "Abstract", "Sealed", "Constructor",
        "New", "This", "Base", "Block", "Record", "Jump", "Const", "Var", "Safe",
        "Trusted", "Unsafe", "Is", "Meta", "On", "Keep", "Repeatable", "Delegate", "Extern"
    ]);

    const typeSet = new Set([
        "int", "float", "f16", "f32", "f64", "f128",
        "i8", "i16", "i32", "i64",
        "u8", "u16", "u32", "u64",
        "isize", "usize",
        "string", "bool", "char", "void", "any", "byte",
        "dict", "list", "set"
    ]);

    const heroLines = document.getElementById("hero-lines");
    const heroCodeNode = document.getElementById("hero-code");
    const editorInput = document.getElementById("editor-input");
    const editorHighlight = document.getElementById("editor-highlight");
    const editorLines = document.getElementById("editor-lines");
    const runButton = document.getElementById("run-button");
    const runOutput = document.getElementById("run-output");
    const runStatus = document.getElementById("run-status");
    const outputTitle = document.querySelector(".output-head strong");
    const sampleLabel = document.getElementById("sample-label");
    const tabHost = document.getElementById("sample-tabs");
    const tabButtons = Array.from(tabHost.querySelectorAll(".tab"));
    const localeSwitch = document.getElementById("locale-switch");
    const localeTrigger = document.getElementById("locale-trigger");
    const localeLabel = localeTrigger ? localeTrigger.querySelector(".locale-label") : null;
    const localeMenu = document.getElementById("locale-menu");
    const localeOptions = localeMenu ? Array.from(localeMenu.querySelectorAll(".locale-option")) : [];
    const heroCopy = document.querySelector(".hero-copy");
    const heroGrid = heroCopy ? heroCopy.querySelector(".hero-grid") : null;
    const heroLeads = heroCopy ? heroCopy.querySelector(".hero-leads") : null;
    const heroSecondaryLead = heroCopy ? heroCopy.querySelector(".lead-secondary") : null;
    const codeMeasureCanvas = document.createElement("canvas");
    const codeMeasureContext = codeMeasureCanvas.getContext("2d");

    let activeSample = initialSampleId;
    let customCode = samples.custom.code || "";
    let lastServerResult = "";
    let currentStatusKey = "ready";
    let currentOutputKey = "runPlaceholder";
    const currentLocale = detectLocale();
    const maxCodeSize = 4096;
    let sampleLoadToken = 0;
    let heroTail = null;
    const mobileHeroNarrativeQuery = window.matchMedia("(max-width: 640px)");
    const heroSecondaryRestoreParent = heroSecondaryLead ? heroSecondaryLead.parentNode : null;
    const heroSecondaryRestoreNextSibling = heroSecondaryLead ? heroSecondaryLead.nextSibling : null;

    function ensureHeroTail() {
        if (!heroCopy || !heroGrid) {
            return null;
        }

        if (!heroTail) {
            heroTail = document.createElement("div");
            heroTail.className = "hero-tail";
            heroTail.hidden = true;
            heroGrid.insertAdjacentElement("afterend", heroTail);
        }

        heroTail.setAttribute("data-label", currentLocale === "zh-CN" ? "补充说明" : "More context");
        return heroTail;
    }

    function restoreHeroSecondaryLead() {
        if (!heroSecondaryLead || !heroSecondaryRestoreParent) {
            return;
        }

        if (heroSecondaryLead.parentNode === heroSecondaryRestoreParent) {
            return;
        }

        if (heroSecondaryRestoreNextSibling && heroSecondaryRestoreNextSibling.parentNode === heroSecondaryRestoreParent) {
            heroSecondaryRestoreParent.insertBefore(heroSecondaryLead, heroSecondaryRestoreNextSibling);
            return;
        }

        heroSecondaryRestoreParent.appendChild(heroSecondaryLead);
    }

    function syncHeroNarrativeLayout() {
        if (!heroCopy || !heroGrid || !heroLeads || !heroSecondaryLead) {
            return;
        }

        const tail = ensureHeroTail();
        if (!tail) {
            return;
        }

        if (mobileHeroNarrativeQuery.matches) {
            if (heroSecondaryLead.parentNode !== tail) {
                tail.appendChild(heroSecondaryLead);
            }
            tail.hidden = false;
            heroCopy.classList.add("hero-condensed");
            return;
        }

        restoreHeroSecondaryLead();
        tail.hidden = true;
        heroCopy.classList.remove("hero-condensed");
    }

    function textFor(key) {
        const locale = localeText[currentLocale] || localeText.en;
        return locale[key] || localeText.en[key] || key;
    }

    function sampleLabelFor(id) {
        const label = samples[id] && samples[id].label ? samples[id].label : null;
        if (!label) return id;
        return label[currentLocale] || label.en || id;
    }

    function setStatus(key) {
        currentStatusKey = key;
        runStatus.textContent = textFor(key);
    }

    function setOutputMessage(key, extraText) {
        currentOutputKey = key;
        const text = textFor(key);
        runOutput.textContent = extraText ? text + "\n\n" + sanitizeServerText(extraText) : text;
    }

    function sanitizeServerText(text) {
        if (text == null) {
            return "";
        }

        return String(text)
            .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
            .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");
    }

    function applyLocaleUi() {
        if (localeLabel) {
            localeLabel.textContent = currentLocale === "zh-CN" ? "简体中文" : "English";
        }

        if (localeLabel) {
            localeLabel.textContent = currentLocale === "zh-CN" ? "\u7b80\u4f53\u4e2d\u6587" : "English";
        }

        if (outputTitle) {
            outputTitle.textContent = textFor("outputTitle");
        }

        sampleLabel.textContent = sampleLabelFor(activeSample);
        tabButtons.forEach(function (button) {
            button.textContent = sampleLabelFor(button.dataset.sample);
        });

        if (currentOutputKey !== "server") {
            runOutput.textContent = textFor(currentOutputKey);
        }
        runStatus.textContent = textFor(currentStatusKey);

        localeOptions.forEach(function (option) {
            option.classList.toggle("active", option.dataset.locale === currentLocale);
        });

        syncLocaleOptionHrefs();
    }

    function syncLocaleOptionHrefs() {
        const hash = window.location.hash || "";
        localeOptions.forEach(function (option) {
            const raw = option.dataset.baseHref || option.getAttribute("href") || "/";
            const base = raw.split("#")[0];
            option.dataset.baseHref = base;
            option.setAttribute("href", base + hash);
        });
    }

    function escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function classify(token) {
        if (token.startsWith("//") || token.startsWith("/*")) {
            return "token-comment";
        }
        if (token.startsWith("\"")) {
            return "token-string";
        }
        if (token.startsWith("'")) {
            return "token-char";
        }
        if (/^\d+$/.test(token)) {
            return "token-number";
        }
        if (token === "true" || token === "false" || token === "null") {
            return "token-boolean";
        }
        if (keywordSet.has(token)) {
            return "token-keyword";
        }
        if (typeSet.has(token)) {
            return "token-type";
        }
        return "";
    }

    const declNameSet = new Set(["Unit", "Class", "Interface", "Struct", "Enum", "Record", "New", "Get", "Meta", "Delegate"]);

    function highlightKinal(code) {
        let result = "";
        let i = 0;

        while (i < code.length) {
            const blockStart = code.indexOf("<//", i);

            if (blockStart === -1) {
                result += highlightKinalSimple(code.slice(i), false);
                break;
            }

            if (blockStart > i) {
                result += highlightKinalSimple(code.slice(i, blockStart), false);
            }

            const blockEnd = code.indexOf("/>", blockStart + 3);

            if (blockEnd === -1) {
                result += highlightKinalSimple(code.slice(blockStart), false);
                break;
            }

            result += '<span class="token-block">&lt;//</span>';

            const inner = code.slice(blockStart + 3, blockEnd);
            if (inner.length > 0) {
                result += '<span class="token-block-inner">';
                result += highlightKinalSimple(inner, true);
                result += '</span>';
            }

            result += '<span class="token-block">/&gt;</span>';

            i = blockEnd + 2;
        }

        return result || " ";
    }

    function highlightKinalSimple(code, blockInner) {
        let result = "";
        let i = 0;

        while (i < code.length) {
            const ch = code[i];

            // ===== String =====
            if (ch === '"') {
                let j = i + 1;
                while (j < code.length) {
                    if (code[j] === "\\" && j + 1 < code.length) {
                        j += 2;
                        continue;
                    }
                    if (code[j] === '"') {
                        j++;
                        break;
                    }
                    j++;
                }

                const token = code.slice(i, j);
                result += '<span class="token-string">' + escapeHtml(token) + '</span>';
                i = j;
                continue;
            }

            // ===== Char =====
            if (ch === "'") {
                let j = i + 1;
                while (j < code.length) {
                    if (code[j] === "\\" && j + 1 < code.length) {
                        j += 2;
                        continue;
                    }
                    if (code[j] === "'") {
                        j++;
                        break;
                    }
                    j++;
                }

                const token = code.slice(i, j);
                result += '<span class="token-char">' + escapeHtml(token) + '</span>';
                i = j;
                continue;
            }

            // ===== Block comment =====
            if (ch === "/" && code[i + 1] === "*") {
                let j = i + 2;
                while (j < code.length && !(code[j] === "*" && code[j + 1] === "/")) {
                    j++;
                }
                if (j < code.length) j += 2;

                const token = code.slice(i, j);
                result += '<span class="token-comment">' + escapeHtml(token) + '</span>';
                i = j;
                continue;
            }

            // ===== Line comment =====
            // 普通 // 注释有效
            // 但 //> 不当作注释开头，避免和 <// ... /> 冲突
            if (ch === "/" && code[i + 1] === "/" && code[i + 2] !== ">") {
                let j = i + 2;
                while (j < code.length && code[j] !== "\n") {
                    j++;
                }

                const token = code.slice(i, j);
                result += '<span class="token-comment">' + escapeHtml(token) + '</span>';
                i = j;
                continue;
            }

            // ===== Number =====
            if (/[0-9]/.test(ch)) {
                let j = i + 1;
                while (j < code.length && /[0-9]/.test(code[j])) {
                    j++;
                }

                const token = code.slice(i, j);
                result += '<span class="token-number">' + escapeHtml(token) + '</span>';
                i = j;
                continue;
            }

            // ===== Identifier / dotted path =====
            if (/[A-Za-z_]/.test(ch)) {
                let j = i + 1;
                while (j < code.length && /[A-Za-z0-9_.]/.test(code[j])) {
                    j++;
                }

                const token = code.slice(i, j);

                if (token.includes(".")) {
                    const afterStr = code.slice(j);
                    const parts = token.split(".");
                    const lastPart = parts[parts.length - 1];

                    if (/^\s*\(/.test(afterStr) && /^[A-Z]/.test(lastPart) && parts.length > 1) {
                        const nsStr = parts.slice(0, -1).join(".");
                        if (/^[A-Z]/.test(parts[0])) {
                            result += '<span class="token-namespace">' + escapeHtml(nsStr) + '</span>.';
                        } else {
                            result += escapeHtml(nsStr + ".");
                        }
                        result += '<span class="token-funcname">' + escapeHtml(lastPart) + '</span>';
                    } else if (/^[A-Z]/.test(token)) {
                        result += '<span class="token-namespace">' + escapeHtml(token) + '</span>';
                    } else {
                        result += escapeHtml(token);
                    }

                    i = j;
                    continue;
                }

                const css = classify(token);
                if (css) {
                    result += '<span class="' + css + '">' + escapeHtml(token) + '</span>';
                } else {
                    const beforeStr = code.slice(0, i);
                    const afterStr2 = code.slice(j);
                    const prevM = beforeStr.match(/\b(\w+)\s*$/);
                    const prevWord = prevM ? prevM[1] : "";

                    if (declNameSet.has(prevWord)) {
                        result += '<span class="token-namespace">' + escapeHtml(token) + '</span>';
                    } else if (/^[A-Z]/.test(token) && /^\s*\(/.test(afterStr2)) {
                        result += '<span class="token-funcname">' + escapeHtml(token) + '</span>';
                    } else {
                        result += escapeHtml(token);
                    }
                }

                i = j;
                continue;
            }

            // ===== Other chars =====
            result += escapeHtml(ch);
            i++;
        }

        return result;
    }

    function renderLineNumbers(node, code) {
        const lines = Math.max(code.split("\n").length, 1);
        let html = "";
        for (let i = 1; i <= lines; i++) {
            html += `<div class="gutter-line">${i}</div>`;
        }
        node.innerHTML = `<div class="gutter-content">${html}</div>`;
    }

    function setTranslateY(node, value) {
        const inner = node && node.firstElementChild;
        if (!inner) {
            return;
        }
        inner.style.transform = `translateY(${value}px)`;
    }

    function setTranslate(node, x, y) {
        if (!node) {
            return;
        }
        node.style.transform = `translate(${x}px, ${y}px)`;
    }

    function syncGutterMetrics(gutterNode, sourceNode) {
        if (!gutterNode || !sourceNode) {
            return;
        }

        const style = getComputedStyle(sourceNode);
        gutterNode.style.setProperty("--gutter-pad-top", style.paddingTop);
        gutterNode.style.setProperty("--gutter-pad-bottom", style.paddingBottom);
        gutterNode.style.setProperty("--gutter-font-size", style.fontSize);
        gutterNode.style.setProperty("--gutter-line-height", style.lineHeight);
        gutterNode.style.setProperty("--gutter-line-step", style.lineHeight);
    }

    function syncCodeMeasureFont() {
        if (!codeMeasureContext) {
            return;
        }

        const style = getComputedStyle(editorInput);
        codeMeasureContext.font = [
            style.fontStyle,
            style.fontVariant,
            style.fontWeight,
            style.fontSize,
            style.fontFamily
        ].join(" ");
    }

    function measureCodeText(text) {
        if (!codeMeasureContext) {
            return text.length * 7.7;
        }

        syncCodeMeasureFont();
        return codeMeasureContext.measureText((text || "").replace(/\t/g, "    ")).width;
    }

    function syncEditorVisuals() {
        const value = editorInput.value;
        syncGutterMetrics(editorLines, editorInput);
        editorHighlight.innerHTML = highlightKinal(value);
        renderLineNumbers(editorLines, value);
    }

    function syncEditorScroll() {
        setTranslate(editorHighlight, -editorInput.scrollLeft, -editorInput.scrollTop);
        setTranslateY(editorLines, -editorInput.scrollTop);
    }

    function syncHeroScroll() {
        setTranslateY(heroLines, -heroCodeNode.scrollTop);
    }

    function renderReadOnly(node, gutterNode, code) {
        syncGutterMetrics(gutterNode, node);
        node.innerHTML = highlightKinal(code);
        renderLineNumbers(gutterNode, code);
        syncHeroScroll();
    }

    function setActiveTab(id) {
        activeSample = id;
        sampleLabel.textContent = sampleLabelFor(id);
        tabButtons.forEach((button) => {
            button.classList.toggle("active", button.dataset.sample === id);
        });
    }

    function normalizeSampleCode(text) {
        return (text || "").replace(/\r\n/g, "\n");
    }

    async function ensureSampleLoaded(id) {
        const sample = samples[id];
        if (!sample) {
            return "";
        }
        if (sample.code !== null && sample.code !== undefined && sample.code !== "") {
            return sample.code;
        }
        if (sample.pending) {
            return sample.pending;
        }

        sample.pending = fetch(sample.path, { cache: "no-store" })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("Failed to load sample: " + id);
                }
                return response.text();
            })
            .then(function (text) {
                sample.code = normalizeSampleCode(text);
                return sample.code;
            })
            .finally(function () {
                sample.pending = null;
            });

        return sample.pending;
    }

    function prefetchSamples() {
        Object.keys(samples).forEach(function (id) {
            if (id === initialSampleId) {
                return;
            }
            ensureSampleLoaded(id).catch(function () {
            });
        });
    }

    async function loadSample(id) {
        const token = ++sampleLoadToken;
        let source = "";

        if (id === "custom") {
            if (customCode !== "") {
                source = customCode;
            } else {
                source = await ensureSampleLoaded("custom");
                if (customCode === "") {
                    customCode = source;
                }
            }
        } else {
            source = await ensureSampleLoaded(id);
        }

        if (token !== sampleLoadToken) {
            return;
        }

        setActiveTab(id);
        editorInput.value = id === "custom" ? customCode : source;
        syncEditorVisuals();
        syncEditorScroll();
    }

    function handleCustomPromotion() {
        const current = editorInput.value;
        if (activeSample !== "custom" && current !== samples[activeSample].code) {
            customCode = current;
            setActiveTab("custom");
        } else if (activeSample === "custom") {
            customCode = current;
        }
    }

    function delay(ms) {
        return new Promise(function (resolve) {
            window.setTimeout(resolve, ms);
        });
    }

    function parseJobResponse(text) {
        const raw = text || "";
        const newline = raw.indexOf("\n");
        if (newline < 0) {
            return {
                status: raw.trim(),
                payload: ""
            };
        }
        return {
            status: raw.slice(0, newline).trim(),
            payload: raw.slice(newline + 1)
        };
    }

    async function pollRunJob(jobId) {
        while (true) {
            const response = await fetch("/api/run/status?id=" + encodeURIComponent(jobId), {
                cache: "no-store"
            });
            const text = await response.text();
            const parsed = parseJobResponse(text);
            if (parsed.status === "queued" || parsed.status === "compiling" || parsed.status === "running") {
                setStatus("running");
                setOutputMessage("compiling", parsed.status);
                await delay(250);
                continue;
            }
            return {
                response: response,
                text: text,
                parsed: parsed
            };
        }
    }

    async function runCode() {
        const code = editorInput.value;

        if (code.length > maxCodeSize) {
            setStatus("tooLarge");
            setOutputMessage("payloadTooLarge");
            return;
        }

        runButton.disabled = true;
        setStatus("running");
        setOutputMessage("compiling");

        try {
            const response = await fetch("/api/run", {
                method: "POST",
                headers: {
                    "Content-Type": "text/plain; charset=utf-8"
                },
                body: code
            });

            const text = await response.text();
            const jobId = text.trim();

            if (!response.ok) {
                lastServerResult = text;
                if (text && text !== "") {
                    currentOutputKey = "server";
                    runOutput.textContent = sanitizeServerText(text);
                } else {
                    setOutputMessage("noOutput");
                }
                setStatus("rejected");
                return;
            }

            const finalState = await pollRunJob(jobId);
            lastServerResult = finalState.parsed.payload || finalState.text;
            if (finalState.parsed.payload && finalState.parsed.payload !== "") {
                currentOutputKey = "server";
                runOutput.textContent = sanitizeServerText(finalState.parsed.payload);
            } else {
                setOutputMessage("noOutput");
            }
            setStatus(finalState.parsed.status === "completed" ? "completed" : "rejected");
        } catch (error) {
            const message = error && error.message ? error.message : String(error);
            setOutputMessage("networkError", message);
            setStatus("offline");
        } finally {
            runButton.disabled = false;
        }
    }

    tabButtons.forEach((button) => {
        button.addEventListener("click", async function () {
            const id = button.dataset.sample;
            if (id === "custom") {
                customCode = editorInput.value;
            }
            await loadSample(id);
            if (lastServerResult !== "") {
                setStatus("ready");
            }
        });
    });

    editorInput.addEventListener("input", function () {
        syncEditorVisuals();
        handleCustomPromotion();
        setStatus("edited");
        updateAutocomplete();
    });

    editorInput.addEventListener("scroll", syncEditorScroll);
    editorInput.addEventListener("keydown", function (event) {
        if (acVisible()) {
            if (event.key === "ArrowDown") {
                event.preventDefault();
                acMove(1);
                return;
            }
            if (event.key === "ArrowUp") {
                event.preventDefault();
                acMove(-1);
                return;
            }
            if (event.key === "Tab" || event.key === "Enter") {
                event.preventDefault();
                acAccept();
                return;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                acHide();
                return;
            }
        }
        if (event.key === "Tab") {
            event.preventDefault();
            const start = editorInput.selectionStart;
            const end = editorInput.selectionEnd;
            editorInput.setRangeText("    ", start, end, "end");
            editorInput.selectionStart = editorInput.selectionEnd = start + 4;
            syncEditorVisuals();
            handleCustomPromotion();
            return;
        }

        var pairMap = { "(": ")", "{": "}", "[": "]", '"': '"', "'": "'" };
        var closerSet = { ")": 1, "}": 1, "]": 1 };
        var ch = event.key;

        if (pairMap[ch]) {
            var s = editorInput.selectionStart;
            var e = editorInput.selectionEnd;
            var val = editorInput.value;
            if ((ch === '"' || ch === "'") && val[s] === ch) {
                event.preventDefault();
                editorInput.selectionStart = editorInput.selectionEnd = s + 1;
                return;
            }
            event.preventDefault();
            editorInput.setRangeText(ch + val.slice(s, e) + pairMap[ch], s, e, "end");
            if (s === e) {
                editorInput.selectionStart = editorInput.selectionEnd = s + 1;
            } else {
                editorInput.selectionStart = s + 1;
                editorInput.selectionEnd = e + 1;
            }
            syncEditorVisuals();
            handleCustomPromotion();
            setStatus("edited");
            updateAutocomplete();
            return;
        }

        if (closerSet[ch] && editorInput.value[editorInput.selectionStart] === ch) {
            event.preventDefault();
            editorInput.selectionStart = editorInput.selectionEnd = editorInput.selectionStart + 1;
            return;
        }

        // Enter between brackets: auto-indent
        if (ch === "Enter") {
            var s3 = editorInput.selectionStart;
            var val3 = editorInput.value;
            var prev3 = val3[s3 - 1];
            var next3 = val3[s3];
            if ((prev3 === "{" && next3 === "}") || (prev3 === "(" && next3 === ")") || (prev3 === "[" && next3 === "]")) {
                event.preventDefault();
                var lineStart = val3.lastIndexOf("\n", s3 - 1) + 1;
                var lineText = val3.slice(lineStart, s3);
                var indent = lineText.match(/^\s*/)[0];
                var newIndent = indent + "    ";
                var insertion = "\n" + newIndent + "\n" + indent;
                editorInput.setRangeText(insertion, s3, s3, "end");
                editorInput.selectionStart = editorInput.selectionEnd = s3 + 1 + newIndent.length;
                syncEditorVisuals();
                handleCustomPromotion();
                setStatus("edited");
                return;
            }
        }

        if (ch === "/" && !event.ctrlKey && !event.altKey) {
            var s2 = editorInput.selectionStart;
            if (s2 > 0 && editorInput.value[s2 - 1] === "<") {
                event.preventDefault();
                editorInput.setRangeText("//>", s2, s2, "end");

                editorInput.selectionStart = editorInput.selectionEnd = s2 + 1;
                syncEditorVisuals();
                handleCustomPromotion();
                setStatus("edited");
                return;
            }
        }
    });

    const acMenu = document.getElementById("autocomplete");
    let acItems = [];
    let acIndex = -1;
    let acPrefix = "";
    let acFadeTimer = null;

    function acFunc() {
        return { _kind: "func" };
    }

    function acType(children) {
        return Object.assign({ _kind: "type" }, children || {});
    }

    function acModule(children) {
        return Object.assign({ _kind: "module" }, children || {});
    }

    const acModuleTree = acModule({
        "IO": acModule({
            "Console": acModule({
                "PrintLine": acFunc(),
                "Print": acFunc(),
                "ReadLine": acFunc(),
                "Clear": acFunc()
            }),
            "Time": acModule({
                "Now": acFunc(),
                "GetTick": acFunc(),
                "Sleep": acFunc(),
                "GetNanoTick": acFunc(),
                "Format": acFunc(),
                "DateTime": acType()
            }),
            "Math": acModule({
                "Abs": acFunc(),
                "Min": acFunc(),
                "Max": acFunc(),
                "Clamp": acFunc(),
                "Sign": acFunc()
            }),
            "Path": acModule({
                "Combine": acFunc(),
                "FileName": acFunc(),
                "Extension": acFunc(),
                "Directory": acFunc(),
                "Normalize": acFunc(),
                "Cwd": acFunc(),
                "ChangeExtension": acFunc(),
                "HasExtension": acFunc(),
                "IsAbsolute": acFunc(),
                "BaseName": acFunc()
            }),
            "Text": acModule({
                "Length": acFunc(),
                "IsEmpty": acFunc(),
                "Count": acFunc(),
                "Contains": acFunc(),
                "StartsWith": acFunc(),
                "EndsWith": acFunc(),
                "IndexOf": acFunc(),
                "LastIndexOf": acFunc(),
                "Trim": acFunc(),
                "Replace": acFunc(),
                "ToUpper": acFunc(),
                "ToLower": acFunc(),
                "Slice": acFunc(),
                "Split": acFunc(),
                "Join": acFunc(),
                "Lines": acFunc()
            }),
            "File": acModule({
                "Exists": acFunc(),
                "Create": acFunc(),
                "Touch": acFunc(),
                "ReadAllText": acFunc(),
                "ReadFirstLine": acFunc(),
                "WriteAllText": acFunc(),
                "AppendAllText": acFunc(),
                "AppendLine": acFunc(),
                "Delete": acFunc(),
                "DeleteIfExists": acFunc(),
                "Size": acFunc(),
                "IsEmpty": acFunc(),
                "Copy": acFunc(),
                "Move": acFunc(),
                "ReadOrDefault": acFunc(),
                "ReadIfExists": acFunc(),
                "ReadOr": acFunc(),
                "ReadLines": acFunc(),
                "WriteLines": acFunc(),
                "ReplaceText": acFunc()
            }),
            "Directory": acModule({
                "Exists": acFunc(),
                "Create": acFunc(),
                "Ensure": acFunc(),
                "Delete": acFunc(),
                "DeleteIfExists": acFunc()
            }),
            "System": acModule({
                "Exit": acFunc(),
                "CommandLine": acFunc(),
                "FileExists": acFunc(),
                "Exec": acFunc(),
                "LoadLibrary": acFunc(),
                "GetSymbol": acFunc(),
                "CloseLibrary": acFunc(),
                "LastError": acFunc()
            }),
            "Meta": acModule({
                "Query": acFunc(),
                "Of": acFunc(),
                "Has": acFunc(),
                "Find": acFunc()
            }),
            "Error": acModule({
                "LastTrace": acFunc(),
                "HasException": acFunc(),
                "Clear": acFunc(),
                "Current": acFunc()
            }),
            "GC": acModule({
                "Collect": acFunc()
            }),
            "Memory": acModule({
                "Copy": acFunc(),
                "Set": acFunc(),
                "Zero": acFunc(),
                "Compare": acFunc()
            }),
            "Volatile": acModule({
                "Read8": acFunc(),
                "Read16": acFunc(),
                "Read32": acFunc(),
                "Read64": acFunc(),
                "Write8": acFunc(),
                "Write16": acFunc(),
                "Write32": acFunc(),
                "Write64": acFunc()
            }),
            "Panic": acModule({
                "Abort": acFunc(),
                "Halt": acFunc()
            }),
            "Collection": acModule({
                "dict": acType({
                    "Create": acFunc(),
                    "Set": acFunc(),
                    "Fetch": acFunc(),
                    "TryFetch": acFunc(),
                    "Contains": acFunc(),
                    "Count": acFunc(),
                    "Remove": acFunc(),
                    "IsEmpty": acFunc(),
                    "Keys": acFunc(),
                    "Values": acFunc()
                }),
                "list": acType({
                    "Create": acFunc(),
                    "Add": acFunc(),
                    "Fetch": acFunc(),
                    "Set": acFunc(),
                    "Insert": acFunc(),
                    "TryFetch": acFunc(),
                    "Count": acFunc(),
                    "Clear": acFunc(),
                    "RemoveAt": acFunc(),
                    "Contains": acFunc(),
                    "Pop": acFunc(),
                    "Peek": acFunc(),
                    "IndexOf": acFunc(),
                    "IsEmpty": acFunc()
                }),
                "set": acType({
                    "Create": acFunc(),
                    "Add": acFunc(),
                    "Contains": acFunc(),
                    "Count": acFunc(),
                    "Remove": acFunc(),
                    "Clear": acFunc(),
                    "IsEmpty": acFunc(),
                    "Values": acFunc()
                })
            }),
            "Type": acModule({
                "bool": acFunc(),
                "byte": acFunc(),
                "char": acFunc(),
                "int": acFunc(),
                "float": acFunc(),
                "f16": acFunc(),
                "f32": acFunc(),
                "f64": acFunc(),
                "f128": acFunc(),
                "i8": acFunc(),
                "i16": acFunc(),
                "i32": acFunc(),
                "i64": acFunc(),
                "u8": acFunc(),
                "u16": acFunc(),
                "u32": acFunc(),
                "u64": acFunc(),
                "isize": acFunc(),
                "usize": acFunc(),
                "string": acType({
                    "Length": acFunc(),
                    "Concat": acFunc(),
                    "Equals": acFunc(),
                    "ToChars": acFunc()
                }),
                "any": acType({
                    "IsNull": acFunc(),
                    "ToString": acFunc(),
                    "Equals": acFunc(),
                    "Tag": acFunc(),
                    "TypeName": acFunc(),
                    "IsNumber": acFunc(),
                    "IsPointer": acFunc(),
                    "IsInt": acFunc(),
                    "IsFloat": acFunc(),
                    "IsString": acFunc(),
                    "IsBool": acFunc(),
                    "IsChar": acFunc(),
                    "IsObject": acFunc()
                }),
                "Object": acModule({
                    "Class": acType(),
                    "Function": acType({
                        "Invoke": acFunc()
                    }),
                    "Block": acType({
                        "Run": acFunc(),
                        "Jump": acFunc(),
                        "RunUntil": acFunc(),
                        "JumpAndRunUntil": acFunc()
                    })
                })
            }),
            "Web": acModule({
                "Route": acFunc(),
                "HttpMethod": acType({
                    "Unknown": acType(),
                    "GET": acType(),
                    "POST": acType(),
                    "PUT": acType(),
                    "DELETE": acType(),
                    "PATCH": acType(),
                    "HEAD": acType(),
                    "OPTIONS": acType()
                }),
                "Request": acType({
                    "Method": acFunc(),
                    "MethodText": acFunc(),
                    "Path": acFunc(),
                    "RawPath": acFunc(),
                    "QueryText": acFunc(),
                    "ContentType": acFunc(),
                    "ContentLength": acFunc(),
                    "QueryValue": acFunc(),
                    "Header": acFunc(),
                    "BodyText": acFunc()
                }),
                "Response": acType({
                    "StatusCode": acFunc(),
                    "ContentType": acFunc(),
                    "HasSent": acFunc(),
                    "Send": acFunc(),
                    "Text": acFunc(),
                    "Html": acFunc(),
                    "Json": acFunc(),
                    "JavaScript": acFunc()
                }),
                "Context": acType({
                    "Server": acFunc(),
                    "Request": acFunc(),
                    "Response": acFunc()
                }),
                "RouteDefinition": acType({
                    "Key": acFunc(),
                    "Invoke": acFunc()
                }),
                "StaticMount": acType(),
                "Server": acType({
                    "Host": acFunc(),
                    "Port": acFunc(),
                    "Debug": acFunc(),
                    "LiveReload": acFunc(),
                    "IsStarted": acFunc(),
                    "HasRoutes": acFunc(),
                    "EnableDebug": acFunc(),
                    "EnableLiveReload": acFunc(),
                    "Url": acFunc(),
                    "ReloadVersionPath": acFunc(),
                    "DebugRoutesPath": acFunc(),
                    "DebugServerPath": acFunc(),
                    "UseStatic": acFunc(),
                    "UseStaticMount": acFunc(),
                    "RefreshRoutes": acFunc(),
                    "UseRoutes": acFunc(),
                    "FindRoute": acFunc(),
                    "HasAnyRouteForPath": acFunc(),
                    "ReloadVersion": acFunc(),
                    "LiveReloadScript": acFunc(),
                    "InjectLiveReload": acFunc(),
                    "BuildRoutesDebugText": acFunc(),
                    "BuildDebugErrorPage": acFunc(),
                    "BuildProductionErrorPage": acFunc(),
                    "HandleCurrentError": acFunc(),
                    "DispatchCurrentRequest": acFunc(),
                    "Start": acFunc(),
                    "Wait": acFunc(),
                    "Stop": acFunc(),
                    "Run": acFunc()
                }),
                "Http": acModule({
                    "CurrentServer": acFunc(),
                    "Current": acFunc(),
                    "Request": acFunc(),
                    "Response": acFunc()
                })
            })
        })
    });

    const acKeywords = [
        "Unit", "Get", "Set", "By", "Property", "Function", "Return", "If", "Else",
        "ElseIf", "While", "For", "Switch", "Case", "Break", "Continue", "Try", "Catch",
        "Throw", "Class", "Interface", "Struct", "Enum", "Public", "Private", "Protected",
        "Internal", "Static", "Virtual", "Override", "Abstract", "Sealed", "Constructor",
        "New", "This", "Base", "Block", "Record", "Jump", "Const", "Var", "Safe",
        "Trusted", "Unsafe", "Is", "Meta", "On", "Keep", "Repeatable", "Delegate", "Extern"
    ];

    const acTypes = [
        "int", "float", "f16", "f32", "f64", "f128",
        "i8", "i16", "i32", "i64",
        "u8", "u16", "u32", "u64",
        "isize", "usize",
        "string", "bool", "char", "void", "any", "byte",
        "dict", "list", "set"
    ];

    function getWordBefore() {
        const pos = editorInput.selectionStart;
        const text = editorInput.value.slice(0, pos);
        const m = text.match(/[A-Za-z_][A-Za-z0-9_.]*$/);
        return m ? m[0] : "";
    }

    function getCaretCoords() {
        const text = editorInput.value.slice(0, editorInput.selectionStart);
        const lines = text.split("\n");
        const row = lines.length - 1;
        const lineHeight = parseFloat(getComputedStyle(editorInput).lineHeight) || 20;
        const padTop = parseFloat(getComputedStyle(editorInput).paddingTop) || 14;
        const padLeft = parseFloat(getComputedStyle(editorInput).paddingLeft) || 16;
        const lineWidth = measureCodeText(lines[row] || "");
        return {
            top: padTop + (row + 1) * lineHeight - editorInput.scrollTop,
            left: padLeft + lineWidth - editorInput.scrollLeft
        };
    }

    function resolveModulePath(prefix) {
        const parts = prefix.split(".");
        let node = acModuleTree;
        let consumed = [];
        for (let i = 0; i < parts.length - 1; i++) {
            if (node[parts[i]] && typeof node[parts[i]] === "object") {
                node = node[parts[i]];
                consumed.push(parts[i]);
            } else {
                return null;
            }
        }
        const partial = parts[parts.length - 1].toLowerCase();
        const basePath = consumed.length > 0 ? consumed.join(".") + "." : "";
        const results = [];
        for (const key in node) {
            if (key === "_kind") continue;
            if (key.toLowerCase().startsWith(partial) && key !== parts[parts.length - 1]) {
                const kind = node[key]._kind || "module";
                results.push({ text: basePath + key, kind: kind });
            }
        }
        return results;
    }

    function getCompletions(prefix) {
        const results = [];
        const lower = prefix.toLowerCase();

        /* If prefix contains a dot, do hierarchical module lookup */
        if (prefix.includes(".")) {
            const moduleResults = resolveModulePath(prefix);
            if (moduleResults) return moduleResults.slice(0, 8);
            return [];
        }

        /* Top-level: keywords + types + top-level modules */
        for (const kw of acKeywords) {
            if (kw.toLowerCase().startsWith(lower) && kw !== prefix)
                results.push({ text: kw, kind: "keyword" });
        }
        for (const tp of acTypes) {
            if (tp.toLowerCase().startsWith(lower) && tp !== prefix)
                results.push({ text: tp, kind: "type" });
        }
        for (const key in acModuleTree) {
            if (key.toLowerCase().startsWith(lower) && key !== prefix)
                results.push({ text: key, kind: "module" });
        }
        return results.slice(0, 8);
    }

    function updateAutocomplete() {
        const prefix = getWordBefore();
        if (prefix.length < 1) { acHide(); return; }

        const matches = getCompletions(prefix);
        if (matches.length === 0) { acHide(); return; }

        acPrefix = prefix;
        acItems = matches;
        acIndex = 0;

        acMenu.innerHTML = "";
        acItems.forEach(function (item, i) {
            const li = document.createElement("li");
            li.setAttribute("role", "option");

            const badge = document.createElement("span");
            badge.className = "ac-badge ac-" + item.kind;
            const labels = { keyword: "K", type: "T", module: "M", func: "F" };
            badge.textContent = labels[item.kind] || "S";
            li.appendChild(badge);

            const label = document.createElement("span");
            label.textContent = item.text;
            li.appendChild(label);

            if (i === 0) li.classList.add("active");
            li.addEventListener("mousedown", function (e) {
                e.preventDefault();
                acIndex = i;
                acAccept();
            });
            acMenu.appendChild(li);
        });

        const coords = getCaretCoords();
        acMenu.style.top = coords.top + "px";
        acMenu.style.left = Math.min(coords.left, editorInput.offsetWidth - 180) + "px";
        acShow();
    }

    function acVisible() { return acMenu.classList.contains("ac-show"); }

    function acShow() {
        clearTimeout(acFadeTimer);
        acMenu.hidden = false;
        /* Force reflow so transition fires */
        void acMenu.offsetHeight;
        acMenu.classList.add("ac-show");
    }

    function acHide() {
        if (!acMenu.classList.contains("ac-show") && acMenu.hidden) return;
        acMenu.classList.remove("ac-show");
        clearTimeout(acFadeTimer);
        acFadeTimer = setTimeout(function () {
            acMenu.hidden = true;
            acItems = [];
            acIndex = -1;
        }, 200);
    }

    function acMove(dir) {
        if (acItems.length === 0) return;
        const lis = acMenu.querySelectorAll("li");
        if (lis[acIndex]) lis[acIndex].classList.remove("active");
        acIndex = (acIndex + dir + acItems.length) % acItems.length;
        lis[acIndex].classList.add("active");
        lis[acIndex].scrollIntoView({ block: "nearest" });
    }

    function acAccept() {
        if (acIndex < 0 || acIndex >= acItems.length) { acHide(); return; }
        const chosen = acItems[acIndex].text;
        const pos = editorInput.selectionStart;
        const before = editorInput.value.slice(0, pos - acPrefix.length);
        const after = editorInput.value.slice(pos);
        editorInput.value = before + chosen + after;
        editorInput.selectionStart = editorInput.selectionEnd = before.length + chosen.length;
        acHide();
        syncEditorVisuals();
        handleCustomPromotion();
        editorInput.focus();
    }

    editorInput.addEventListener("blur", function () {
        setTimeout(acHide, 150);
    });

    function setLocaleMenu(open) {
        if (!localeSwitch || !localeTrigger) return;
        localeSwitch.classList.toggle("open", open);
        localeTrigger.setAttribute("aria-expanded", open ? "true" : "false");
    }

    if (localeTrigger) {
        localeTrigger.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            setLocaleMenu(!localeSwitch.classList.contains("open"));
        });
    }

    localeOptions.forEach(function (option) {
        option.addEventListener("click", function () {
            syncLocaleOptionHrefs();
            setLocaleMenu(false);
        });
    });

    document.addEventListener("click", function (event) {
        if (!localeSwitch || localeSwitch.contains(event.target)) return;
        setLocaleMenu(false);
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            setLocaleMenu(false);
        }
    });

    runButton.addEventListener("click", runCode);
    heroCodeNode.addEventListener("scroll", syncHeroScroll);

    /* ===== Mobile hamburger menu toggle ===== */
    var topbarToggle = document.getElementById("topbar-toggle");
    var topbar = document.querySelector(".topbar");
    if (topbarToggle && topbar) {
        topbarToggle.addEventListener("click", function () {
            topbar.classList.toggle("menu-open");
        });
        /* Close menu when a nav link is clicked */
        var mobileNavLinks = topbar.querySelectorAll(".topnav a");
        mobileNavLinks.forEach(function (link) {
            link.addEventListener("click", function () {
                topbar.classList.remove("menu-open");
            });
        });
    }

    applyLocaleUi();
    syncHeroNarrativeLayout();
    renderReadOnly(heroCodeNode, heroLines, heroCode);
    loadSample(initialSampleId);
    prefetchSamples();
    window.addEventListener("resize", function () {
        syncHeroNarrativeLayout();
        syncGutterMetrics(heroLines, heroCodeNode);
        syncGutterMetrics(editorLines, editorInput);
        syncEditorScroll();
        syncHeroScroll();
    });

    (function () {
        const shell = document.querySelector(".shell");
        const layers = Array.from(document.querySelectorAll(".layer"));
        const snapLinks = Array.from(document.querySelectorAll('a[href^="#"]'));
        const interactiveSelector = ".editor-stack, .readonly-shell, #run-output, .autocomplete";
        const desktopSnapQuery = window.matchMedia("(min-width: 1400px)");
        const transition = "transform 1200ms cubic-bezier(0.22, 1, 0.36, 1)";
        let activeIndex = 0;
        let animating = false;
        let wheelLock = false;
        let touchStartY = 0;
        let touchStartTarget = null;

        if (!shell || layers.length === 0) return;

        if ("scrollRestoration" in history) {
            history.scrollRestoration = "manual";
        }

        function getLayerIndexFromHash(hash) {
            if (!hash) return 0;
            const target = document.querySelector(hash);
            if (!target) return 0;
            const layer = target.classList.contains("layer") ? target : target.closest(".layer");
            if (!layer) return 0;
            const idx = layers.indexOf(layer);
            return idx >= 0 ? idx : 0;
        }

        function updateNavState() {
            const currentHash = layers[activeIndex] && layers[activeIndex].id ? "#" + layers[activeIndex].id : "";
            snapLinks.forEach(function (link) {
                const hash = link.getAttribute("href");
                const idx = getLayerIndexFromHash(hash);
                link.classList.toggle("active", idx === activeIndex || hash === currentHash);
            });
        }

        /* Track whether the #syntax section inside #playground is in view (non-desktop only) */
        var syntaxInView = false;
        var syntaxEl = document.getElementById("syntax");

        function updateNavStateNatural() {
            var activeHash;
            if (syntaxInView) {
                activeHash = "#syntax";
            } else {
                activeHash = layers[activeIndex] && layers[activeIndex].id ? "#" + layers[activeIndex].id : "";
            }
            snapLinks.forEach(function (link) {
                var hash = link.getAttribute("href");
                link.classList.toggle("active", hash === activeHash);
            });
        }

        function initNaturalScrolling() {
            shell.style.willChange = "auto";
            shell.style.transition = "none";
            shell.style.transform = "none";
            document.body.style.overflowY = "auto";
            document.body.style.overflowX = "hidden";

            let observer = null;
            let syntaxObserver = null;

            /* Observe #syntax element separately to distinguish Playground vs Design */
            if ("IntersectionObserver" in window && syntaxEl) {
                syntaxObserver = new IntersectionObserver(function (entries) {
                    entries.forEach(function (entry) {
                        syntaxInView = entry.isIntersecting && entry.intersectionRatio >= 0.3;
                    });
                    updateNavStateNatural();
                    syncLocaleOptionHrefs();
                }, {
                    root: null,
                    threshold: [0.1, 0.3, 0.5]
                });
                syntaxObserver.observe(syntaxEl);
            }

            if ("IntersectionObserver" in window) {
                observer = new IntersectionObserver(function (entries) {
                    let bestIndex = activeIndex;
                    let bestRatio = 0;
                    entries.forEach(function (entry) {
                        if (!entry.isIntersecting) return;
                        const idx = layers.indexOf(entry.target);
                        if (idx < 0) return;
                        if (entry.intersectionRatio >= bestRatio) {
                            bestRatio = entry.intersectionRatio;
                            bestIndex = idx;
                        }
                    });
                    if (bestRatio > 0) {
                        activeIndex = bestIndex;
                        updateNavStateNatural();
                        syncLocaleOptionHrefs();
                    }
                }, {
                    root: null,
                    threshold: [0.2, 0.35, 0.5, 0.65]
                });

                layers.forEach(function (layer) {
                    observer.observe(layer);
                });
            }

            function syncFromHash(instant) {
                const hash = location.hash || "#intro";
                activeIndex = getLayerIndexFromHash(hash);
                if (hash === "#syntax") syntaxInView = true;
                else syntaxInView = false;
                updateNavStateNatural();
                syncLocaleOptionHrefs();
                if (!hash || hash === "#intro" || !instant) return;
                const target = document.querySelector(hash);
                if (!target) return;
                target.scrollIntoView({
                    behavior: "auto",
                    block: "start"
                });
            }

            window.addEventListener("hashchange", function () {
                syncFromHash(true);
            });

            snapLinks.forEach(function (link) {
                link.addEventListener("click", function (event) {
                    const hash = link.getAttribute("href");
                    if (!hash || !hash.startsWith("#")) return;
                    const target = document.querySelector(hash);
                    if (!target) return;
                    event.preventDefault();
                    history.replaceState(null, "", hash);
                    activeIndex = getLayerIndexFromHash(hash);
                    if (hash === "#syntax") syntaxInView = true;
                    else syntaxInView = false;
                    updateNavStateNatural();
                    syncLocaleOptionHrefs();
                    target.scrollIntoView({
                        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                        block: "start"
                    });
                });
            });

            window.addEventListener("scroll", function () {
                if (observer) return;
                const mid = window.scrollY + (window.innerHeight * 0.35);
                let best = 0;
                for (let i = 0; i < layers.length; i++) {
                    if (layers[i].offsetTop <= mid) {
                        best = i;
                    }
                }
                /* Fallback syntax detection */
                if (syntaxEl) {
                    var rect = syntaxEl.getBoundingClientRect();
                    syntaxInView = rect.top < window.innerHeight * 0.65 && rect.bottom > window.innerHeight * 0.35;
                }
                if (best !== activeIndex) {
                    activeIndex = best;
                    updateNavStateNatural();
                    syncLocaleOptionHrefs();
                }
            }, { passive: true });

            syncFromHash(false);
            return;
        }

        if (!desktopSnapQuery.matches) {
            initNaturalScrolling();
            return;
        }

        shell.style.willChange = "transform";
        shell.style.transition = transition;
        shell.style.transform = "translate3d(0, 0, 0)";
        document.body.style.overflowY = "hidden";
        document.body.style.overflowX = "hidden";

        function resetNativeScroll() {
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        }

        function isInteractiveArea(target) {
            if (!target || !target.closest) return false;
            return !!target.closest(interactiveSelector);
        }

        function moveTo(index, instant, hash) {
            const nextIndex = Math.max(0, Math.min(index, layers.length - 1));
            if (!instant && nextIndex === activeIndex) {
                updateNavState();
                return;
            }
            activeIndex = nextIndex;
            animating = !instant;
            shell.style.transition = instant ? "none" : transition;
            resetNativeScroll();
            shell.style.transform = "translate3d(0, -" + layers[nextIndex].offsetTop + "px, 0)";

            if (hash && hash !== location.hash) {
                history.replaceState(null, "", hash);
            } else if (!hash && layers[nextIndex].id && location.hash !== "#" + layers[nextIndex].id) {
                history.replaceState(null, "", "#" + layers[nextIndex].id);
            }

            updateNavState();
            syncLocaleOptionHrefs();

            if (instant) {
                requestAnimationFrame(function () {
                    shell.style.transition = transition;
                });
            }
        }

        function nudge(step) {
            if (animating) return;
            const next = activeIndex + step;
            if (next < 0 || next >= layers.length) return;
            moveTo(next, false);
        }

        shell.addEventListener("transitionend", function (event) {
            if (event.propertyName === "transform") {
                animating = false;
            }
        });

        window.addEventListener("resize", function () {
            moveTo(activeIndex, true);
        });

        window.addEventListener("pageshow", function () {
            resetNativeScroll();
            moveTo(getLayerIndexFromHash(location.hash || "#intro"), true, location.hash || "#intro");
        });

        window.addEventListener("hashchange", function () {
            resetNativeScroll();
            moveTo(getLayerIndexFromHash(location.hash || "#intro"), false, location.hash || "#intro");
        });

        window.addEventListener("wheel", function (event) {
            if (isInteractiveArea(event.target)) return;
            event.preventDefault();
            if (animating || wheelLock) return;

            const delta = event.deltaY;
            if (Math.abs(delta) < 18) return;

            wheelLock = true;
            nudge(delta > 0 ? 1 : -1);
            setTimeout(function () {
                wheelLock = false;
            }, 220);
        }, { passive: false });

        window.addEventListener("keydown", function (event) {
            if (document.activeElement === editorInput) return;
            if (document.activeElement && document.activeElement.closest && document.activeElement.closest(interactiveSelector)) return;

            if (event.key === "ArrowDown" || event.key === "PageDown" || event.key === " ") {
                event.preventDefault();
                nudge(1);
            } else if (event.key === "ArrowUp" || event.key === "PageUp") {
                event.preventDefault();
                nudge(-1);
            } else if (event.key === "Home") {
                event.preventDefault();
                moveTo(0, false, "#intro");
            } else if (event.key === "End") {
                event.preventDefault();
                moveTo(layers.length - 1, false, "#" + layers[layers.length - 1].id);
            }
        });

        window.addEventListener("touchstart", function (event) {
            touchStartTarget = event.target;
            if (isInteractiveArea(event.target)) return;
            touchStartY = event.touches[0].clientY;
        }, { passive: true });

        window.addEventListener("touchmove", function (event) {
            if (isInteractiveArea(touchStartTarget)) return;
            event.preventDefault();
        }, { passive: false });

        window.addEventListener("touchend", function (event) {
            if (isInteractiveArea(touchStartTarget) || animating) return;
            const touch = event.changedTouches[0];
            if (!touch) return;
            const delta = touchStartY - touch.clientY;
            if (Math.abs(delta) < 48) return;
            nudge(delta > 0 ? 1 : -1);
        }, { passive: true });

        snapLinks.forEach(function (link) {
            link.addEventListener("click", function (event) {
                const hash = link.getAttribute("href");
                if (!hash || !hash.startsWith("#")) return;
                event.preventDefault();
                moveTo(getLayerIndexFromHash(hash), false, hash);
            });
        });

        resetNativeScroll();
        moveTo(getLayerIndexFromHash(location.hash || "#intro"), true, location.hash || "#intro");
        requestAnimationFrame(function () {
            resetNativeScroll();
        });
    })();

    /* ===== Full-page section snap — transform-based, zero latency ===== */
})();
