/**
 * kinal-highlight.js
 * Standalone Kinal syntax highlighter extracted from app.js.
 * Produces the same token-* span classes as the homepage Playground,
 * ensuring docs pages and the home page share identical coloring.
 *
 * Usage:
 *   const html = window.highlightKinal(rawCodeString);
 *   element.innerHTML = html;
 */
window.highlightKinal = (function () {
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

    const declNameSet = new Set(["Unit", "Class", "Interface", "Struct", "Enum", "Record", "New", "Get", "Meta", "Delegate"]);

    function escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function classify(token) {
        if (token.startsWith("//") || token.startsWith("/*")) return "token-comment";
        if (token.startsWith('"')) return "token-string";
        if (token.startsWith("'")) return "token-char";
        if (/^\d+(\.\d+)?$/.test(token)) return "token-number";
        if (token === "true" || token === "false" || token === "null") return "token-boolean";
        if (keywordSet.has(token)) return "token-keyword";
        if (typeSet.has(token)) return "token-type";
        return "";
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
                    if (code[j] === "\\" && j + 1 < code.length) { j += 2; continue; }
                    if (code[j] === '"') { j++; break; }
                    j++;
                }
                result += '<span class="token-string">' + escapeHtml(code.slice(i, j)) + '</span>';
                i = j;
                continue;
            }

            // ===== Char =====
            if (ch === "'") {
                let j = i + 1;
                while (j < code.length) {
                    if (code[j] === "\\" && j + 1 < code.length) { j += 2; continue; }
                    if (code[j] === "'") { j++; break; }
                    j++;
                }
                result += '<span class="token-char">' + escapeHtml(code.slice(i, j)) + '</span>';
                i = j;
                continue;
            }

            // ===== Block comment =====
            if (ch === "/" && code[i + 1] === "*") {
                let j = i + 2;
                while (j < code.length && !(code[j] === "*" && code[j + 1] === "/")) j++;
                if (j < code.length) j += 2;
                result += '<span class="token-comment">' + escapeHtml(code.slice(i, j)) + '</span>';
                i = j;
                continue;
            }

            // ===== Line comment (avoid <//>  conflict with code blocks) =====
            if (ch === "/" && code[i + 1] === "/" && code[i + 2] !== ">") {
                let j = i + 2;
                while (j < code.length && code[j] !== "\n") j++;
                result += '<span class="token-comment">' + escapeHtml(code.slice(i, j)) + '</span>';
                i = j;
                continue;
            }

            // ===== Number =====
            if (/[0-9]/.test(ch)) {
                let j = i + 1;
                while (j < code.length && /[0-9.]/.test(code[j])) j++;
                result += '<span class="token-number">' + escapeHtml(code.slice(i, j)) + '</span>';
                i = j;
                continue;
            }

            // ===== Identifier / dotted path =====
            if (/[A-Za-z_]/.test(ch)) {
                let j = i + 1;
                while (j < code.length && /[A-Za-z0-9_.]/.test(code[j])) j++;

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

    return highlightKinal;
})();
