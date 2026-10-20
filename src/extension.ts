import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { runDiagnostics, showDiagnosticsPanel } from './diagnostics';
import {
    TiaServerArgs,
    buildArgs,
    parseArgs,
    readTextFile
} from './mcpConfig';
import { promptTiaServerArgs } from './prompts';
import { ALL_TARGETS, CLAUDE_TARGET, COPILOT_TARGET, McpTarget } from './targets';

// Export for use in other modules
export { addMcpConfigCopilot, addMcpConfigClaude, addMcpConfigFor, removeMcpConfig };

let mcpServerProcess: ChildProcess | undefined;

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Runs `fn` and prefixes any error with the config file it was about. */
function inFile<T>(configPath: string, fn: () => T): T {
    try {
        return fn();
    } catch (error) {
        throw new Error(`${configPath}: ${errorMessage(error)}`);
    }
}

/** "A", "A and B", "A, B and C" */
function listOf(labels: string[]): string {
    return labels.length <= 2
        ? labels.join(' and ')
        : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** What the config files of all clients already contain. */
interface ExistingConfig {
    /** Clients whose config file already has our server entry. */
    configured: McpTarget[];
    /** Arguments of the first entry found, used as defaults for the prompts. */
    args: string[] | undefined;
}

/**
 * Looks at every client's config file before anything is asked. A file that cannot be read or parsed is
 * skipped here; the command itself reports such a file once the client is selected.
 */
function findExistingConfig(): ExistingConfig {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const found: ExistingConfig = { configured: [], args: undefined };
    if (!workspaceFolder || process.platform !== 'win32') {
        return found;
    }

    for (const target of ALL_TARGETS) {
        try {
            const text = readTextFile(target.configPath(workspaceFolder));
            if (target.hasEntry(text)) {
                found.configured.push(target);
                found.args ??= target.existingArgs(text);
            }
        } catch {
            // ignored, see above
        }
    }
    return found;
}

/**
 * Asks which clients to act on, with one checkbox per client; clients that are already configured are ticked.
 * Resolves to undefined if the user cancelled or ticked nothing.
 */
async function pickTargets(title: string, configured: McpTarget[]): Promise<McpTarget[] | undefined> {
    const items = ALL_TARGETS.map(target => {
        const isConfigured = configured.includes(target);
        return {
            label: target.label,
            description: target.relativePath.join('\\') + (isConfigured ? '  (already configured)' : ''),
            picked: isConfigured,
            target
        };
    });
    const chosen = await vscode.window.showQuickPick(items, {
        title,
        placeHolder: 'Tick the clients, then press Enter',
        canPickMany: true
    });
    if (chosen === undefined) {
        return undefined;
    }
    if (chosen.length === 0) {
        vscode.window.showWarningMessage('No client selected. Tick at least one client.');
        return undefined;
    }
    return chosen.map(item => item.target);
}

export function activate(context: vscode.ExtensionContext) {

    // Server-Binary from extension folder
    const extensionPath = context.extensionPath;
    const serverPath = path.join(extensionPath, 'srv', 'net48', 'TiaMcpServer.exe');

    console.log('Congratulations, your extension "vscode-tiaportal-mcp" is now active!');

    const disposableAddServerConfiguration = vscode.commands.registerCommand('vscode-tiaportal-mcp.AddServerConfiguration', async () => {

        try {
            const existing = findExistingConfig();
            const targets = await pickTargets('Add TIA Portal MCP server configuration for…', existing.configured);
            if (!targets) {
                return;
            }

            const labels = listOf(targets.map(target => target.label));
            if (await addMcpConfigFor(targets, serverPath, existing.args)) {
                console.log(`TIA Portal MCP server added to ${labels} configuration`);
                vscode.window.showInformationMessage(`Added TIA Portal MCP server to ${labels} configuration!`);
            }
        } catch (error) {
            console.error('Error adding TIA Portal MCP server to configuration:', error);
            vscode.window.showErrorMessage(`Failed to add TIA Portal MCP server: ${errorMessage(error)}`);
        }
    });

    const disposableRemoveServerConfiguration = vscode.commands.registerCommand('vscode-tiaportal-mcp.RemoveServerConfiguration', async () => {
        try {
            const targets = await pickTargets('Remove TIA Portal MCP server configuration from…', findExistingConfig().configured);
            if (!targets) {
                return;
            }

            // One broken file must not stop the other clients from being cleaned up
            const removed: string[] = [];
            const missing: string[] = [];
            const failed: string[] = [];
            for (const target of targets) {
                try {
                    (removeMcpConfig(target) ? removed : missing).push(target.label);
                } catch (error) {
                    console.error(`Error removing TIA Portal MCP server from ${target.label} configuration:`, error);
                    failed.push(`${target.label}: ${errorMessage(error)}`);
                }
            }

            if (failed.length > 0) {
                const done = removed.length > 0 ? ` Removed from ${listOf(removed)} configuration.` : '';
                vscode.window.showErrorMessage(`Failed to remove TIA Portal MCP server: ${failed.join(' | ')}.${done}`);
            } else if (removed.length > 0) {
                vscode.window.showInformationMessage(`Removed TIA Portal MCP server from ${listOf(removed)} configuration!`);
            } else {
                const where = targets.length > 1 ? 'any of the selected configurations' : `the ${targets[0].label} configuration`;
                vscode.window.showInformationMessage(`TIA Portal MCP server was not found in ${where}.`);
            }
        } catch (error) {
            console.error('Error removing TIA Portal MCP server from configuration:', error);
            vscode.window.showErrorMessage(`Failed to remove TIA Portal MCP server: ${errorMessage(error)}`);
        }
    });

    const disposableRunDiagnostics = vscode.commands.registerCommand('vscode-tiaportal-mcp.RunDiagnostics', async () => {
        try {
            const checks = await runDiagnostics(serverPath);
            showDiagnosticsPanel(checks);
        } catch (error) {
            console.error('Error running TIA Portal diagnostics:', error);
            vscode.window.showErrorMessage('Failed to run TIA Portal diagnostics.');
        }
    });

    context.subscriptions.push(disposableAddServerConfiguration);
    context.subscriptions.push(disposableRemoveServerConfiguration);
    context.subscriptions.push(disposableRunDiagnostics);

    updateMcpConfigsIfExist(serverPath);
}

export function deactivate() {
    console.log('MCP server extension is being deactivated...');
}

/** The first workspace folder. Throws on non-Windows platforms or without an open folder. */
function requireWorkspaceFolder(): string {
    if (process.platform !== 'win32') {
        throw new Error('TIA Portal Openness is only available on Windows.');
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
        throw new Error('No workspace folder found.');
    }
    return workspaceFolder;
}

/** Writes the server entry with the given arguments to one target's config file. */
function writeMcpConfig(target: McpTarget, serverPath: string, args: TiaServerArgs, workspaceFolder: string): void {
    const configPath = target.configPath(workspaceFolder);

    // Read right before writing: the file may have been edited while the prompts were open.
    // Edits the text in place, so comments and formatting in the file survive.
    const text = readTextFile(configPath);
    const newText = inFile(configPath, () => target.upsert(text, serverPath, buildArgs(args)));

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, newText, 'utf8');
    console.log(`MCP server successfully configured in: ${configPath}`);
}

