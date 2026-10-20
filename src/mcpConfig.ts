import * as fs from 'fs';
import { isDeepStrictEqual } from 'util';
import { ParseError, applyEdits, modify, parse, printParseErrorCode } from 'jsonc-parser';

export const SERVER_NAME = 'vscode-tiaportal-mcp';

export interface TiaServerArgs {
    tiaMajorVersion: string;
    projectPath: string;
    softwarePath: string;
    exportPath: string;
    preservePath: boolean;
}

/** One server entry as it appears in a config file. */
export type Entry = Record<string, unknown>;

/** Top-level key holding the servers, e.g. `servers`, `mcpServers`, `mcp` or `context_servers`. */
export type ServersKey = string;

const OPTION_KEYS: { [option: string]: keyof Omit<TiaServerArgs, 'preservePath'> } = {
    '--tia-major-version': 'tiaMajorVersion',
    '--project-path': 'projectPath',
    '--software-path': 'softwarePath',
    '--export-path': 'exportPath'
};

const PRESERVE_PATH_OPTION = '--preserve-path';

export function buildArgs(a: TiaServerArgs): string[] {
    return [
        '--tia-major-version', a.tiaMajorVersion,
        '--project-path', a.projectPath,
        '--software-path', a.softwarePath,
        '--export-path', a.exportPath,
        ...(a.preservePath ? [PRESERVE_PATH_OPTION] : [])
    ];
}

/** Parses args written by `buildArgs`; returns only what is present. */
export function parseArgs(args: readonly string[]): Partial<TiaServerArgs> {
    const result: Partial<TiaServerArgs> = {};

    for (let i = 0; i < args.length; i++) {
        const option = args[i];
        const key = Object.hasOwn(OPTION_KEYS, option) ? OPTION_KEYS[option] : undefined;
        if (key && i + 1 < args.length && !args[i + 1].startsWith('--')) {
            result[key] = args[++i];
        } else if (option === PRESERVE_PATH_OPTION) {
            result.preservePath = true;
        }
    }

    // A parsed config always has an explicit preserve flag once any other arg is known.
    if (Object.keys(result).length > 0 && result.preservePath === undefined) {
        result.preservePath = false;
    }

    return result;
}

