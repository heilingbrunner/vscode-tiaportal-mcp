import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';

interface McpServerConfig {
    command: string;
    args: string[];
    env?: { [key: string]: string }
}

// Export for use in other modules
export { updateMcpConfig, removeMcpConfig };


interface McpConfig {
    servers: { [serverName: string]: McpServerConfig };
}

let mcpServerProcess: ChildProcess | undefined;

export function activate(context: vscode.ExtensionContext) {

    // Server-Binary from extension folder
    const extensionPath = context.extensionPath;
    const serverPath = path.join(extensionPath, 'srv', 'net48', 'TiaMcpServer.exe');

    console.log('Congratulations, your extension "vscode-tiaportal-mcp" is now active!');

    const disposableAddServerConfiguration = vscode.commands.registerCommand('vscode-tiaportal-mcp.AddServerConfiguration', () => {
        
        try {
            updateMcpConfig(serverPath);

            console.log('TIA Portal MCP server added to configuration');
        } catch (error) {
            console.error('Error adding TIA Portal MCP server to configuration:', error);
        }

        vscode.window.showInformationMessage('Added TIA Portal MCP server to configuration!');
    });

    const disposableRemoveServerConfiguration = vscode.commands.registerCommand('vscode-tiaportal-mcp.RemoveServerConfiguration', () => {
        try {
            removeMcpConfig();

            console.log('TIA Portal MCP server removed from configuration');
        } catch (error) {
            console.error('Error removing TIA Portal MCP server from configuration:', error);
        }

        vscode.window.showInformationMessage('Removed TIA Portal MCP server from configuration!');
    });

    context.subscriptions.push(disposableAddServerConfiguration);
    context.subscriptions.push(disposableRemoveServerConfiguration);
}

export function deactivate() {
    console.log('MCP server extension is being deactivated...');

    // Remove from mcp.json
    // try {
    //     // Remove MCP server from configuration
    //     removeMcpConfig();
    //     console.log('MCP server removed from configuration');
    // } catch (error) {
    //     console.error('Error removing MCP server:', error);
    // }

    // // Stop MCP server if running
    // if (mcpServerProcess && !mcpServerProcess.killed) {
    //     mcpServerProcess.kill();
    //     console.log('MCP server process stopped');
    // }
}

function updateMcpConfig(serverPath: string): void {

    if (process.platform !== 'win32') {
        return; // Nothing to do on other platforms
    }

    // VSCode workspace-specific config path
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
        throw new Error('No workspace folder found.');
    }
    const vscodeDir = path.join(workspaceFolder, '.vscode');
    const mcpConfigPath = path.join(vscodeDir, 'mcp.json');

    // Ensure the directory exists
    if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir, { recursive: true });
    }

    let mcpConfig: McpConfig = { servers: {} };

    // Load existing configuration if present
    if (fs.existsSync(mcpConfigPath)) {
        try {
            const configContent: string = fs.readFileSync(mcpConfigPath, 'utf8');
            mcpConfig = JSON.parse(configContent) as McpConfig;
        } catch (error: any) {
            console.warn('Error reading existing MCP configuration:', error);
            mcpConfig = { servers: {} };
        }
    }

    // Add/update server configuration
    if (!mcpConfig.servers) {
        mcpConfig.servers = {};
    }

    const serverName: string = 'vscode-tiaportal-mcp'; // Adjust to your server name
    mcpConfig.servers[serverName] = {
        command: serverPath,
        args: [], // Add any arguments for your server here
        env: {
            // Environment variables if needed
        }
    };

    // Write configuration back
    // C:\Users\<user>\AppData\Roaming\Code\User\mcp.json
    try {
        fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
        console.log(`MCP server "${serverName}" successfully configured in: ${mcpConfigPath}`);
    } catch (error: any) {
        console.error('Error writing MCP configuration:', error);
        throw error;
    }
}

function removeMcpConfig(): void {

    if (process.platform !== 'win32') {
        return; // Nothing to do on other platforms
    }

    // VSCode workspace-specific config path
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
        throw new Error('No workspace folder found.');
    }

    const vscodeDir = path.join(workspaceFolder, '.vscode');
    const mcpConfigPath = path.join(vscodeDir, 'mcp.json');

    if (!fs.existsSync(mcpConfigPath)) {
        return;
    }

    try {
        const configContent: string = fs.readFileSync(mcpConfigPath, 'utf8');
        const mcpConfig: McpConfig = JSON.parse(configContent) as McpConfig;

        if (mcpConfig.servers && mcpConfig.servers['vscode-tiaportal-mcp']) {
            delete mcpConfig.servers['vscode-tiaportal-mcp'];
            fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
            console.log('MCP server removed from configuration');
        }
    } catch (error: any) {
        console.warn('Error removing MCP server:', error);
    }
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

        // Beispiel: Sende Testdaten an den Server (falls benötigt)
        // if (mcpServerProcess.stdin) {
        //     mcpServerProcess.stdin.write('Hello MCP Server!\n');
        // }

        if (mcpServerProcess.pid && !mcpServerProcess.killed) {
            console.log('MCP server started successfully. PID:', mcpServerProcess.pid);
        } else {
            console.error('Failed to start MCP server: No process ID.');
        }

    } catch (error) {
        console.error('Error starting MCP server:', error);
    }
}