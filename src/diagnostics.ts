import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { SERVER_NAME, rawEntry, readJsonFile } from './mcpConfig';

export interface DiagnosticCheck {
    label: string;
    passed: boolean;
    detail?: string;
    fix?: string;
}

const NET48_MIN_RELEASE = 528040;

export async function runDiagnostics(serverPath: string): Promise<DiagnosticCheck[]> {
    return [
        checkServerBinary(serverPath),
        checkTiaPortalLocation(),
        checkDotNetFramework(),
        checkUserGroup(),
        checkMcpConfigured(),
        checkCopilotMcpEnabled(),
    ];
}

function checkServerBinary(serverPath: string): DiagnosticCheck {
    const exists = fs.existsSync(serverPath);
    return {
        label: 'MCP server binary found',
        passed: exists,
        detail: serverPath,
        fix: exists ? undefined : 'Reinstall the extension; the bundled server binary is missing.',
    };
}

function checkTiaPortalLocation(): DiagnosticCheck {
    const tiaPortalLocation = process.env.TiaPortalLocation;
    if (!tiaPortalLocation) {
        return {
            label: 'TiaPortalLocation environment variable is set',
            passed: false,
            fix: 'Set TiaPortalLocation to "C:\\Program Files\\Siemens\\Automation\\Portal V20" in your user environment variables.',
        };
    }
    const pathExists = fs.existsSync(tiaPortalLocation);
    return {
        label: 'TiaPortalLocation environment variable is set',
        passed: pathExists,
        detail: tiaPortalLocation,
        fix: pathExists ? undefined : `The path "${tiaPortalLocation}" does not exist on disk. Verify TIA Portal V20 is installed.`,
    };
}

function checkDotNetFramework(): DiagnosticCheck {
    try {
        const output = execSync(
            'reg query "HKLM\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full" /v Release',
            { encoding: 'utf8' },
        );
        const match = output.match(/Release\s+REG_DWORD\s+(0x[0-9a-fA-F]+|\d+)/);
        if (match) {
            const raw = match[1];
            const release = raw.startsWith('0x') ? parseInt(raw, 16) : parseInt(raw, 10);
            const has48 = release >= NET48_MIN_RELEASE;
            return {
                label: '.NET Framework 4.8 installed',
                passed: has48,
                detail: `Release ${release}`,
                fix: has48 ? undefined : 'Install .NET Framework 4.8 or later.',
            };
        }
        return {
            label: '.NET Framework 4.8 installed',
            passed: false,
            fix: 'Could not determine .NET Framework version. Install .NET Framework 4.8 or later.',
        };
    } catch {
        return {
            label: '.NET Framework 4.8 installed',
            passed: false,
            fix: 'Install .NET Framework 4.8 or later.',
        };
    }
}

function checkUserGroup(): DiagnosticCheck {
    const username = os.userInfo().username;
    try {
        const output = execSync('net localgroup "Siemens TIA Openness"', { encoding: 'utf8' });
        const lines = output.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const inGroup = lines.some(l => l.toLowerCase() === username.toLowerCase());
        return {
            label: `User '${username}' in 'Siemens TIA Openness' group`,
            passed: inGroup,
            fix: inGroup ? undefined : `Add user '${username}' to the 'Siemens TIA Openness' Windows group. See the README for instructions.`,
        };
    } catch {
        return {
            label: `User '${username}' in 'Siemens TIA Openness' group`,
            passed: false,
            fix: 'The "Siemens TIA Openness" group does not exist. Install TIA Portal V20 with Openness, then add your user to the group.',
        };
    }
}

function checkMcpConfigured(): DiagnosticCheck {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
        return {
            label: 'MCP server configured in workspace',
            passed: false,
            fix: 'Open a workspace folder first, then run "TIA Portal: Add MCP Server Configuration".',
        };
    }
    const mcpConfigPath = path.join(workspaceFolder, '.vscode', 'mcp.json');
    if (!fs.existsSync(mcpConfigPath)) {
        return {
            label: 'MCP server configured in workspace',
            passed: false,
            fix: 'Run "TIA Portal: Add MCP Server Configuration" to create the mcp.json file.',
        };
    }
    try {
        const configured = rawEntry(readJsonFile(mcpConfigPath), SERVER_NAME, 'servers') !== undefined;
        return {
            label: 'MCP server configured in workspace',
            passed: configured,
            detail: mcpConfigPath,
            fix: configured ? undefined : 'Run "TIA Portal: Add MCP Server Configuration".',
        };
    } catch {
        return {
            label: 'MCP server configured in workspace',
            passed: false,
            fix: `The mcp.json file at "${mcpConfigPath}" is invalid. Fix or delete it, then re-run "TIA Portal: Add MCP Server Configuration".`,
        };
    }
}

function checkCopilotMcpEnabled(): DiagnosticCheck {
    const enabled = vscode.workspace.getConfiguration('chat').get<boolean>('mcp.enabled');
    return {
        label: 'Copilot MCP enabled (chat.mcp.enabled)',
        passed: enabled === true,
        detail: enabled === undefined ? 'not set (defaults to false)' : String(enabled),
        fix: enabled === true ? undefined : 'Set "chat.mcp.enabled": true in VS Code Settings.',
    };
}

let currentPanel: vscode.WebviewPanel | undefined;

export function showDiagnosticsPanel(checks: DiagnosticCheck[]): void {
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.Active);
        updatePanelContent(currentPanel, checks);
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'tiaPortalDiagnostics',
        'TIA Portal MCP — Diagnostics',
        vscode.ViewColumn.Active,
        { enableScripts: false, retainContextWhenHidden: true },
    );

    currentPanel = panel;
    panel.onDidDispose(() => { currentPanel = undefined; });

    updatePanelContent(panel, checks);
}

function updatePanelContent(panel: vscode.WebviewPanel, checks: DiagnosticCheck[]): void {

    const passedCount = checks.filter(c => c.passed).length;
    const totalCount = checks.length;
    const allPassed = passedCount === totalCount;

    const rows = checks.map(c => {
        const icon = c.passed ? '✓' : '✗';
        const color = c.passed ? '#22c55e' : '#ef4444';
        const detail = c.detail ? `<div class="detail">${escapeHtml(c.detail)}</div>` : '';
        const fix = c.fix ? `<div class="fix">→ ${escapeHtml(c.fix)}</div>` : '';
        return `<div class="row"><span class="icon" style="color:${color}">${icon}</span><div class="content"><div class="label">${escapeHtml(c.label)}</div>${detail}${fix}</div></div>`;
    }).join('\n');

    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
    body { font-family: var(--vscode-font-family, 'Segoe UI', sans-serif); padding: 16px; color: var(--vscode-foreground, #333); }
    h2 { font-size: 16px; margin: 0 0 4px 0; }
    .summary { font-size: 13px; margin-bottom: 20px; opacity: 0.8; }
    .row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 14px; }
    .icon { font-size: 16px; font-weight: bold; flex-shrink: 0; line-height: 1.4; }
    .content { flex: 1; }
    .label { font-size: 14px; }
    .detail { font-size: 12px; opacity: 0.6; margin-top: 2px; word-break: break-all; }
    .fix { font-size: 12px; color: #f59e0b; margin-top: 4px; }
</style>
</head>
<body>
<h2>TIA Portal MCP — Diagnostics Report</h2>
<div class="summary">${passedCount}/${totalCount} checks passed${allPassed ? ' — everything looks good!' : ''}</div>
${rows}
</body>
</html>`;
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
