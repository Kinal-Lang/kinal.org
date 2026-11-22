// Behavioral checks against the generated source catalog and the browser completion engine.
// Run with: node scripts/test_editor_completion.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const context = vm.createContext({ window: {} });
for (const name of [
  "kinal-language.js",
  "kinal-completion.js",
  "kinal-highlight.js",
]) {
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/web/managed/static", name),
      "utf8",
    ),
    context,
    { filename: name },
  );
}
const {
  KinalLanguage: language,
  KinalCompletion: completion,
  highlightKinal,
} = context.window;
const get = (code) => completion.complete(code, code.length).items;
const names = (code) => get(code).map((item) => item.text);
function includes(code, expected) {
  assert(
    names(code).includes(expected),
    `Missing ${expected} for ${JSON.stringify(code)}`,
  );
}
function excludes(code, rejected) {
  assert(
    !names(code).includes(rejected),
    `Unexpected ${rejected} for ${JSON.stringify(code)}`,
  );
}
for (const word of ["Alias", "Foreach", "In", "Async", "Await", "default"]) {
  includes(word.slice(0, 2), word);
  assert(highlightKinal(word).includes("token-keyword"), word);
}
for (const word of ["true", "false", "null"]) includes(word.slice(0, 2), word);
includes("[Vari", "Variadic");
includes("[LinkLibT", "LinkLibTarget");
includes("[Dep", "Deprecated");
includes("@", "@delegate_function");
includes("Meta Example Keep @r", "@runtime");
includes("IO.Target.", "IO.Target.StaticLibrarySuffix");
includes("IO.Version.VM.", "IO.Version.VM.String");
assert(
  names("IO.Target.").length > 8,
  "Do not truncate the completion catalog at eight items",
);
includes("IO.Json.", "IO.Json.ParseObject");
includes("IO.Request.Method.", "IO.Request.Method.OPTIONS");
includes("IO.UI.", "IO.UI.Window");
includes("IO.Web.", "IO.Web.Server");
includes("IO.Console.Pr", "IO.Console.PrintLine");
includes("Object.", "Object.Package");
excludes("IO.Console.", "IO.Console.Clear");
assert(
  !language.symbols.some(
    (item) =>
      item.name.includes("__") || item.name.startsWith("IO.Kinal.Runtime"),
  ),
);
includes("Get Console By IO.Console;\nConsole.Pr", "Console.PrintLine");
includes("Alias 控制台 By IO.Console;\n控制台.Pr", "控制台.PrintLine");
includes(
  "Alias Json By IO.Json;\nAlias Object By Json.Object;\nObject item;\nitem.",
  "item.Keys",
);
includes("IO.Request.Options options;\noptions.Body", "options.BodyDict");
includes(
  "Var options = New IO.Request.Options();\noptions.",
  "options.TimeoutMs",
);
includes('Var doc = IO.Json.ParseObject("{}");\ndoc.', "doc.ValueOr");
includes(
  "IO.Request.Response response;\nresponse.BodyObject.",
  "response.BodyObject.Keys",
);
includes("IO.UI.Button button;\nbutton.", "button.BackColor");
includes('string 文本 = "";\n文本.', "文本.ToChars");
includes("int count;\ncount.", "count.TypeOf");
includes("string text;\ntext.", "text.Index");
includes("int[2] values;\nvalues.", "values.Length");
assert(
  get("int[2] values;\nvalues.Add").find((item) => item.text === "values.Add")
    .detail === "(int value) → int[3]",
);
includes("list items;\nitems.", "items.Insert");
assert(
  get("list items;\nitems.Add").find((item) => item.text === "items.Add")
    .detail === "(any) → void",
);
excludes("list items;\nitems.", "items.Create");
excludes("IO.Json.Object.", "IO.Json.Object.Data");
excludes("IO.Json.Object doc;\ndoc.", "doc._Data");
includes("Function void Read(IO.Json.Object input) {\n input.", "input.Keys");
assert.deepEqual([...names("Function void A() { list old; }\nold.")], []);
for (const code of ["// IO.Console.", "/* IO.Console.", '"IO.Console.', "'IO."])
  assert.equal(get(code).length, 0);
includes('"closed";\nIO.Con', "IO.Console");
assert(highlightKinal("string 文本;").includes("token-type"));
assert(!highlightKinal('"<img onerror=alert(1)>"').includes("<img"));
console.log(
  `Completion behavior passed with ${language.symbols.length} public symbols from Kinal ${language.version}.`,
);
