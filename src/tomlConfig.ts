import { isDeepStrictEqual } from 'util';
import { parse, stringify } from 'smol-toml';
import { Entry, isRecord } from './mcpConfig';

const TABLE = 'mcp_servers';

/** smol-toml returns tables with a null prototype; copy them (but not dates) into plain objects. */
function plain(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(plain);
    }
    const proto: unknown = typeof value === 'object' && value !== null ? Object.getPrototypeOf(value) : undefined;
    if (proto === null || proto === Object.prototype) {
        return Object.fromEntries(Object.entries(value as Entry).map(([k, v]) => [k, plain(v)]));
    }
    return value;
}

/**
 * Parses config text. Blank text yields undefined. Throws if the text is not valid TOML.
 * `label` is only used in the error message.
 */
export function parseTomlText(text: string | undefined, label = 'MCP config'): Entry | undefined {
    if (text === undefined || text.trim() === '') {
        return undefined;
    }
    try {
        const doc = plain(parse(text)) as Entry;
        if (doc[TABLE] !== undefined && !isRecord(doc[TABLE])) {
            throw new Error(`"${TABLE}" must be a table`);
        }
        return doc;
    } catch (error: unknown) {
        const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
        throw new Error(`Cannot parse ${label}: ${reason}`);
    }
}

/** The existing `[mcp_servers.<name>]` table, only if it is a table. */
export function tomlRawEntry(doc: Entry | undefined, name: string): Entry | undefined {
    const servers = doc?.[TABLE];
    const raw = isRecord(servers) ? servers[name] : undefined;
    return isRecord(raw) ? raw : undefined;
}

/** Splits `a.b."c d"` into its key parts; returns undefined if it is not a plain dotted key. */
function splitKey(key: string): string[] | undefined {
    const parts: string[] = [];
    const part = /\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([A-Za-z0-9_-]+))\s*(?:\.|$)/y;
    let index = 0;
    while (index < key.length) {
        part.lastIndex = index;
        const match = part.exec(key);
        if (!match) {
            return undefined;
        }
        parts.push(match[1] !== undefined ? match[1].replace(/\\(.)/g, '$1') : match[2] ?? match[3]);
        index = part.lastIndex;
    }
    return parts.length > 0 ? parts : undefined;
}

interface Header {
    line: number;
    path: string[] | undefined;
    isArrayTable: boolean;
}

