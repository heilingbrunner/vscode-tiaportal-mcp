import * as assert from 'assert';
import { SERVER_NAME } from '../mcpConfig';
import {
    applyServerEntryToml,
    parseTomlText,
    refreshServerCommandToml,
    removeServerEntryToml,
    tomlRawEntry
} from '../tomlConfig';

const entry = { command: 'C:\\ext\\TiaMcpServer.exe', args: ['--tia-major-version', '21', '--export-path', 'E:\\ws\\Sources'] };
const header = `[mcp_servers.${SERVER_NAME}]`;

function entryOf(text: string | undefined): Record<string, unknown> | undefined {
    return tomlRawEntry(parseTomlText(text), SERVER_NAME);
}

describe('parseTomlText', () => {
    it('returns undefined for missing or blank text', () => {
        assert.strictEqual(parseTomlText(undefined), undefined);
        assert.strictEqual(parseTomlText(' \n'), undefined);
    });

    it('throws with the label on invalid TOML', () => {
        assert.throws(() => parseTomlText('[x', 'config.toml'), /Cannot parse config\.toml/);
    });

    it('throws when mcp_servers is not a table', () => {
        assert.throws(() => parseTomlText('mcp_servers = 5'), /must be a table/);
    });
});

describe('applyServerEntryToml', () => {
    it('creates a document for missing text', () => {
        const text = applyServerEntryToml(undefined, SERVER_NAME, entry);
        assert.deepStrictEqual(entryOf(text), entry);
        assert.ok(text.includes(header));
    });

    it('round-trips Windows paths', () => {
        assert.strictEqual(entryOf(applyServerEntryToml(undefined, SERVER_NAME, entry))?.command, 'C:\\ext\\TiaMcpServer.exe');
    });

    it('appends to a document without our table and keeps comments and other tables', () => {
        const text = '# my codex config\nmodel = "gpt"\n\n[mcp_servers.other]\ncommand = "o" # keep\n';
        const result = applyServerEntryToml(text, SERVER_NAME, entry);
        assert.ok(result.includes('# my codex config'));
        assert.ok(result.includes('# keep'));
        const doc = parseTomlText(result) as Record<string, any>;
        assert.strictEqual(doc.model, 'gpt');
        assert.deepStrictEqual(doc.mcp_servers.other, { command: 'o' });
        assert.deepStrictEqual(doc.mcp_servers[SERVER_NAME], entry);
    });

    it('replaces our table in place, including its env sub-table', () => {
        const text = `[a]\nx = 1\n\n${header}\ncommand = "old"\nargs = ["--old"]\nstartup_timeout_sec = 20\n\n[mcp_servers.${SERVER_NAME}.env]\nK = "v"\n\n# about b\n[b]\ny = 2\n`;
        const result = applyServerEntryToml(text, SERVER_NAME, { ...entry, startup_timeout_sec: 20, env: { K: 'v' } });
        assert.ok(result.includes('# about b'), 'comment above the next table stays');
        const doc = parseTomlText(result) as Record<string, any>;
        assert.deepStrictEqual(doc.mcp_servers[SERVER_NAME], { ...entry, startup_timeout_sec: 20, env: { K: 'v' } });
        assert.deepStrictEqual(doc.a, { x: 1 });
        assert.deepStrictEqual(doc.b, { y: 2 });
        assert.ok(result.indexOf('[a]') < result.indexOf(header) && result.indexOf(header) < result.indexOf('[b]'), 'position kept');
    });

    it('finds our table written with a quoted name', () => {
        const text = `[mcp_servers."${SERVER_NAME}"]\ncommand = "old"\nargs = []\n`;
        const result = applyServerEntryToml(text, SERVER_NAME, entry);
        assert.deepStrictEqual(entryOf(result), entry);
        assert.strictEqual(result.match(/mcp_servers/g)?.length, 1, 'old table is gone, not duplicated');
    });

    it('keeps CRLF line endings', () => {
        const result = applyServerEntryToml('[a]\r\nx = 1\r\n', SERVER_NAME, entry);
        assert.ok(!/(^|[^\r])\n/.test(result), 'no bare LF expected');
    });

    it('refuses to edit an entry defined as an inline table instead of corrupting the file', () => {
        const text = `mcp_servers = { "${SERVER_NAME}" = { command = "old" } }\n`;
        assert.throws(() => applyServerEntryToml(text, SERVER_NAME, entry), /cannot be edited automatically/);
    });

    it('throws on invalid TOML', () => {
        assert.throws(() => applyServerEntryToml('[x', SERVER_NAME, entry), /Cannot parse/);
    });

    it('is idempotent', () => {
        const once = applyServerEntryToml('[a]\nx = 1\n', SERVER_NAME, entry);
        assert.strictEqual(applyServerEntryToml(once, SERVER_NAME, entry), once);
    });
});