export function isRecord(value: unknown): value is Entry {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | undefined {
    return Array.isArray(value) && value.every(v => typeof v === 'string') ? (value as string[]) : undefined;
}

function stringRecord(value: unknown): Record<string, string> | undefined {
    return isRecord(value) && Object.values(value).every(v => typeof v === 'string')
        ? (value as Record<string, string>)
        : undefined;
}

export function serversOf(config: unknown, key: ServersKey): Record<string, unknown> {
    return isRecord(config) && isRecord(config[key]) ? (config[key] as Record<string, unknown>) : {};
}

/** The existing entry for `name`, only if it is an object. */
export function rawEntry(config: unknown, name: string, key: ServersKey): Entry | undefined {
    const raw = serversOf(config, key)[name];
    return isRecord(raw) ? raw : undefined;
}

// --- Entry shapes: every client spells a stdio server a little differently ---

export interface EntryFormat {
    /** Builds the entry. Fields of `previous` that are not managed here are kept. */
    build(command: string, args: string[], previous: Entry | undefined): Entry;
    /** The arguments of an existing entry, if it has the expected shape. */
    argsOf(entry: Entry): string[] | undefined;
    /** The executable of an existing entry. */
    commandOf(entry: Entry): string | undefined;
    /** Location of the executable inside an entry, for in-place edits. */
    commandPath: (string | number)[];
}

/** `{ type: "stdio", command, args, env }`: VS Code (GitHub Copilot) and Claude. */
export const STDIO_FORMAT: EntryFormat = {
    build: (command, args, previous) => ({
        ...previous,
        type: 'stdio',
        command,
        args,
        env: stringRecord(previous?.env) ?? {}
    }),
    argsOf: entry => stringArray(entry.args),
    commandOf: entry => (typeof entry.command === 'string' ? entry.command : undefined),
    commandPath: ['command']
};

/** `{ command, args, env }`: Cursor. */
export const PLAIN_FORMAT: EntryFormat = {
    build: (command, args, previous) => ({
        ...previous,
        command,
        args,
        env: stringRecord(previous?.env) ?? {}
    }),
    argsOf: STDIO_FORMAT.argsOf,
    commandOf: STDIO_FORMAT.commandOf,
    commandPath: ['command']
};

/**
 * Returns a new config with `entry` set under `name`; other servers and top-level keys are kept.
 * Throws if the existing content has an unexpected shape, so it is never silently discarded.
 */
export function mergeServerEntry(existing: unknown, name: string, entry: Entry, key: ServersKey): Entry {
    if (existing !== undefined && !isRecord(existing)) {
        throw new Error('The MCP config file must contain a JSON object.');
    }
    if (existing?.[key] !== undefined && !isRecord(existing[key])) {
        throw new Error(`"${key}" in the MCP config file must be an object.`);
    }
    return {
        ...existing,
        [key]: { ...serversOf(existing, key), [name]: entry }
    };
}

/** Replaces the `${workspaceFolder}` placeholder, for clients that do not expand it. */
export function resolveWorkspaceFolder(value: string, workspaceFolder: string): string {
    return value.split('${workspaceFolder}').join(workspaceFolder);
}

// --- Reading and editing the config file text (JSONC: comments and trailing commas are allowed) ---

/**
 * Parses config text. Blank text yields undefined. Throws if the text is not valid JSONC.
 * `label` is only used in the error message.
 */
export function parseConfigText(text: string | undefined, label = 'MCP config'): unknown {
    if (text === undefined || text.trim() === '') {
        return undefined;
    }
    const errors: ParseError[] = [];
    const value: unknown = parse(text, errors, { allowTrailingComma: true });
    if (errors.length > 0) {
        const first = errors[0];
        throw new Error(`Cannot parse ${label}: ${printParseErrorCode(first.error)} at offset ${first.offset}`);
    }
    return value;
}

/** Reads a file as text without a leading BOM. Returns undefined if the file does not exist. */
export function readTextFile(filePath: string): string | undefined {
    if (!fs.existsSync(filePath)) {
        return undefined;
    }
    return fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
}

/** Reads and parses a JSONC file. Returns undefined if missing or blank; throws (without touching the file) if invalid. */
export function readJsonFile(filePath: string): unknown {
    return parseConfigText(readTextFile(filePath), filePath);
}

function editOptions(text: string) {
    return { formattingOptions: { insertSpaces: true, tabSize: 2, eol: text.includes('\r\n') ? '\r\n' : '\n' } };
}

const NOT_EDITABLE =
    'The config file cannot be edited automatically (for example because of a trailing comma next to the entry). Edit the file by hand';

/** Immutable `doc[path] = value`. */
function withValueAt(doc: unknown, path: (string | number)[], value: unknown): unknown {
    if (path.length === 0) {
        return value;
    }
    const [head, ...rest] = path;
    if (Array.isArray(doc)) {
        return doc.map((item, index) => (index === head ? withValueAt(item, rest, value) : item));
    }
    const record = isRecord(doc) ? doc : {};
    return { ...record, [head]: withValueAt(record[head], rest, value) };
}

/** Proves that edited text still parses and holds exactly the expected document; returns the text. */
function verifyEdit(newText: string, expected: unknown): string {
    let actual: unknown;
    try {
        actual = parseConfigText(newText);
    } catch {
        throw new Error(NOT_EDITABLE);
    }
    if (!isDeepStrictEqual(actual, expected)) {
        throw new Error(NOT_EDITABLE);
    }
    return newText;
}

/**
 * Returns the new file text with `entry` set under `name`. Comments and formatting elsewhere in
 * the file are preserved. Throws on invalid JSONC or an unexpected shape.
 */
export function applyServerEntry(text: string | undefined, name: string, entry: Entry, key: ServersKey): string {
    const existing = parseConfigText(text);
    const merged = mergeServerEntry(existing, name, entry, key); // validates the shape
    if (text === undefined || existing === undefined) {
        return JSON.stringify(merged, null, 2);
    }
    return verifyEdit(applyEdits(text, modify(text, [key, name], entry, editOptions(text))), merged);
}

/** Returns the new file text with only the executable replaced, or undefined if there is nothing to change. */
export function refreshServerCommandText(
    text: string | undefined,
    name: string,
    command: string,
    key: ServersKey,
    format: EntryFormat
): string | undefined {
    const existing = parseConfigText(text);
    const current = rawEntry(existing, name, key);
    if (text === undefined || !current || format.commandOf(current) === command) {
        return undefined;
    }
    const path = [key, name, ...format.commandPath];
    return verifyEdit(applyEdits(text, modify(text, path, command, editOptions(text))), withValueAt(existing, path, command));
}

/** Returns the new file text without the entry, or undefined if it does not exist. */
export function removeServerEntryText(text: string | undefined, name: string, key: ServersKey): string | undefined {
    const existing = parseConfigText(text);
    const servers = serversOf(existing, key);
    if (text === undefined || !Object.hasOwn(servers, name)) {
        return undefined;
    }
    const remaining = Object.fromEntries(Object.entries(servers).filter(([serverName]) => serverName !== name));
    return verifyEdit(
        applyEdits(text, modify(text, [key, name], undefined, editOptions(text))),
        withValueAt(existing, [key], remaining)
    );
}
