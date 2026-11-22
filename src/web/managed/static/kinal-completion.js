/* Lightweight source-aware completion for the Playground; no language server required. */
window.KinalCompletion = (() => {
  const catalog = window.KinalLanguage;
  const symbols = new Map(
    catalog.symbols.map((symbol) => [symbol.name, symbol]),
  );
  const members = new Map();
  for (const symbol of symbols.values()) {
    const parent = symbol.name.slice(
      0,
      Math.max(0, symbol.name.lastIndexOf(".")),
    );
    if (!members.has(parent)) members.set(parent, []);
    members.get(parent).push(symbol);
  }
  const identifier = "[\\p{L}_][\\p{L}\\p{N}_]*";
  const path = identifier + "(?:\\." + identifier + ")*";
  const typePattern = path + "(?:\\s*\\[\\d*\\]|\\*)*";
  const primitiveTypes = new Set(catalog.types);
  const rx = (pattern, flags = "gu") => new RegExp(pattern, flags);
  const shortName = (name) => name.slice(name.lastIndexOf(".") + 1);

  // Preserve offsets while excluding comments and quoted text from declaration lookup.
  function mask(source) {
    let result = "",
      blocked = false;
    for (let i = 0; i < source.length; ) {
      const start = i;
      const quote = source[i];
      if (quote === '"' || quote === "'") {
        i++;
        let closed = false;
        while (i < source.length) {
          if (source[i] === "\\") i += Math.min(2, source.length - i);
          else if (source[i++] === quote) {
            closed = true;
            break;
          }
        }
        blocked = !closed;
      } else if (source.startsWith("//", i) && source[i - 1] !== "<") {
        const end = source.indexOf("\n", i);
        i = end < 0 ? source.length : end;
        blocked = end < 0;
      } else if (source.startsWith("/*", i)) {
        const end = source.indexOf("*/", i + 2);
        i = end < 0 ? source.length : end + 2;
        blocked = end < 0;
      } else {
        result += source[i++];
        blocked = false;
        continue;
      }
      result += source.slice(start, i).replace(/[^\n]/g, " ");
    }
    return { code: result, blocked };
  }

  function context(source, position) {
    const before = source.slice(0, position);
    const { code, blocked } = mask(before);
    const prefix = code.match(/@?[\p{L}_][\p{L}\p{N}_.]*$|@$/u)?.[0] || "";
    return { before, code, prefix, blocked };
  }

  function scopeData(code) {
    const aliases = new Map([["Object", "IO.Type.Object"]]);
    for (const match of code.matchAll(
      rx("(?:Get|Alias)\\s+(" + identifier + ")\\s+By\\s+(" + path + ")\\s*;"),
    )) {
      aliases.set(match[1], match[2]);
    }
    function resolve(name) {
      let value = name.replace(/\s/g, "");
      const visited = new Set();
      while (aliases.has(value.split(".")[0]) && !visited.has(value)) {
        visited.add(value);
        const [first, ...rest] = value.split(".");
        value = [aliases.get(first), ...rest].join(".");
      }
      return value;
    }
    const scopes = [],
      closed = [];
    for (let i = 0; i < code.length; i++) {
      if (code[i] === "{") scopes.push(i);
      if (code[i] === "}" && scopes.length) closed.push([scopes.pop(), i]);
    }
    const visible = (offset) =>
      !closed.some(([start, end]) => start < offset && offset < end);
    const locals = new Map();
    const decl = rx(
      "(" + typePattern + ")\\s+(" + identifier + ")\\s*(?=[=;])",
    );
    for (const match of code.matchAll(decl)) {
      if (!visible(match.index)) continue;
      const typ = resolve(match[1]);
      const element = typ.replace(/\[\d*\]|\*/g, "");
      if (
        primitiveTypes.has(element) ||
        symbols.get(element)?.kind === "type"
      ) {
        locals.set(match[2], { name: match[2], kind: "variable", type: typ });
      }
    }
    // Only infer constructors and catalogued return types; don't guess arbitrary expressions.
    for (const match of code.matchAll(
      rx("Var\\s+(" + identifier + ")\\s*=\\s*(New\\s+)?(" + path + ")\\s*\\("),
    )) {
      if (!visible(match.index)) continue;
      const target = resolve(match[3]);
      const typ = match[2] ? target : symbols.get(target)?.type;
      if (typ)
        locals.set(match[1], { name: match[1], kind: "variable", type: typ });
    }
    // Parameters are visible in the function whose body contains the caret.
    for (const match of code.matchAll(
      rx(
        "Function\\s+(" +
          typePattern +
          ")\\s+(" +
          identifier +
          ")\\s*\\(([^()]*)\\)\\s*\\{",
      ),
    )) {
      const open = match.index + match[0].lastIndexOf("{");
      if (!scopes.includes(open)) continue;
      for (const param of match[3].split(",")) {
        const value = param
          .trim()
          .match(rx("^(" + typePattern + ")\\s+(" + identifier + ")", "u"));
        if (value)
          locals.set(value[2], {
            name: value[2],
            kind: "variable",
            type: resolve(value[1]),
          });
      }
    }
    return { aliases, resolve, locals };
  }

  function receiverType(type) {
    if (type === "string" || type === "any") return "IO.Type." + type;
    if (["list", "dict", "set"].includes(type)) return "IO.Collection." + type;
    return type;
  }

  function children(owner, instance, seen = new Set()) {
    if (seen.has(owner)) return [];
    seen.add(owner);
    const own = (members.get(owner) || []).filter((item) =>
      instance ? item.static === false || item.receiver : item.static !== false,
    );
    const base = symbols.get(owner)?.base;
    return base
      ? [
          ...own,
          ...children(base, instance, seen).filter(
            (item) =>
              !own.some(
                (ownItem) => shortName(ownItem.name) === shortName(item.name),
              ),
          ),
        ]
      : own;
  }

  function detail(symbol, instance) {
    if (symbol.params) {
      const params =
        instance && symbol.receiver ? symbol.params.slice(1) : symbol.params;
      return "(" + params.join(", ") + ") → " + symbol.type;
    }
    return symbol.type || symbol.detail || "";
  }

  function complete(source, position) {
    const state = context(source, position);
    if (state.blocked) return { ...state, items: [] };
    const { prefix, code } = state;
    const lower = prefix.toLowerCase();
    const scope = scopeData(code);
    let candidates = [];
    const candidate = (name, kind, description = "") => ({
      text: name,
      kind,
      detail: description,
    });
    if (prefix.startsWith("@")) {
      candidates = catalog.metaConstants.map((name) =>
        candidate(name, "constant"),
      );
    } else if (/\[\s*[\p{L}\p{N}_]*$/u.test(code)) {
      candidates = [
        ...catalog.attributes.map((name) => candidate(name, "attribute")),
        ...catalog.stringPrefixes.map((name) => candidate(name, "keyword")),
        ...catalog.types.map((name) => candidate(name, "type")),
      ];
    } else if (prefix.includes(".")) {
      const dot = prefix.lastIndexOf(".");
      const base = prefix.slice(0, dot),
        parts = base.split(".");
      const local = scope.locals.get(parts[0]);
      let owner = scope.resolve(base),
        instance = false;
      if (local) {
        instance = true;
        owner = receiverType(local.type);
        for (const part of parts.slice(1)) {
          const field = children(owner, true).find(
            (item) => shortName(item.name) === part,
          );
          owner = receiverType(field?.type || "");
        }
      }
      let options = children(owner, instance);
      if (instance && owner) {
        if (/\[\d*\]$/.test(owner)) {
          const element = owner.replace(/\[\d*\]$/, "");
          const expanded = owner.replace(
            /\[(\d+)\]$/,
            (_, size) => "[" + (Number(size) + 1) + "]",
          );
          options.push(
            ...catalog.arrayMembers.map((symbol) => ({
              ...symbol,
              type: symbol.type
                .replace("$array", expanded)
                .replace("$element", element),
              params: symbol.params.map((param) =>
                param.replace("$element", element),
              ),
            })),
          );
        }
        options.push(
          ...catalog.commonMembers.filter(
            (symbol) =>
              !options.some((item) => shortName(item.name) === symbol.name),
          ),
        );
      }
      candidates = options.map((symbol) =>
        candidate(
          base + "." + shortName(symbol.name),
          symbol.kind,
          detail(symbol, instance),
        ),
      );
    } else {
      candidates = [
        ...catalog.keywords.map((name) => candidate(name, "keyword")),
        ...catalog.types.map((name) => candidate(name, "type")),
        ...catalog.literals.map((name) => candidate(name, "constant")),
        ...(members.get("") || []).map((symbol) =>
          candidate(symbol.name, symbol.kind),
        ),
        ...[...scope.aliases].map(([name, target]) =>
          candidate(
            name,
            symbols.get(scope.resolve(target))?.kind || "module",
            target,
          ),
        ),
        ...[...scope.locals.values()].map((symbol) =>
          candidate(symbol.name, symbol.kind, symbol.type),
        ),
      ];
    }
    const unique = new Map();
    for (const item of candidates) {
      if (item.text.toLowerCase().startsWith(lower) && !unique.has(item.text))
        unique.set(item.text, item);
    }
    const items = [...unique.values()].sort((a, b) => {
      const exact = (a.text === prefix ? -1 : 0) - (b.text === prefix ? -1 : 0);
      return exact || a.text.localeCompare(b.text, "en");
    });
    return { ...state, items };
  }

  return { complete };
})();