describe('refreshServerCommandToml', () => {
    it('updates the command and keeps the other fields', () => {
        const text = `${header}\ncommand = "old.exe"\nargs = ["--a"]\ntool_timeout_sec = 30\n`;
        const result = refreshServerCommandToml(text, SERVER_NAME, 'new.exe');
        assert.ok(result);
        assert.deepStrictEqual(entryOf(result), { command: 'new.exe', args: ['--a'], tool_timeout_sec: 30 });
    });

    it('returns undefined when current, missing or absent', () => {
        assert.strictEqual(refreshServerCommandToml(`${header}\ncommand = "same"\n`, SERVER_NAME, 'same'), undefined);
        assert.strictEqual(refreshServerCommandToml('[a]\nx = 1\n', SERVER_NAME, 'x'), undefined);
        assert.strictEqual(refreshServerCommandToml(undefined, SERVER_NAME, 'x'), undefined);
    });
});

describe('refreshServerCommandToml keeps the file as it is', () => {
    it('changes only the value of the command line', () => {
        const text = `${header}\n# keep me\ncommand = "old.exe" # trailing\nargs=["a"]\nstartup_timeout_sec = 0x10\n`;
        assert.strictEqual(refreshServerCommandToml(text, SERVER_NAME, 'new.exe'), text.replace('"old.exe"', '"new.exe"'));
    });

    it('handles a single-quoted command and Windows paths', () => {
        const text = `${header}\ncommand = 'C:\\old\\a.exe'\nargs = []\n`;
        const result = refreshServerCommandToml(text, SERVER_NAME, 'C:\\new\\a.exe');
        assert.ok(result);
        assert.strictEqual(entryOf(result)?.command, 'C:\\new\\a.exe');
    });

    it('keeps CRLF', () => {
        const text = `[a]\r\nx = 1\r\n${header}\r\ncommand = "old"\r\nargs = []\r\n`;
        assert.strictEqual(refreshServerCommandToml(text, SERVER_NAME, 'new'), text.replace('"old"', '"new"'));
    });

    it('refuses when the command is not a simple one-line string', () => {
        const text = `${header}\ncommand = """old"""\nargs = []\n`;
        assert.throws(() => refreshServerCommandToml(text, SERVER_NAME, 'new'), /cannot be edited automatically/);
    });

    it('refuses when the table is written in dotted-key form', () => {
        const text = `[mcp_servers]\n${SERVER_NAME}.command = "old"\n`;
        assert.throws(() => refreshServerCommandToml(text, SERVER_NAME, 'new'), /cannot be edited automatically/);
    });
});

describe('applyServerEntryToml edge cases', () => {
    it('keeps mixed line endings of untouched lines', () => {
        const text = '[a]\r\nx = 1\n[b]\r\ny = 2\r\n';
        const result = applyServerEntryToml(text, SERVER_NAME, entry);
        assert.ok(result.startsWith(text), 'existing lines are unchanged byte for byte');
        assert.deepStrictEqual(entryOf(result), entry);
    });

    it('refuses an array-of-tables form instead of guessing', () => {
        const text = `[[mcp_servers.${SERVER_NAME}]]\ncommand = "old"\n`;
        assert.throws(() => applyServerEntryToml(text, SERVER_NAME, entry), /cannot be edited automatically|Cannot parse/);
    });

    it('refuses an array of arrays that looks like a table header', () => {
        const text = `${header}\ncommand = "x"\nargs = [\n["a"],\n[3]\n]\n`;
        assert.throws(() => applyServerEntryToml(text, SERVER_NAME, entry), /cannot be edited automatically/);
    });

    it('refuses the dotted-key form', () => {
        const text = `[mcp_servers]\n${SERVER_NAME}.command = "old"\n`;
        assert.throws(() => applyServerEntryToml(text, SERVER_NAME, entry), /cannot be edited automatically/);
    });
});

describe('removeServerEntryToml', () => {
    it('removes our tables and keeps everything else', () => {
        const text = `# top\n[a]\nx = 1\n\n${header}\ncommand = "a"\n\n[mcp_servers.${SERVER_NAME}.env]\nK = "v"\n\n# keep\n[mcp_servers.other]\ncommand = "o"\n`;
        const result = removeServerEntryToml(text, SERVER_NAME);
        assert.ok(result);
        assert.ok(result.includes('# top') && result.includes('# keep'));
        const doc = parseTomlText(result) as Record<string, any>;
        assert.deepStrictEqual(doc.mcp_servers, { other: { command: 'o' } });
        assert.deepStrictEqual(doc.a, { x: 1 });
    });

    it('removes the last table of the file', () => {
        const result = removeServerEntryToml(`[a]\nx = 1\n\n${header}\ncommand = "a"\n`, SERVER_NAME);
        assert.ok(result);
        assert.strictEqual(entryOf(result), undefined);
        assert.deepStrictEqual(parseTomlText(result), { a: { x: 1 } });
    });

    it('returns undefined when there is nothing to remove', () => {
        assert.strictEqual(removeServerEntryToml('[a]\nx = 1\n', SERVER_NAME), undefined);
        assert.strictEqual(removeServerEntryToml(undefined, SERVER_NAME), undefined);
    });

    it('refuses to edit an inline-table entry', () => {
        assert.throws(
            () => removeServerEntryToml(`mcp_servers = { "${SERVER_NAME}" = { command = "a" } }\n`, SERVER_NAME),
            /cannot be edited automatically/
        );
    });
});
