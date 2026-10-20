import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    Entry,
    PLAIN_FORMAT,
    SERVER_NAME,
    STDIO_FORMAT,
    TiaServerArgs,
    applyServerEntry,
    buildArgs,
    mergeServerEntry,
    parseArgs,
    parseConfigText,
    rawEntry,
    readJsonFile,
    refreshServerCommandText,
    removeServerEntryText,
    resolveWorkspaceFolder
} from '../mcpConfig';

const sample: TiaServerArgs = {
    tiaMajorVersion: '21',
    projectPath: 'D:\\Siemens\\Sessions\\Proj\\Proj.als21',
    softwarePath: 'PC-System_1/Software PLC_1',
    exportPath: '${workspaceFolder}\\Sources',
    preservePath: true
};

const entry: Entry = { type: 'stdio', command: 'a.exe', args: ['--x'], env: {} };

describe('buildArgs', () => {
    it('builds all args including --preserve-path', () => {
        assert.deepStrictEqual(buildArgs(sample), [
            '--tia-major-version', '21',
            '--project-path', 'D:\\Siemens\\Sessions\\Proj\\Proj.als21',
            '--software-path', 'PC-System_1/Software PLC_1',
            '--export-path', '${workspaceFolder}\\Sources',
            '--preserve-path'
        ]);
    });

    it('omits --preserve-path when false', () => {
        const args = buildArgs({ ...sample, preservePath: false });
        assert.ok(!args.includes('--preserve-path'));
        assert.strictEqual(args.length, 8);
    });
});

describe('parseArgs', () => {
    it('round-trips buildArgs', () => {
        assert.deepStrictEqual(parseArgs(buildArgs(sample)), sample);
    });

    it('detects absent --preserve-path as false', () => {
        const parsed = parseArgs(buildArgs({ ...sample, preservePath: false }));
        assert.strictEqual(parsed.preservePath, false);
    });

    it('returns empty object for no args', () => {
        assert.deepStrictEqual(parseArgs([]), {});
    });

    it('ignores unknown args and a trailing option without value', () => {
        const parsed = parseArgs(['--unknown', 'x', '--tia-major-version']);
        assert.deepStrictEqual(parsed, {});
    });

    it('ignores inherited object keys such as constructor', () => {
        assert.deepStrictEqual(parseArgs(['constructor', 'x', 'toString', 'y']), {});
    });

    it('does not take the next option as a value', () => {
        const parsed = parseArgs(['--project-path', '--preserve-path']);
        assert.strictEqual(parsed.projectPath, undefined);
        assert.strictEqual(parsed.preservePath, true);
    });
});

describe('entry formats', () => {
    const args = ['--a', 'b'];

    it('STDIO_FORMAT writes type, command, args and env and keeps unknown fields', () => {
        assert.deepStrictEqual(STDIO_FORMAT.build('x.exe', args, undefined), { type: 'stdio', command: 'x.exe', args, env: {} });
        const built = STDIO_FORMAT.build('x.exe', args, { command: 'old', args: [], env: { K: 'v' }, envFile: 'f' });
        assert.deepStrictEqual(built, { command: 'x.exe', args, env: { K: 'v' }, envFile: 'f', type: 'stdio' });
    });

    it('PLAIN_FORMAT has no type field', () => {
        assert.deepStrictEqual(PLAIN_FORMAT.build('x.exe', args, undefined), { command: 'x.exe', args, env: {} });
    });

    it('drops env of an unexpected shape', () => {
        assert.deepStrictEqual(STDIO_FORMAT.build('x', [], { env: [1] }).env, {});
        assert.deepStrictEqual(STDIO_FORMAT.build('x', [], { env: { K: 1 } }).env, {});
    });

    it('reads args and command back', () => {
        const stdio = STDIO_FORMAT.build('x.exe', args, undefined);
        assert.deepStrictEqual(STDIO_FORMAT.argsOf(stdio), args);
        assert.strictEqual(STDIO_FORMAT.commandOf(stdio), 'x.exe');
        const plain = PLAIN_FORMAT.build('x.exe', args, undefined);
        assert.deepStrictEqual(PLAIN_FORMAT.argsOf(plain), args);
        assert.strictEqual(PLAIN_FORMAT.commandOf(plain), 'x.exe');
    });

    it('returns undefined for args or command of an unexpected shape', () => {
        assert.strictEqual(STDIO_FORMAT.argsOf({ args: 'oops' }), undefined);
        assert.strictEqual(STDIO_FORMAT.argsOf({ args: ['x', 1] }), undefined);
        assert.strictEqual(STDIO_FORMAT.commandOf({ command: 5 }), undefined);
        assert.strictEqual(STDIO_FORMAT.commandOf({ command: ['x.exe'] }), undefined);
    });
});