/**
 * Asks once for the server arguments and writes the server entry to every given target's config file.
 * Existing arguments are offered as defaults: those of the first selected target that has an entry,
 * otherwise `defaultArgs` (found in the config of a client that was not selected).
 * Every file is checked (parsed and dry-run edited) before the first prompt, so a bad file stops the
 * command before anything is written.
 * Resolves to false if the user cancelled.
 */
async function addMcpConfigFor(targets: McpTarget[], serverPath: string, defaultArgs?: string[]): Promise<boolean> {
    const workspaceFolder = requireWorkspaceFolder();

    // Dry run: besides parsing, prove that the entry can be written, so a file that parses but cannot be
    // edited stops the command here and not after other files have already been written.
    const existing = targets.map(target => {
        const configPath = target.configPath(workspaceFolder);
        return inFile(configPath, () => {
            const text = readTextFile(configPath);
            target.upsert(text, serverPath, []);
            return target.existingArgs(text);
        });
    });
    const prefill = existing.find(args => args !== undefined) ?? defaultArgs;

    const prompted = await promptTiaServerArgs(parseArgs(prefill ?? []));
    if (!prompted) {
        return false;
    }

    const written: string[] = [];
    for (const target of targets) {
        try {
            writeMcpConfig(target, serverPath, prompted, workspaceFolder);
            written.push(target.label);
        } catch (error) {
            const done = written.length > 0 ? ` (already written for ${listOf(written)})` : '';
            throw new Error(`${errorMessage(error)}${done}`);
        }
    }

    return true;
}

