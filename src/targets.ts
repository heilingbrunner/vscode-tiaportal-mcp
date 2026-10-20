import * as path from 'path';
import {
    Entry,
    EntryFormat,
    PLAIN_FORMAT,
    SERVER_NAME,
    STDIO_FORMAT,
    ServersKey,
    applyServerEntry,
    parseConfigText,
    rawEntry,
    refreshServerCommandText,
    removeServerEntryText
} from './mcpConfig';
import {
    applyServerEntryToml,
    parseTomlText,
    refreshServerCommandToml,
    removeServerEntryToml,
    tomlRawEntry
} from './tomlConfig';

/**
 * An MCP client whose project-scoped config file the extension can edit.
 * All text functions work on the file content (undefined if the file does not exist) and
 * return the new content; none of them touches the disk.
 */
export interface McpTarget {
    id: string;
    label: string;
    /** Config file location relative to the workspace folder, for display. */
    relativePath: string[];
    /** Absolute path of the config file for a workspace folder. */
    configPath(workspaceFolder: string): string;
    /** Whether the file already has our server entry. Throws if the file is invalid. */
    hasEntry(text: string | undefined): boolean;
    /** Arguments of the existing server entry, if any. Throws if the file is invalid. */
    existingArgs(text: string | undefined): string[] | undefined;
    /** Adds or replaces the server entry. Throws if the file is invalid or has an unexpected shape. */
    upsert(text: string | undefined, command: string, args: string[]): string;
    /** Replaces only the executable of an existing entry; undefined if there is nothing to change. */
    refresh(text: string | undefined, command: string): string | undefined;
    /** Removes the server entry; undefined if it does not exist. */
    remove(text: string | undefined): string | undefined;
}

interface JsonTargetOptions {
    id: string;
    label: string;
    relativePath: string[];
    key: ServersKey;
    format: EntryFormat;
}

function jsonTarget(o: JsonTargetOptions): McpTarget {
    return {
        id: o.id,
        label: o.label,
        relativePath: o.relativePath,
        configPath: ws => path.join(ws, ...o.relativePath),
        hasEntry: text => rawEntry(parseConfigText(text), SERVER_NAME, o.key) !== undefined,
        existingArgs: text => {
            const entry = rawEntry(parseConfigText(text), SERVER_NAME, o.key);
            return entry && o.format.argsOf(entry);
        },
        upsert: (text, command, args) => {
            const previous = rawEntry(parseConfigText(text), SERVER_NAME, o.key);
            return applyServerEntry(text, SERVER_NAME, o.format.build(command, args, previous), o.key);
        },
        refresh: (text, command) => refreshServerCommandText(text, SERVER_NAME, command, o.key, o.format),
        remove: text => removeServerEntryText(text, SERVER_NAME, o.key)
    };
}

/** `[mcp_servers.<name>]` with `command`, `args` and an optional `env` table. */
const CODEX_ENTRY = {
    build: (command: string, args: string[], previous: Entry | undefined): Entry => ({ ...previous, command, args }),
    argsOf: (entry: Entry): string[] | undefined =>
        Array.isArray(entry.args) && entry.args.every(a => typeof a === 'string') ? (entry.args as string[]) : undefined
};

const COPILOT_TARGET = jsonTarget({
    id: 'copilot',
    label: 'GitHub Copilot',
    relativePath: ['.vscode', 'mcp.json'],
    key: 'servers',
    format: STDIO_FORMAT
});

const CLAUDE_TARGET = jsonTarget({
    id: 'claude',
    label: 'Anthropic Claude',
    relativePath: ['.mcp.json'],
    key: 'mcpServers',
    format: STDIO_FORMAT
});

const CURSOR_TARGET = jsonTarget({
    id: 'cursor',
    label: 'Cursor',
    relativePath: ['.cursor', 'mcp.json'],
    key: 'mcpServers',
    format: PLAIN_FORMAT
});

const CODEX_TARGET: McpTarget = {
    id: 'codex',
    label: 'OpenAI Codex',
    relativePath: ['.codex', 'config.toml'],
    configPath: ws => path.join(ws, '.codex', 'config.toml'),
    hasEntry: text => tomlRawEntry(parseTomlText(text), SERVER_NAME) !== undefined,
    existingArgs: text => {
        const entry = tomlRawEntry(parseTomlText(text), SERVER_NAME);
        return entry && CODEX_ENTRY.argsOf(entry);
    },
    upsert: (text, command, args) => {
        const previous = tomlRawEntry(parseTomlText(text), SERVER_NAME);
        return applyServerEntryToml(text, SERVER_NAME, CODEX_ENTRY.build(command, args, previous));
    },
    refresh: (text, command) => refreshServerCommandToml(text, SERVER_NAME, command),
    remove: text => removeServerEntryToml(text, SERVER_NAME)
};

export { COPILOT_TARGET, CLAUDE_TARGET };

/** Every supported client, in the order the picker shows them. All of them run in VS Code or a VS Code fork. */
export const ALL_TARGETS: McpTarget[] = [
    COPILOT_TARGET,
    CLAUDE_TARGET,
    CURSOR_TARGET,
    CODEX_TARGET
];