describe('rawEntry', () => {
    it('returns only object entries', () => {
        assert.deepStrictEqual(rawEntry({ servers: { [SERVER_NAME]: { command: 'a' } } }, SERVER_NAME, 'servers'), { command: 'a' });
        assert.strictEqual(rawEntry({ servers: { [SERVER_NAME]: 'junk' } }, SERVER_NAME, 'servers'), undefined);
        assert.strictEqual(rawEntry({ servers: { [SERVER_NAME]: null } }, SERVER_NAME, 'servers'), undefined);
        assert.strictEqual(rawEntry(undefined, SERVER_NAME, 'servers'), undefined);
    });

    it('reads the given key', () => {
        assert.deepStrictEqual(rawEntry({ mcp: { [SERVER_NAME]: { command: ['a'] } } }, SERVER_NAME, 'mcp'), { command: ['a'] });
        assert.strictEqual(rawEntry({ mcp: { [SERVER_NAME]: {} } }, SERVER_NAME, 'servers'), undefined);
    });
});

describe('mergeServerEntry', () => {
    it('creates the key when config is undefined', () => {
        assert.deepStrictEqual(mergeServerEntry(undefined, SERVER_NAME, entry, 'servers'), { servers: { [SERVER_NAME]: entry } });
    });

    it('preserves other servers and top-level keys', () => {
        const existing = { inputs: [{ id: 'k' }], servers: { other: { command: 'o.exe', args: [] } } };
        const merged = mergeServerEntry(existing, SERVER_NAME, entry, 'servers') as Record<string, Record<string, unknown>>;
        assert.deepStrictEqual(merged.servers.other, existing.servers.other);
        assert.deepStrictEqual(merged.servers[SERVER_NAME], entry);
        assert.deepStrictEqual(merged.inputs, existing.inputs);
    });

    it('does not mutate the input', () => {
        const existing = { servers: { other: { command: 'o.exe', args: [] } } };
        const snapshot = JSON.stringify(existing);
        mergeServerEntry(existing, SERVER_NAME, entry, 'servers');
        assert.strictEqual(JSON.stringify(existing), snapshot);
    });

    it('throws instead of discarding a non-object config', () => {
        assert.throws(() => mergeServerEntry('junk', SERVER_NAME, entry, 'servers'), /JSON object/);
        assert.throws(() => mergeServerEntry([], SERVER_NAME, entry, 'servers'), /JSON object/);
    });

    it('throws instead of discarding a non-object servers value', () => {
        assert.throws(() => mergeServerEntry({ servers: [] }, SERVER_NAME, entry, 'servers'), /servers/);
        assert.throws(() => mergeServerEntry({ mcp: 'x' }, SERVER_NAME, entry, 'mcp'), /mcp/);
    });

    it('writes under another key and leaves a servers key alone', () => {
        const existing = { servers: { copilot: { command: 'c.exe', args: [] } } };
        const merged = mergeServerEntry(existing, SERVER_NAME, entry, 'mcpServers') as Record<string, unknown>;
        assert.deepStrictEqual(merged.mcpServers, { [SERVER_NAME]: entry });
        assert.deepStrictEqual(merged.servers, existing.servers);
    });
});

describe('resolveWorkspaceFolder', () => {
    it('replaces every placeholder occurrence', () => {
        assert.strictEqual(
            resolveWorkspaceFolder('${workspaceFolder}\\Sources;${workspaceFolder}\\x', 'E:\\ws'),
            'E:\\ws\\Sources;E:\\ws\\x'
        );
    });

    it('leaves values without the placeholder unchanged', () => {
        assert.strictEqual(resolveWorkspaceFolder('D:\\Export', 'E:\\ws'), 'D:\\Export');
    });
});

describe('parseConfigText', () => {
    it('returns undefined for missing or blank text', () => {
        assert.strictEqual(parseConfigText(undefined), undefined);
        assert.strictEqual(parseConfigText('  \r\n'), undefined);
    });

    it('accepts comments and trailing commas', () => {
        const text = '{\n  // comment\n  "servers": { /* c */ "a": { "command": "x", }, },\n}';
        assert.deepStrictEqual(parseConfigText(text), { servers: { a: { command: 'x' } } });
    });

    it('throws on invalid JSON with the label in the message', () => {
        assert.throws(() => parseConfigText('{ not json', 'mcp.json'), /Cannot parse mcp\.json/);
    });
});

