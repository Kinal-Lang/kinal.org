"""Generate the browser editor's public API catalog from a Kinal checkout.

Run: python scripts/generate_editor_catalog.py --kinal-root ../Kinal
Commit the generated asset; the production build does not require compiler source.
This indexes declarations, not compiler semantics. Bodies and private APIs are skipped.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


TOKEN = re.compile(r'//[^\n]*|/\*[\s\S]*?\*/|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|[^\W\d]\w*|\d+(?:\.\d+)?|\S', re.UNICODE)
MODIFIERS = set('Public Private Protected Internal Static Safe Trusted Unsafe Virtual Override Abstract Sealed Const Async Extern'.split())


def array_body(source: str, name: str) -> str:
    match = re.search(r'\b' + re.escape(name) + r'\[\]\s*=\s*\{([\s\S]*?)\n\s*\};', source)
    if not match:
        raise ValueError(f'Missing source table: {name}')
    return match[1]


def strings(source: str) -> list[str]:
    return re.findall(r'"([^"\\]*)"', source)


def joined(tokens: list[str]) -> str:
    text = ' '.join(tokens)
    text = re.sub(r'\s*([.\[\]<>*])\s*', r'\1', text)
    text = re.sub(r'\s+([,)])', r'\1', text)
    text = re.sub(r'\(\s+', '(', text)
    # Keep the separator between a pointer/array type and its parameter name.
    return re.sub(r'([\]*])(?=[^\W\d])', r'\1 ', text)


def c_type(value: str) -> str:
    parts = [part.strip() for part in value.split(',')]
    kind = parts[0].removeprefix('TY_').lower()
    if kind == 'class':
        return strings(value)[0]
    if kind == 'array':
        return parts[1].removeprefix('TY_').lower() + '[]'
    if kind == 'ptr':
        return parts[1].removeprefix('TY_').lower() + '*' * max(1, int(parts[3]) if len(parts) > 3 else 1)
    return kind


def generate(root: Path) -> dict:
    symbols: dict[str, dict] = {}
    sources: set[str] = set()

    def read(relative: str) -> str:
        sources.add(relative)
        return (root / relative).read_text(encoding='utf-8-sig')

    def add(name: str, kind: str, **values) -> None:
        if any(part.startswith('__') for part in name.split('.')):
            return
        old = symbols.get(name)
        if old and kind == 'module':
            return
        symbols[name] = {'name': name, 'kind': kind, **values}

    lexer = array_body(read('apps/kinal/src/kn_lexer.c'), 'g_keywords')
    reserved = re.findall(r'\{"(\w+)",\s*(TOK_\w+)\}', lexer)
    literals = [name for name, token in reserved if token in {'TOK_TRUE', 'TOK_FALSE', 'TOK_NULL'}]
    types = [name for name, token in reserved if token.startswith('TOK_TYPE_')]
    keywords = [name for name, _ in reserved if name not in types + literals]
    parser = read('apps/kinal/src/parser/kn_parser_decl.inc')
    keywords += re.findall(r'match_contextual\(p,\s*"(\w+)"\)', parser)
    lsp = read('apps/kinal-lsp/server/src/main.cpp')
    types += [name for name in strings(array_body(lsp, 'type_kws')) if name not in literals]
    attributes = strings(array_body(lsp, 'meta_attrs'))
    attributes += re.findall(r'\{\s*"(\w+)"', array_body(read('apps/kinal/src/sema/kn_sema_validate.inc'), 'g_builtin_metas'))

    std = read('apps/kinal/src/kn_std.c')
    for module in re.findall(r'\{\s*"([^"]+)"', array_body(std, 'g_modules')):
        add(module, 'module')
    builtin = re.compile(r'\{\s*"([^"]+)",\s*"([^"]+)",\s*KN_BUILTIN_\w+,\s*\{([^{}]+)\},\s*(\d+),\s*\{(.*?)\},\s*SAFETY_(\w+)\s*\}')
    for owner, name, ret, count, parameters, safety in builtin.findall(std):
        params = [c_type(value) for value in re.findall(r'\{([^{}]+)\}', parameters)][:int(count)]
        receiver = owner in {'IO.Type.string', 'IO.Type.any', 'IO.Collection.dict', 'IO.Collection.list', 'IO.Collection.set'} and name != 'Create'
        add(owner + '.' + name, 'func', type=c_type(ret), params=params, static=True, receiver=receiver, safety=safety.title())

    # Compiler-injected classes and fields (including DateTime's table of fields).
    injected = read('apps/kinal/src/kn_builtins.c')
    for chunk in re.split(r'static void inject_builtin_', injected)[1:]:
        owner_match = re.search(r'c.name = dup_str\("([^"]+)"\)', chunk)
        if not owner_match:
            continue
        owner = owner_match[1]
        add(owner, 'type')
        for var, name in re.findall(r'(\w+)\.name = dup_str\("([^"]+)"\);', chunk):
            if var == 'c' or not re.search(rf'{var}\.access = ACC_PUBLIC', chunk):
                continue
            field = re.search(rf'{var}\.type = type_(make|ptr|class)\((.*?)\);', chunk)
            if field:
                typ = field[2].strip('"') if field[1] == 'class' else field[2].removeprefix('TY_').lower() + ('*' if field[1] == 'ptr' else '')
                add(owner + '.' + name, 'field', type=typ, static=False)
        if 'const char *names[]' in chunk:
            for name in strings(array_body(chunk, 'names')):
                add(owner + '.' + name, 'field', type='int', static=False)

    # Compile-time constants exposed by the current language server.
    mappings = {'IO.Target':'target_members', 'IO.Host':'target_members', 'IO.Runtime':'runtime_members', 'IO.Runtime.Kind':'runtime_kind_members', 'IO.Version':'version_members', 'IO.Version.VM':'version_vm_members'}
    for owner in ('IO.Target', 'IO.Host'):
        mappings.update({owner + '.OS':'os_members', owner + '.Arch':'arch_members', owner + '.Env':'env_members'})
    for owner, table in mappings.items():
        for name, typ in re.findall(r'\{"(\w+)",\s*"(\w+) ', array_body(lsp, table)):
            add(owner + '.' + name, 'constant', type=typ, static=True)
    block_methods = re.search(r'void add_block_methods\([\s\S]*?static const char \*ms\[\] = \{([^}]+)\}', lsp)
    if block_methods:
        for name in strings(block_methods[1]):
            add('IO.Type.Object.Block.' + name, 'func', static=False, detail='Block')
    type_parser = read('apps/kinal/src/parser/kn_parser_type_expr.inc')
    for name in re.findall(r'kn_strcmp\(qname, "(IO\.Type\.Object\.\w+)"\)', type_parser):
        add(name, 'type')

    # Receiver operations lowered directly by Sema do not all have KnStdFunc entries.
    sema = read('apps/kinal/src/sema/kn_sema_expr.inc')
    common_body = sema.split('static bool sema_try_member_common_builtin(', 1)[1].split('static bool ', 1)[0]
    common_members = []
    for name, body in re.findall(r'kn_strcmp\(e->v.member_call.name, "(\w+)"\) == 0\)([\s\S]*?)return true;', common_body):
        count = int(re.search(r'args.count != (\d+)', body)[1])
        ret = re.search(r'e->type = type_make\((TY_\w+)\)', body)[1]
        common_members.append({'name': name, 'kind': 'func', 'type': c_type(ret), 'params': ['any'] * count})
    array_members = []
    for name, body in re.findall(r'rt->kind == TY_ARRAY && kn_strcmp\(e->v.member_call.name, "(\w+)"\) == 0\)([\s\S]*?)(?=\n    if \(rt->kind|\n    return false;)', sema):
        count = int(re.search(r'args.count != (\d+)', body)[1])
        direct_type = re.search(r'e->type = type_make\((TY_\w+)\)', body)
        ret = c_type(direct_type[1]) if direct_type else '$array' if 'e->type = *rt;' in body else '$element'
        array_members.append({'name': name, 'kind': 'func', 'type': ret, 'params': [] if not count else ['int index' if ret == '$element' else '$element value']})
    string_index = re.search(r'rt->kind == TY_STRING && kn_strcmp\(e->v.member_call.name, "(Index)"\)', sema)
    if string_index:
        add('IO.Type.string.' + string_index[1], 'func', type='char', params=['int index'], static=False)

    for package in sorted((root / 'libs/std').iterdir()):
        if not package.is_dir() or package.name == 'IO.Kinal.Runtime':
            continue
        versions = [path for path in package.iterdir() if (path / 'src').is_dir()]
        if not versions:
            continue
        version = max(versions, key=lambda path: tuple(int(n) for n in re.findall(r'\d+', path.name)))
        for path in sorted((version / 'src').rglob('*.kn')):
            source = read(path.relative_to(root).as_posix())
            toks = [m[0] for m in TOKEN.finditer(source) if not m[0].startswith(('//', '/*'))]
            unit_match = re.search(r'\bUnit\s+([\w.]+)\s*;', source)
            if not unit_match:
                continue
            unit = unit_match[1]
            if any(part.startswith('__') for part in unit.split('.')):
                continue
            add(unit, 'module')

            def parse_scope(start: int, owner: str, member=False, static_owner=False) -> int:
                i = start
                while i < len(toks) and toks[i] != '}':
                    begin = i
                    paren = bracket = 0
                    while i < len(toks):
                        token = toks[i]
                        if token in ('{', ';', '}') and not paren and not bracket:
                            break
                        paren += (token == '(') - (token == ')')
                        bracket += (token == '[') - (token == ']')
                        i += 1
                    if i >= len(toks) or toks[i] == '}':
                        return i + 1
                    header, terminator = toks[begin:i], toks[i]
                    i += 1
                    # Attributes belong to the declaration, but are not its name/type.
                    while header and header[0] == '[':
                        depth, end = 1, 1
                        while end < len(header) and depth:
                            depth += (header[end] == '[') - (header[end] == ']')
                            end += 1
                        header = header[end:]
                    visible = bool(header) and not ({'Private', 'Protected', 'Internal'} & set(header)) and (not member or 'Public' in header)
                    static = not member or static_owner or 'Static' in header
                    decl = next((t for t in header if t in {'Class', 'Struct', 'Interface', 'Enum'}), None)
                    if visible and decl:
                        di = header.index(decl)
                        name = header[di + 1]
                        qualified = owner + '.' + name
                        visible = not name.startswith('__')
                        if visible:
                            base = joined(header[header.index('By') + 1:]) if 'By' in header else ''
                            add(qualified, 'type', detail=decl, **({'base': base, 'unit': unit} if base and decl != 'Enum' else {}))
                            if decl != 'Enum' and terminator == '{':
                                i = parse_scope(i, qualified, True, 'Static' in header)
                                continue
                            if decl == 'Enum' and terminator == '{':
                                enum_end = toks.index('}', i)
                                for item in ' '.join(toks[i:enum_end]).split(','):
                                    enum_name = item.strip().split(' ')[0]
                                    if enum_name:
                                        add(qualified + '.' + enum_name, 'constant', type=qualified, static=True)
                    elif visible and 'Function' in header and '(' in header:
                        fi, pi = header.index('Function'), header.index('(')
                        name = header[pi - 1]
                        ret = joined(header[fi + 1:pi - 1])
                        params = joined(header[pi + 1:header.index(')')])
                        add(owner + '.' + name, 'func', type=ret, params=[p.strip() for p in params.split(',') if p.strip()], static=static, unit=unit)
                    elif visible and member and 'Constructor' not in header:
                        field = [t for t in header if t not in MODIFIERS and t != 'Property']
                        if '=' in field:
                            field = field[:field.index('=')]
                        if len(field) >= 2:
                            add(owner + '.' + field[-1], 'property' if 'Property' in header else 'field', type=joined(field[:-1]), static=static, unit=unit)
                    if terminator == '{':
                        depth = 1
                        while i < len(toks) and depth:
                            depth += (toks[i] == '{') - (toks[i] == '}')
                            i += 1
                return i + 1

            parse_scope(0, unit)

    # Add implicit namespace parents without replacing real types/functions.
    for symbol in list(symbols.values()):
        parts = symbol['name'].split('.')
        for end in range(1, len(parts)):
            add('.'.join(parts[:end]), 'module')
    for symbol in symbols.values():
        for key in ('type', 'base'):
            typ, unit = symbol.get(key), symbol.get('unit', '')
            if typ and unit + '.' + typ in symbols:
                symbol[key] = unit + '.' + typ
        symbol.pop('unit', None)

    version = read('VERSION')
    return {
        'version': re.search(r'kinal\s*=\s*([^\s]+)', version)[1],
        'sources': sorted(sources),
        'keywords': sorted(set(keywords)), 'types': sorted(set(types)),
        'literals': literals, 'attributes': sorted(set(attributes)),
        'metaConstants': [name for name in strings(array_body(lsp, 'kws')) if name.startswith('@')],
        'stringPrefixes': strings(array_body(lsp, 'string_prefixes')),
        'commonMembers': common_members, 'arrayMembers': array_members,
        'symbols': sorted(symbols.values(), key=lambda item: item['name']),
    }


def main() -> None:
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--kinal-root', type=Path, default=Path(__file__).resolve().parents[2] / 'Kinal')
    cli.add_argument('--check', action='store_true', help='Fail if the checked-in catalog differs from source.')
    args = cli.parse_args()
    catalog = generate(args.kinal_root.resolve())
    symbols = catalog.pop('symbols')
    content = '// Generated by scripts/generate_editor_catalog.py; do not edit by hand.\n'
    content += 'window.KinalLanguage = ' + json.dumps(catalog, ensure_ascii=False, indent=2)[:-2] + ',\n  "symbols": [\n'
    content += ',\n'.join('    ' + json.dumps(item, ensure_ascii=False, separators=(',', ':')) for item in symbols)
    content += '\n  ]\n};\n'
    output = Path(__file__).resolve().parents[1] / 'src/web/managed/static/kinal-language.js'
    if args.check:
        if not output.exists() or output.read_text(encoding='utf-8') != content:
            raise SystemExit('Editor catalog is stale; regenerate it from the intended Kinal checkout.')
    else:
        output.write_text(content, encoding='utf-8', newline='\n')
    print(f'Kinal {catalog["version"]}: {len(symbols)} public symbols; {len(catalog["keywords"])} keywords.')


if __name__ == '__main__':
    main()
