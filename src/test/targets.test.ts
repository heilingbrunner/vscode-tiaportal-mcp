import * as assert from 'assert';
import * as path from 'path';
import { SERVER_NAME } from '../mcpConfig';
import { ALL_TARGETS, McpTarget } from '../targets';

const COMMAND = 'C:\\ext\\TiaMcpServer.exe';
const ARGS = ['--tia-major-version', '21', '--project-path', 'D:\\p\\P.als21', '--export-path', 'E:\\ws\\Sources', '--preserve-path'];

function byId(id: string): McpTarget {
    const target = ALL_TARGETS.find(t => t.id === id);
    assert.ok(target, `unknown target ${id}`);
    return target;
}

describe('ALL_TARGETS', () => {
    it('lists every supported client once with a project-scoped path', () => {
        assert.deepStrictEqual(ALL_TARGETS.map(t => t.id), ['copilot', 'claude', 'cursor', 'codex']);
        assert.strictEqual(new Set(ALL_TARGETS.map(t => t.label)).size, ALL_TARGETS.length);
        for (const target of ALL_TARGETS) {
            assert.ok(!path.isAbsolute(target.relativePath[0]), `${target.id} must be relative to the workspace`);
        }
    });

    it('uses the documented file locations', () => {
        const ws = 'E:\\ws';
        const expected: Record<string, string> = {
            copilot: path.join(ws, '.vscode', 'mcp.json'),
            claude: path.join(ws, '.mcp.json'),
            cursor: path.join(ws, '.cursor', 'mcp.json'),
            codex: path.join(ws, '.codex', 'config.toml')
        };
        for (const target of ALL_TARGETS) {
            assert.strictEqual(target.configPath(ws), expected[target.id], target.id);
        }
    });
});

describe('every target', () => {
    for (const target of ALL_TARGETS) {
        describe(target.label, () => {
            it('writes a new file and reads the arguments back', () => {
                const text = target.upsert(undefined, COMMAND, ARGS);
                assert.deepStrictEqual(target.existingArgs(text), ARGS);
                assert.ok(text.includes('TiaMcpServer.exe'));
            });

            it('replaces the entry instead of duplicating it', () => {
                const once = target.upsert(undefined, COMMAND, ARGS);
                const twice = target.upsert(once, COMMAND, ['--tia-major-version', '20']);
                assert.deepStrictEqual(target.existingArgs(twice), ['--tia-major-version', '20']);
                assert.strictEqual(twice.split('TiaMcpServer.exe').length - 1, 1);
            });

            it('refreshes only the command', () => {
                const text = target.upsert(undefined, 'C:\\old\\TiaMcpServer.exe', ARGS);
                const refreshed = target.refresh(text, COMMAND);
                assert.ok(refreshed);
                assert.ok(refreshed.includes('ext') && !refreshed.includes('old'));
                assert.deepStrictEqual(target.existingArgs(refreshed), ARGS);
                assert.strictEqual(target.refresh(refreshed, COMMAND), undefined, 'already current');
            });

            it('removes the entry and reports a missing one', () => {
                const text = target.upsert(undefined, COMMAND, ARGS);
                const removed = target.remove(text);
                assert.ok(removed !== undefined);
                assert.strictEqual(target.existingArgs(removed), undefined);
                assert.strictEqual(target.remove(removed), undefined);
                assert.strictEqual(target.remove(undefined), undefined);
            });

            it('has no arguments, nothing to refresh and nothing to remove without a file', () => {
                assert.strictEqual(target.existingArgs(undefined), undefined);
                assert.strictEqual(target.refresh(undefined, COMMAND), undefined);
            });

            it('reports whether the entry exists', () => {
                const text = target.upsert(undefined, COMMAND, ARGS);
                assert.strictEqual(target.hasEntry(text), true);
                assert.strictEqual(target.hasEntry(target.remove(text)), false);
                assert.strictEqual(target.hasEntry(undefined), false);
            });

            it('counts an entry without usable arguments as configured', () => {
                const broken = target.id === 'codex'
                    ? `[mcp_servers.${SERVER_NAME}]\ncommand = "x"\nargs = "oops"\n`
                    : JSON.stringify(JSON.parse(target.upsert(undefined, COMMAND, ARGS)), (k, v) =>
                        k === 'args' ? 'oops' : k === 'command' && Array.isArray(v) ? 'oops' : v);
                assert.strictEqual(target.hasEntry(broken), true);
                assert.strictEqual(target.existingArgs(broken), undefined);
            });

            it('rejects an invalid file without producing new text', () => {
                const broken = target.id === 'codex' ? '[broken' : '{ broken';
                assert.throws(() => target.upsert(broken, COMMAND, ARGS), /Cannot parse/);
                assert.throws(() => target.existingArgs(broken), /Cannot parse/);
                assert.throws(() => target.remove(broken), /Cannot parse/);
            });
        });
    }
});