describe('applyServerEntry', () => {
    it('creates a new document for missing or blank text', () => {
        const expected = JSON.stringify({ servers: { [SERVER_NAME]: entry } }, null, 2);
        assert.strictEqual(applyServerEntry(undefined, SERVER_NAME, entry, 'servers'), expected);
        assert.strictEqual(applyServerEntry('', SERVER_NAME, entry, 'servers'), expected);
    });

    it('keeps comments and other servers when adding', () => {
        const text = '{\n  // my servers\n  "servers": {\n    "other": { "command": "o.exe" } // keep\n  }\n}';
        const result = applyServerEntry(text, SERVER_NAME, entry, 'servers');
        assert.ok(result.includes('// my servers'));
        assert.ok(result.includes('// keep'));
        const parsed = parseConfigText(result) as { servers: Record<string, unknown> };
        assert.deepStrictEqual(parsed.servers[SERVER_NAME], entry);
        assert.deepStrictEqual(parsed.servers.other, { command: 'o.exe' });
    });

    it('replaces an existing entry', () => {
        const text = JSON.stringify({ servers: { [SERVER_NAME]: { command: 'old', args: [] } } });
        const parsed = parseConfigText(applyServerEntry(text, SERVER_NAME, entry, 'servers')) as { servers: Record<string, unknown> };
        assert.deepStrictEqual(parsed.servers[SERVER_NAME], entry);
    });

    it('adds another key without touching other keys', () => {
        const parsed = parseConfigText(applyServerEntry('{ "other": 1 }', SERVER_NAME, entry, 'mcpServers')) as Record<string, unknown>;
        assert.strictEqual(parsed.other, 1);
        assert.deepStrictEqual(parsed.mcpServers, { [SERVER_NAME]: entry });
    });

    it('keeps CRLF line endings', () => {
        const result = applyServerEntry('{\r\n  "servers": {}\r\n}', SERVER_NAME, entry, 'servers');
        assert.ok(!/(^|[^\r])\n/.test(result), 'no bare LF expected');
    });

    it('throws on invalid text or unexpected shape', () => {
        assert.throws(() => applyServerEntry('{ nope', SERVER_NAME, entry, 'servers'), /Cannot parse/);
        assert.throws(() => applyServerEntry('[]', SERVER_NAME, entry, 'servers'), /JSON object/);
        assert.throws(() => applyServerEntry('{"servers": []}', SERVER_NAME, entry, 'servers'), /servers/);
    });
});

describe('refreshServerCommandText', () => {
    it('updates only the command and keeps args, env and comments', () => {
        const text = '{\n  // c\n  "servers": { "' + SERVER_NAME + '": { "command": "old.exe", "args": ["--a"], "env": { "K": "v" } } }\n}';
        const result = refreshServerCommandText(text, SERVER_NAME, 'new.exe', 'servers', STDIO_FORMAT);
        assert.ok(result);
        assert.ok(result.includes('// c'));
        const parsed = parseConfigText(result) as { servers: Record<string, Record<string, unknown>> };
        assert.strictEqual(parsed.servers[SERVER_NAME].command, 'new.exe');
        assert.deepStrictEqual(parsed.servers[SERVER_NAME].args, ['--a']);
        assert.deepStrictEqual(parsed.servers[SERVER_NAME].env, { K: 'v' });
    });

    it('returns undefined when the command is already current', () => {
        const text = JSON.stringify({ servers: { [SERVER_NAME]: { command: 'same.exe', args: [] } } });
        assert.strictEqual(refreshServerCommandText(text, SERVER_NAME, 'same.exe', 'servers', STDIO_FORMAT), undefined);
    });

    it('returns undefined when the entry is missing, not an object, or the text is absent', () => {
        assert.strictEqual(refreshServerCommandText('{"servers":{}}', SERVER_NAME, 'x', 'servers', STDIO_FORMAT), undefined);
        assert.strictEqual(refreshServerCommandText('{}', SERVER_NAME, 'x', 'servers', STDIO_FORMAT), undefined);
        assert.strictEqual(refreshServerCommandText(`{"servers":{"${SERVER_NAME}":"junk"}}`, SERVER_NAME, 'x', 'servers', STDIO_FORMAT), undefined);
        assert.strictEqual(refreshServerCommandText(undefined, SERVER_NAME, 'x', 'servers', STDIO_FORMAT), undefined);
    });

    it('only looks at the given key', () => {
        const text = JSON.stringify({ mcpServers: { [SERVER_NAME]: { command: 'old', args: [] } } });
        assert.strictEqual(refreshServerCommandText(text, SERVER_NAME, 'new', 'servers', STDIO_FORMAT), undefined);
        const parsed = parseConfigText(refreshServerCommandText(text, SERVER_NAME, 'new', 'mcpServers', STDIO_FORMAT)) as { mcpServers: Record<string, { command: string }> };
        assert.strictEqual(parsed.mcpServers[SERVER_NAME].command, 'new');
    });
});

