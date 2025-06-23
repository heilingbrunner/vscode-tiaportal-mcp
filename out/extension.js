"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMcpConfig = updateMcpConfig;
exports.removeMcpConfig = removeMcpConfig;
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");
const child_process_1 = require("child_process");
let mcpServerProcess;
function activate(context) {
    console.log('Congratulations, your extension "vscode-tiaportal-mcp" is now active!');
    const disposable = vscode.commands.registerCommand('vscode-tiaportal-mcp.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from vscode-tiaportal-mcp!');
    });
    // Server-Binary from extension folder
    const extensionPath = context.extensionPath;
    const serverPath = path.join(extensionPath, 'srv', 'net48', 'TiaMcpServer.exe');
    // Automatically create/update MCP configuration
    updateMcpConfig(serverPath);
    // Automatically start MCP server
    try {
        mcpServerProcess = (0, child_process_1.spawn)(serverPath, [], {
            cwd: path.dirname(serverPath),
            detached: false,
            stdio: 'ignore'
        });
        if (mcpServerProcess.pid && !mcpServerProcess.killed) {
            console.log('MCP server started successfully. PID:', mcpServerProcess.pid);
        }
        else {
            console.error('Failed to start MCP server: No process ID.');
        }
    }
    catch (error) {
        console.error('Error starting MCP server:', error);
    }
    context.subscriptions.push(disposable);
}
function deactivate() {
    console.log('MCP server extension is being deactivated...');
    try {
        // Remove MCP server from configuration
        removeMcpConfig();
        console.log('MCP server removed from configuration');
    }
    catch (error) {
        console.error('Error removing MCP server:', error);
    }
    // Stop MCP server if running
    if (mcpServerProcess && !mcpServerProcess.killed) {
        mcpServerProcess.kill();
        console.log('MCP server process stopped');
    }
}
function updateMcpConfig(serverPath) {
    // Windows-specific VSCode user config path
    const vscodeUserDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User');
    const mcpConfigPath = path.join(vscodeUserDir, 'mcp.json');
    // Platform check for Windows
    if (process.platform !== 'win32') {
        throw new Error('This MCP server is only available for Windows (.NET 4.8)');
    }
    // Ensure the directory exists
    if (!fs.existsSync(vscodeUserDir)) {
        fs.mkdirSync(vscodeUserDir, { recursive: true });
    }
    let mcpConfig = { servers: {} };
    // Load existing configuration if present
    if (fs.existsSync(mcpConfigPath)) {
        try {
            const configContent = fs.readFileSync(mcpConfigPath, 'utf8');
            mcpConfig = JSON.parse(configContent);
        }
        catch (error) {
            console.warn('Error reading existing MCP configuration:', error);
            mcpConfig = { servers: {} };
        }
    }
    // Add/update server configuration
    if (!mcpConfig.servers) {
        mcpConfig.servers = {};
    }
    const serverName = 'vscode-tiaportal-mcp'; // Adjust to your server name
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
    }
    catch (error) {
        console.error('Error writing MCP configuration:', error);
        throw error;
    }
}
// Function to remove the server on uninstall
function removeMcpConfig() {
    if (process.platform !== 'win32') {
        return; // Nothing to do on other platforms
    }
    const vscodeUserDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User');
    const mcpConfigPath = path.join(vscodeUserDir, 'mcp.json');
    if (!fs.existsSync(mcpConfigPath)) {
        return;
    }
    try {
        const configContent = fs.readFileSync(mcpConfigPath, 'utf8');
        const mcpConfig = JSON.parse(configContent);
        if (mcpConfig.servers && mcpConfig.servers['vscode-tiaportal-mcp']) {
            delete mcpConfig.servers['vscode-tiaportal-mcp'];
            fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
            console.log('MCP server removed from configuration');
        }
    }
    catch (error) {
        console.warn('Error removing MCP server:', error);
    }
}
//# sourceMappingURL=extension.js.map