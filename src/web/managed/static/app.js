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

        const text = node.content.textContent || "";
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
    const initialSampleId = "hello";
    const initialSampleCode = readTemplateText("kinal-sample-code");

    function samplePath(id) {
        return "/static/content/" + id + ".kn";
    }

    const samples = {
        hello: { label: { en: "Hello World", "zh-CN": "Hello World" }, code: heroCode },
        block: {
            label: {
                en: "Block",
                "zh-CN": "代码块"
            },
            path: samplePath("block"),
            code: initialSampleCode,
            pending: null
        },
        meta: {
            label: {
                en: "Meta",
                "zh-CN": "元数据"
            },
            path: samplePath("meta"),
            code: null,
            pending: null
        },
        oop: {
            label: {
                en: "OOP",
                "zh-CN": "面向对象"
            },
            path: samplePath("oop"),
            code: null,
            pending: null
        },
        scope: {
            label: {
                en: "Scope",
                "zh-CN": "作用域"
            },
            path: samplePath("scope"),
            code: null,
            pending: null
        },
        custom: {
            label: {
                en: "My code",
                "zh-CN": "我的代码"
            },
            path: samplePath("custom"),
            code: null,
            pending: null
        }
    };

    const localeText = {
        en: {
            outputTitle: "Output",
            ready: "Ready",
            edited: "Edited",
            running: "Running…",
            queued: "Queued",
            building: "Compiling…",
            loading: "Loading sample…",
            sampleError: "Could not load this sample. Select it to try again.",
            empty: "Enter some code before running.",
            previous: "Previous run",
            completed: "Completed",
            rejected: "Rejected",
            offline: "Offline",
            tooLarge: "Too Large",
            noOutput: "(no output)",
            runPlaceholder: "Run the sample to see its output.",
            compiling: "Compiling and executing...",
            networkError: "Network error",
            payloadTooLarge: "Code payload exceeds 4 KB."
        },
        "zh-CN": {
            outputTitle: "输出",
            ready: "就绪",
            edited: "已修改",
            running: "运行中…",
            queued: "排队中",
            building: "编译中…",
            loading: "正在加载示例…",
            sampleError: "无法加载此示例。重新选择即可重试。",
            empty: "请先输入代码。",
            previous: "上次运行",
            completed: "完成",
            rejected: "已拒绝",
            offline: "离线",
            tooLarge: "过大",
            noOutput: "(无输出)",
            runPlaceholder: "运行示例后，结果会显示在这里。",
            compiling: "正在编译并执行...",
            networkError: "网络错误",
            payloadTooLarge: "代码内容超过 4 KB。"
        }
    };

    const keywordSet = new Set(window.KinalLanguage?.keywords || [
        "Unit", "Get", "Set", "Alias", "Foreach", "In", "default", "By", "Property", "Function", "Return", "If", "Else",
        "ElseIf", "While", "For", "Switch", "Case", "Break", "Continue", "Try", "Catch",
        "Throw", "Class", "Interface", "Struct", "Enum", "Public", "Private", "Protected",
        "Internal", "Static", "Async", "Await", "Virtual", "Override", "Abstract", "Sealed", "Constructor",
        "New", "This", "Base", "Block", "Record", "Jump", "Const", "Var", "Safe",
        "Trusted", "Unsafe", "Is", "Meta", "On", "Keep", "Repeatable", "Delegate", "Extern"
    ]);

    const typeSet = new Set(window.KinalLanguage?.types || [
        "int", "float", "f16", "f32", "f64", "f128",
        "i8", "i16", "i32", "i64",
        "u8", "u16", "u32", "u64",
        "isize", "usize",
        "string", "bool", "char", "void", "any", "byte",
        "dict", "list", "set"
    ]);

    const editorInput = document.getElementById("editor-input");
    const editorHighlight = document.getElementById("editor-highlight");
    const editorLines = document.getElementById("editor-lines");
    const runButton = document.getElementById("run-button");
    const runOutput = document.getElementById("run-output");
    const runStatus = document.getElementById("run-status");
    const sampleLabel = document.getElementById("sample-label");
    const tabHost = document.getElementById("sample-tabs");
    const tabButtons = Array.from(tabHost.querySelectorAll(".tab"));
    const codeMeasureCanvas = document.createElement("canvas");
    const codeMeasureContext = codeMeasureCanvas.getContext("2d");

    let activeSample = initialSampleId;
    const currentLocale = detectLocale();
    const maxCodeSize = 4096;
    const draftKey = "kinal.playground.draft";
    let customCode = null;
    try { customCode = localStorage.getItem(draftKey); } catch (_) {}
    let sampleLoadToken = 0;
    let loadingSample = false;
    let running = false;
    let resultSource = null;

    function syncRunButton() {
        runButton.disabled = running || loadingSample;
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
        runStatus.dataset.state = key;
        if (runStatus.textContent !== textFor(key)) runStatus.textContent = textFor(key);
    }

    function setOutputMessage(key, extraText) {
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
            if (/[\p{L}_]/u.test(ch)) {
                let j = i + 1;
                while (j < code.length && /[\p{L}\p{N}_.]/u.test(code[j])) {
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
                    const prevM = beforeStr.match(/([\p{L}_][\p{L}\p{N}_]*)\s*$/u);
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

    function setActiveTab(id) {
        activeSample = id;
        sampleLabel.textContent = id + ".kn";
        tabButtons.forEach((button) => {
            const selected = button.dataset.sample === id;
            button.classList.toggle("active", selected);
            button.setAttribute("aria-pressed", String(selected));
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

    async function loadSample(id) {
        acHide();
        const token = ++sampleLoadToken;
        loadingSample = true;
        syncRunButton();
        if (!running) setStatus("loading");
        try {
            const source = id === "custom" && customCode !== null ? customCode : await ensureSampleLoaded(id);
            if (token !== sampleLoadToken) return;
            setActiveTab(id);
            editorInput.value = source;
            editorInput.setSelectionRange(0, 0);
            editorInput.scrollTop = 0;
            editorInput.scrollLeft = 0;
            syncEditorVisuals();
            syncEditorScroll();
            if (!running) {
                resultSource = null;
                setStatus("ready");
                setOutputMessage("runPlaceholder");
            }
        } catch (_) {
            if (token === sampleLoadToken && !running) {
                resultSource = null;
                setStatus("offline");
                setOutputMessage("sampleError");
            }
        } finally {
            if (token === sampleLoadToken) {
                loadingSample = false;
                syncRunButton();
            }
        }
    }

    function handleCustomPromotion() {
        ++sampleLoadToken;
        loadingSample = false;
        syncRunButton();
        customCode = editorInput.value;
        setActiveTab("custom");
        try { localStorage.setItem(draftKey, customCode); } catch (_) {}
        if (!running) setStatus(resultSource === null ? "edited" : "previous");
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

    async function pollRunJob(jobId, signal) {
        const stages = { queued: "queued", compiling: "building", running: "running" };
        while (!signal.aborted) {
            const response = await fetch("/api/run/status?id=" + encodeURIComponent(jobId), {
                cache: "no-store", signal
            });
            const parsed = parseJobResponse(await response.text());
            if (response.status !== 202 || !stages[parsed.status]) return parsed;
            setStatus(stages[parsed.status]);
            await delay(250);
        }
        throw new Error("Run timed out");
    }

    async function runCode() {
        if (running || loadingSample) return;
        const code = editorInput.value;

        if (!code.trim()) {
            resultSource = null;
            setStatus("rejected");
            setOutputMessage("empty");
            return;
        }
        if (new TextEncoder().encode(code).length > maxCodeSize) {
            resultSource = null;
            setStatus("tooLarge");
            setOutputMessage("payloadTooLarge");
            return;
        }

        running = true;
        resultSource = code;
        syncRunButton();
        setStatus("queued");
        setOutputMessage("compiling");
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 45000);

        try {
            const response = await fetch("/api/run", {
                method: "POST",
                headers: { "Content-Type": "text/plain; charset=utf-8" },
                body: code,
                signal: controller.signal
            });
            const text = await response.text();
            const final = response.status === 202
                ? await pollRunJob(text.trim(), controller.signal)
                : { status: "rejected", payload: text };
            runOutput.textContent = final.payload ? sanitizeServerText(final.payload) : textFor("noOutput");
            setStatus(editorInput.value !== code ? "previous" : final.status === "completed" ? "completed" : "rejected");
        } catch (error) {
            const timedOut = controller.signal.aborted;
            const message = timedOut ? (currentLocale === "zh-CN" ? "等待执行超时，请重试。" : "The run timed out. Try again.") : error.message;
            setOutputMessage("networkError", message);
            setStatus(editorInput.value === code ? "offline" : "previous");
        } finally {
            window.clearTimeout(timeout);
            running = false;
            syncRunButton();
        }
    }

    tabButtons.forEach((button) => {
        button.textContent = sampleLabelFor(button.dataset.sample);
        button.addEventListener("click", () => loadSample(button.dataset.sample));
    });

    editorInput.addEventListener("input", function (event) {
        syncEditorVisuals();
        syncEditorScroll();
        handleCustomPromotion();
        if (!event.isComposing) requestAutocomplete();
    });

    editorInput.addEventListener("scroll", () => {
        syncEditorScroll();
        if (acVisible()) positionAutocomplete();
    });
    editorInput.addEventListener("compositionstart", acHide);
    editorInput.addEventListener("compositionend", requestAutocomplete);
    editorInput.addEventListener("click", acHide);
    editorInput.addEventListener("keydown", function (event) {
        if (event.isComposing) return;
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            acHide();
            runCode();
            return;
        }
        if ((event.ctrlKey || event.metaKey) && event.code === "Space") {
            event.preventDefault();
            requestAutocomplete(true);
            return;
        }
        if (event.ctrlKey || event.metaKey || event.altKey || (event.shiftKey && event.key === "Tab")) {
            acHide();
            return;
        }
        if (event.key === "Escape") {
            acHide();
            return;
        }
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
            if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                acAccept();
                return;
            }
        }
        if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) acHide();
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
            requestAutocomplete();
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
                return;
            }
        }
    });

    const acMenu = document.getElementById("autocomplete");
    let acItems = [];
    let acIndex = -1;
    let acPrefix = "";
    let acFrame = 0;

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

    function requestAutocomplete(manual = false) {
        cancelAnimationFrame(acFrame);
        acFrame = requestAnimationFrame(() => {
            acFrame = 0;
            updateAutocomplete(manual === true);
        });
    }

    function updateAutocomplete(manual = false) {
        if (document.activeElement !== editorInput || editorInput.selectionStart !== editorInput.selectionEnd) {
            acHide();
            return;
        }
        const { prefix, items: matches, blocked } = window.KinalCompletion.complete(editorInput.value, editorInput.selectionStart);
        if (blocked) { acHide(); return; }
        if (!manual && prefix.length < 1) { acHide(); return; }

        if (matches.length === 0) { acHide(); return; }

        acPrefix = prefix;
        acItems = matches;
        acIndex = 0;

        acMenu.innerHTML = "";
        acItems.forEach(function (item, i) {
            const li = document.createElement("li");
            li.id = "completion-" + i;
            li.setAttribute("role", "option");
            li.setAttribute("aria-selected", String(i === 0));

            const badge = document.createElement("span");
            badge.className = "ac-badge ac-" + item.kind;
            badge.setAttribute("aria-hidden", "true");
            const labels = { keyword: "K", type: "T", module: "M", func: "F", property: "P", field: "P", constant: "C", variable: "V", attribute: "A" };
            badge.textContent = labels[item.kind] || "S";
            li.appendChild(badge);

            const label = document.createElement("span");
            label.className = "ac-content";
            const name = document.createElement("span");
            name.className = "ac-name";
            name.textContent = item.text;
            label.appendChild(name);
            if (item.detail) {
                const detail = document.createElement("span");
                detail.className = "ac-detail";
                detail.textContent = item.detail;
                label.appendChild(detail);
                li.title = item.text + " " + item.detail;
            }
            li.setAttribute("aria-label", item.text);
            li.appendChild(label);

            if (i === 0) li.classList.add("active");
            li.addEventListener("mousedown", function (e) {
                e.preventDefault();
                acIndex = i;
                acAccept();
            });
            acMenu.appendChild(li);
        });

        acShow();
        positionAutocomplete();
    }

    function positionAutocomplete() {
        const coords = getCaretCoords();
        const lineHeight = parseFloat(getComputedStyle(editorInput).lineHeight);
        // Input can scroll to reveal the caret after the input event. Reposition
        // the same menu rather than closing it during that automatic scroll.
        if (coords.top < 0 || coords.top - lineHeight > editorInput.clientHeight) {
            acHide();
            return;
        }
        const gap = 6;
        const belowSpace = editorInput.clientHeight - coords.top - gap;
        const aboveSpace = coords.top - lineHeight - gap;
        acMenu.style.maxHeight = Math.max(0, Math.min(200, Math.max(belowSpace, aboveSpace))) + "px";
        const maxLeft = editorInput.clientWidth - acMenu.offsetWidth - gap;
        const below = coords.top;
        const above = below - acMenu.offsetHeight - lineHeight;
        acMenu.style.top = Math.max(gap, below + acMenu.offsetHeight < editorInput.clientHeight ? below : above) + "px";
        acMenu.style.left = Math.max(gap, Math.min(coords.left, maxLeft)) + "px";
    }

    function acVisible() { return acMenu.classList.contains("ac-show"); }

    function acShow() {
        acMenu.hidden = false;
        acMenu.classList.add("ac-show");
        editorInput.setAttribute("aria-activedescendant", "completion-" + acIndex);
    }

    function acHide() {
        cancelAnimationFrame(acFrame);
        acFrame = 0;
        acMenu.classList.remove("ac-show");
        acMenu.hidden = true;
        acItems = [];
        acIndex = -1;
        editorInput.removeAttribute("aria-activedescendant");
    }

    function acMove(dir) {
        if (acItems.length === 0) return;
        const lis = acMenu.querySelectorAll("li");
        if (lis[acIndex]) {
            lis[acIndex].classList.remove("active");
            lis[acIndex].setAttribute("aria-selected", "false");
        }
        acIndex = (acIndex + dir + acItems.length) % acItems.length;
        lis[acIndex].classList.add("active");
        lis[acIndex].setAttribute("aria-selected", "true");
        editorInput.setAttribute("aria-activedescendant", lis[acIndex].id);
        const option = lis[acIndex];
        if (option.offsetTop < acMenu.scrollTop) acMenu.scrollTop = option.offsetTop;
        else if (option.offsetTop + option.offsetHeight > acMenu.scrollTop + acMenu.clientHeight) {
            acMenu.scrollTop = option.offsetTop + option.offsetHeight - acMenu.clientHeight;
        }
    }

    function acAccept() {
        if (acIndex < 0 || acIndex >= acItems.length) { acHide(); return; }
        const chosen = acItems[acIndex].text;
        const pos = editorInput.selectionStart;
        const before = editorInput.value.slice(0, pos - acPrefix.length);
        const suffixLength = editorInput.value.slice(pos).match(/^[\p{L}\p{N}_]*/u)[0].length;
        const after = editorInput.value.slice(pos + suffixLength);
        editorInput.value = before + chosen + after;
        editorInput.selectionStart = editorInput.selectionEnd = before.length + chosen.length;
        acHide();
        syncEditorVisuals();
        syncEditorScroll();
        handleCustomPromotion();
        editorInput.focus();
    }

    editorInput.addEventListener("blur", acHide);

    runButton.addEventListener("click", runCode);
    const copyCode = document.getElementById("copy-code");
    let copyTimer;
    copyCode.addEventListener("click", async () => {
        window.clearTimeout(copyTimer);
        try {
            await navigator.clipboard.writeText(editorInput.value);
            copyCode.textContent = copyCode.dataset.copied;
        } catch (_) {
            copyCode.textContent = copyCode.dataset.failed;
        }
        copyTimer = window.setTimeout(() => { copyCode.textContent = copyCode.dataset.copy; }, 1700);
    });

    setActiveTab(initialSampleId);
    loadSample(initialSampleId);
    window.addEventListener("resize", () => {
        syncGutterMetrics(editorLines, editorInput);
        syncEditorScroll();
        if (acVisible()) positionAutocomplete();
    });
})();