describe('removeServerEntryText', () => {
    it('removes only the named entry and keeps other keys and comments', () => {
        const text = `{\n  // keep me\n  "inputs": [],\n  "servers": {\n    "${SERVER_NAME}": { "command": "a" },\n    "other": { "command": "o" }\n  }\n}`;
        const result = removeServerEntryText(text, SERVER_NAME, 'servers');
        assert.ok(result);
        assert.ok(result.includes('// keep me'));
        const parsed = parseConfigText(result) as Record<string, unknown>;
        assert.deepStrictEqual(parsed.servers, { other: { command: 'o' } });
        assert.deepStrictEqual(parsed.inputs, []);
    });

    it('returns undefined when the entry does not exist or text is absent', () => {
        assert.strictEqual(removeServerEntryText('{"servers":{}}', SERVER_NAME, 'servers'), undefined);
        assert.strictEqual(removeServerEntryText(undefined, SERVER_NAME, 'servers'), undefined);
    });

    it('works with other keys', () => {
        const text = JSON.stringify({ mcp: { [SERVER_NAME]: { command: ['a'] } } });
        const parsed = parseConfigText(removeServerEntryText(text, SERVER_NAME, 'mcp')) as Record<string, unknown>;
        assert.deepStrictEqual(parsed.mcp, {});
    });
});

describe('edits are verified before they are returned', () => {
    it('remove refuses instead of producing invalid text next to a trailing comma', () => {
        for (const text of [
            `{"servers":{"${SERVER_NAME}":1,}}`,
            `{"servers":{"${SERVER_NAME}":{"command":"x"}, // note\n}}`
        ]) {
            assert.throws(() => removeServerEntryText(text, SERVER_NAME, 'servers'), /cannot be edited automatically/, text);
        }
    });

    it('remove still works when other entries make the trailing comma harmless', () => {
        const text = `{"servers":{"other":{"command":"o"},"${SERVER_NAME}":{"command":"x"},}}`;
        const result = removeServerEntryText(text, SERVER_NAME, 'servers');
        assert.deepStrictEqual(parseConfigText(result), { servers: { other: { command: 'o' } } });
    });

    it('add refuses when a duplicate key makes the edit invisible to readers', () => {
        const text = `{"servers":{"x":1},"servers":{}}`;
        assert.throws(() => applyServerEntry(text, SERVER_NAME, entry, 'servers'), /cannot be edited automatically/);
    });

    it('add treats a literal null file as an unexpected shape, not as an empty file', () => {
        assert.throws(() => applyServerEntry('null', SERVER_NAME, entry, 'servers'), /JSON object/);
    });
});

describe('readJsonFile', () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpcfg-'));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('returns undefined for a missing file', () => {
        assert.strictEqual(readJsonFile(path.join(dir, 'nope.json')), undefined);
    });

    it('parses valid JSON', () => {
        const file = path.join(dir, 'ok.json');
        fs.writeFileSync(file, '{"servers":{}}');
        assert.deepStrictEqual(readJsonFile(file), { servers: {} });
    });

    it('parses JSONC with comments', () => {
        const file = path.join(dir, 'c.json');
        fs.writeFileSync(file, '// top\n{"servers":{}, }');
        assert.deepStrictEqual(readJsonFile(file), { servers: {} });
    });

    it('ignores a leading UTF-8 BOM', () => {
        const file = path.join(dir, 'bom.json');
        fs.writeFileSync(file, '\uFEFF{"servers":{}}', 'utf8');
        assert.deepStrictEqual(readJsonFile(file), { servers: {} });
    });

    it('throws on invalid JSON and leaves the file untouched', () => {
        const file = path.join(dir, 'bad.json');
        fs.writeFileSync(file, '{ not json');
        assert.throws(() => readJsonFile(file), /bad\.json/);
        assert.strictEqual(fs.readFileSync(file, 'utf8'), '{ not json');
    });
});