/** Writes the entry to `.vscode/mcp.json` (GitHub Copilot). */
function addMcpConfigCopilot(serverPath: string): Promise<boolean> {
    return addMcpConfigFor([COPILOT_TARGET], serverPath);
}

/** Writes the entry to `.mcp.json` in the workspace folder (Anthropic Claude). */
function addMcpConfigClaude(serverPath: string): Promise<boolean> {
    return addMcpConfigFor([CLAUDE_TARGET], serverPath);
}

/** Keeps each existing entry's command pointing at the installed extension version; user args are left alone. */
function updateMcpConfigsIfExist(serverPath: string): void {

    if (process.platform !== 'win32') {
        return; // Nothing to do on other platforms
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
        return; // No workspace folder open
    }

    for (const target of ALL_TARGETS) {
        try {
            const configPath = target.configPath(workspaceFolder);
            const refreshed = inFile(configPath, () => target.refresh(readTextFile(configPath), serverPath));
            if (refreshed !== undefined) {
                fs.writeFileSync(configPath, refreshed, 'utf8');
                console.log(`MCP server successfully updated in: ${configPath}`);
            }
        } catch (error) {
            console.error(`Error updating TIA Portal MCP server configuration for ${target.label}:`, error);
        }
    }
}

/** Removes the entry from the target's config file. Returns false if there was nothing to remove. */
function removeMcpConfig(target: McpTarget): boolean {
    const workspaceFolder = requireWorkspaceFolder();
    const configPath = target.configPath(workspaceFolder);

    const result = inFile(configPath, () => target.remove(readTextFile(configPath)));
    if (result === undefined) {
        return false;
    }

    fs.writeFileSync(configPath, result, 'utf8');
    console.log(`MCP server removed from ${configPath}`);
    return true;
}

export function startMcpServer(serverPath: string) {
    try {

        mcpServerProcess = spawn(serverPath, [], {
            cwd: path.dirname(serverPath),
            detached: false,
            stdio: ['pipe', 'pipe', 'pipe'] // stdin, stdout, stderr für stdio-Kommunikation
        });

        if (mcpServerProcess.stdout) {
            mcpServerProcess.stdout.on('data', (data) => {
                console.log(`[MCP Server stdout]: ${data}`);
            });
        }

        if (mcpServerProcess.stderr) {
            mcpServerProcess.stderr.on('data', (data) => {
                console.error(`[MCP Server stderr]: ${data}`);
            });
        }

        if (mcpServerProcess.pid && !mcpServerProcess.killed) {
            console.log('MCP server started successfully. PID:', mcpServerProcess.pid);
        } else {
            console.error('Failed to start MCP server: No process ID.');
        }

    } catch (error) {
        console.error('Error starting MCP server:', error);
    }
}