function findHeaders(lines: string[]): Header[] {
    const headers: Header[] = [];
    lines.forEach((text, line) => {
        const match = /^\s*(\[\[?)\s*(.+?)\s*\]\]?\s*(?:#.*)?$/.exec(text);
        if (match) {
            headers.push({ line, path: splitKey(match[2]), isArrayTable: match[1] === '[[' });
        }
    });
    return headers;
}

function isOurs(header: Header, name: string): boolean {
    return !header.isArrayTable && header.path?.[0] === TABLE && header.path[1] === name;
}

/** Index after the last line that belongs to the section, leaving trailing blank and comment lines alone. */
function sectionEnd(lines: string[], from: number, nextHeader: number): number {
    let end = nextHeader;
    while (end > from + 1 && /^\s*(#.*)?$/.test(lines[end - 1])) {
        end--;
    }
    return end;
}

/** Everything in the document except our server entry, to prove an edit left the rest alone. */
function withoutEntry(doc: Entry | undefined, name: string): Entry {
    const { [TABLE]: servers, ...rest } = doc ?? {};
    const { [name]: _ours, ...others } = isRecord(servers) ? servers : {};
    return { ...rest, ...(Object.keys(others).length > 0 ? { [TABLE]: others } : {}) };
}

/** Replaces our `[mcp_servers.<name>]` tables with `entry` (or removes them if `entry` is undefined). */
function spliceEntry(text: string, name: string, entry: Entry | undefined): string {
    // A '\r' stays at the end of its line, so every untouched line keeps its own line ending.
    const cr = text.includes('\r\n') ? '\r' : '';
    const lines = text.split('\n');
    const headers = findHeaders(lines);

    const kept: string[] = [];
    let insertAt: number | undefined;
    let cursor = 0;
    for (let i = 0; i < headers.length; i++) {
        if (!isOurs(headers[i], name)) {
            continue;
        }
        const start = headers[i].line;
        const end = sectionEnd(lines, start, headers[i + 1]?.line ?? lines.length);
        kept.push(...lines.slice(cursor, start));
        insertAt ??= kept.length;
        cursor = end;
    }
    kept.push(...lines.slice(cursor));

    const appended = insertAt === undefined && entry !== undefined;
    if (appended) {
        while (kept.length > 0 && kept[kept.length - 1].trim() === '') {
            kept.pop();
        }
        insertAt = kept.length;
        if (kept.length > 0) {
            kept.push(cr); // blank separator line
        }
    }

    if (entry !== undefined && insertAt !== undefined) {
        const block = stringify({ [TABLE]: { [name]: entry } }).trimEnd().split('\n').map(line => line + cr);
        kept.splice(insertAt, 0, ...block);
        if (appended) {
            kept.push(''); // final line ending
        }
    }

    return kept.join('\n');
}

/** A TOML string literal for `value`. */
function tomlString(value: string): string {
    return stringify({ v: value }).trim().slice('v = '.length);
}

/**
 * Replaces just the value of the `command = "..."` line of our table, so comments, number formats and
 * layout elsewhere stay as they are. Returns undefined if the line is not a simple one-line string.
 */
function patchCommandLine(text: string, name: string, command: string): string | undefined {
    const lines = text.split('\n');
    const headers = findHeaders(lines);
    const index = headers.findIndex(h => !h.isArrayTable && h.path?.length === 2 && h.path[0] === TABLE && h.path[1] === name);
    if (index < 0) {
        return undefined;
    }

    const end = headers[index + 1]?.line ?? lines.length;
    for (let i = headers[index].line + 1; i < end; i++) {
        const match = /^(\s*command\s*=\s*)("(?:[^"\\]|\\.)*"|'[^']*')([\s\S]*)$/.exec(lines[i]);
        if (match && /^\s*(#.*)?$/.test(match[3])) {
            return [...lines.slice(0, i), match[1] + tomlString(command) + match[3], ...lines.slice(i + 1)].join('\n');
        }
    }
    return undefined;
}

const NOT_EDITABLE = 'The TOML config cannot be edited automatically. Define the server as a [mcp_servers.<name>] table or edit the file by hand';

/** Proves that the edited text still parses, holds exactly `expected` for our entry and changed nothing else. */
function checkEdit(before: Entry | undefined, after: string, name: string, expected: Entry | undefined): void {
    let parsed: Entry | undefined;
    try {
        parsed = parseTomlText(after);
    } catch {
        throw new Error(NOT_EDITABLE);
    }
    const entryOk = isDeepStrictEqual(tomlRawEntry(parsed, name), expected);
    const restOk = isDeepStrictEqual(withoutEntry(parsed, name), withoutEntry(before, name));
    if (!entryOk || !restOk) {
        throw new Error(NOT_EDITABLE);
    }
}

/** Returns the new file text with `entry` set as `[mcp_servers.<name>]`. Throws on invalid TOML. */
export function applyServerEntryToml(text: string | undefined, name: string, entry: Entry): string {
    const doc = parseTomlText(text);
    if (text === undefined || doc === undefined) {
        return stringify({ [TABLE]: { [name]: entry } });
    }
    const result = spliceEntry(text, name, entry);
    checkEdit(doc, result, name, entry);
    return result;
}

/** Returns the new file text with only `command` replaced, or undefined if there is nothing to change. */
export function refreshServerCommandToml(text: string | undefined, name: string, command: string): string | undefined {
    const doc = parseTomlText(text);
    const current = tomlRawEntry(doc, name);
    if (text === undefined || !current || current.command === command) {
        return undefined;
    }
    const patched = patchCommandLine(text, name, command);
    if (patched === undefined) {
        throw new Error(NOT_EDITABLE);
    }
    checkEdit(doc, patched, name, { ...current, command });
    return patched;
}

/** Returns the new file text without the entry, or undefined if it does not exist. */
export function removeServerEntryToml(text: string | undefined, name: string): string | undefined {
    const doc = parseTomlText(text);
    if (text === undefined || !tomlRawEntry(doc, name)) {
        return undefined;
    }
    const result = spliceEntry(text, name, undefined);
    checkEdit(doc, result, name, undefined);
    return result;
}