describe('JSON targets keep the rest of the file', () => {
    const jsonTargets = ALL_TARGETS.filter(t => t.id !== 'codex');

    for (const target of jsonTargets) {
        it(`${target.label}: comments and unrelated settings survive add, refresh and remove`, () => {
            const base = '{\n  // user comment\n  "editor.fontSize": 14\n}';
            const added = target.upsert(base, 'C:\\old\\TiaMcpServer.exe', ARGS);
            assert.ok(added.includes('// user comment') && added.includes('"editor.fontSize": 14'));

            const refreshed = target.refresh(added, COMMAND);
            assert.ok(refreshed?.includes('// user comment'));

            const removed = target.remove(refreshed);
            assert.ok(removed?.includes('// user comment') && removed.includes('"editor.fontSize": 14'));
        });
    }
});

describe('entry shapes', () => {
    function parsed(target: McpTarget): Record<string, any> {
        return JSON.parse(target.upsert(undefined, COMMAND, ARGS));
    }

    it('GitHub Copilot: servers with type stdio', () => {
        assert.deepStrictEqual(parsed(byId('copilot')).servers[SERVER_NAME], { type: 'stdio', command: COMMAND, args: ARGS, env: {} });
    });

    it('Anthropic Claude: mcpServers with type stdio', () => {
        assert.deepStrictEqual(parsed(byId('claude')).mcpServers[SERVER_NAME], { type: 'stdio', command: COMMAND, args: ARGS, env: {} });
    });

    it('Cursor: mcpServers without type', () => {
        assert.deepStrictEqual(parsed(byId('cursor')).mcpServers[SERVER_NAME], { command: COMMAND, args: ARGS, env: {} });
    });

    it('OpenAI Codex: [mcp_servers.<name>] with command and args, no env table', () => {
        const text = byId('codex').upsert(undefined, COMMAND, ARGS);
        assert.ok(text.includes(`[mcp_servers.${SERVER_NAME}]`));
        assert.ok(!text.includes('env'));
        assert.deepStrictEqual(byId('codex').existingArgs(text), ARGS);
    });

    it('keeps user fields of an existing entry', () => {
        const copilot = byId('copilot').upsert(
            `{ "servers": { "${SERVER_NAME}": { "command": "old", "args": [], "env": { "K": "v" }, "envFile": "f" } } }`,
            COMMAND,
            ARGS
        );
        const entry = JSON.parse(copilot).servers[SERVER_NAME];
        assert.deepStrictEqual(entry.env, { K: 'v' });
        assert.strictEqual(entry.envFile, 'f');

        const codex = byId('codex').upsert(
            `[mcp_servers.${SERVER_NAME}]\ncommand = "old"\nargs = []\nstartup_timeout_sec = 30\n`,
            COMMAND,
            ARGS
        );
        assert.ok(codex.includes('startup_timeout_sec = 30'));
    });
});

describe('export path', () => {
    const exportPaths = ['Sources', '.\\Sources', '..\\Export', 'out/export', '${workspaceFolder}\\Sources', 'D:\\Absolute\\Export'];

    for (const target of ALL_TARGETS) {
        it(`${target.label}: is written exactly as entered, relative paths stay relative`, () => {
            for (const exportPath of exportPaths) {
                const args = ['--tia-major-version', '21', '--export-path', exportPath, '--preserve-path'];
                const text = target.upsert(undefined, COMMAND, args);
                assert.deepStrictEqual(target.existingArgs(text), args, exportPath);
            }
        });
    }
});
