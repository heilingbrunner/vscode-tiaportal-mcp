"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMcpConfig = updateMcpConfig;
exports.removeMcpConfig = removeMcpConfig;
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const child_process_1 = require("child_process");
let mcpServerProcess;
function activate(context) {
    console.log('Congratulations, your extension "vscode-tiaportal-mcp" is now active!');
    const disposable = vscode.commands.registerCommand('vscode-tiaportal-mcp.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from vscode-tiaportal-mcp!');
    });
    // Server-Binary from extension folder
    const extensionPath = context.extensionPath;
    const serverPath = path_1.default.join(extensionPath, 'srv', 'net48', 'TiaMcpServer.exe');
    // Automatically create/update MCP configuration
    updateMcpConfig(serverPath);
    // Automatically start MCP server
    try {
        mcpServerProcess = (0, child_process_1.spawn)(serverPath, [], {
            cwd: path_1.default.dirname(serverPath),
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
    const vscodeUserDir = path_1.default.join(os_1.default.homedir(), 'AppData', 'Roaming', 'Code', 'User');
    const mcpConfigPath = path_1.default.join(vscodeUserDir, 'mcp.json');
    // Platform check for Windows
    if (process.platform !== 'win32') {
        throw new Error('This MCP server is only available for Windows (.NET 4.8)');
    }
    // Ensure the directory exists
    if (!fs_1.default.existsSync(vscodeUserDir)) {
        fs_1.default.mkdirSync(vscodeUserDir, { recursive: true });
    }
    let mcpConfig = { servers: {} };
    // Load existing configuration if present
    if (fs_1.default.existsSync(mcpConfigPath)) {
        try {
            const configContent = fs_1.default.readFileSync(mcpConfigPath, 'utf8');
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
        fs_1.default.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
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
    const vscodeUserDir = path_1.default.join(os_1.default.homedir(), 'AppData', 'Roaming', 'Code', 'User');
    const mcpConfigPath = path_1.default.join(vscodeUserDir, 'mcp.json');
    if (!fs_1.default.existsSync(mcpConfigPath)) {
        return;
    }
    try {
        const configContent = fs_1.default.readFileSync(mcpConfigPath, 'utf8');
        const mcpConfig = JSON.parse(configContent);
        if (mcpConfig.servers && mcpConfig.servers['vscode-tiaportal-mcp']) {
            delete mcpConfig.servers['vscode-tiaportal-mcp'];
            fs_1.default.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
            console.log('MCP server removed from configuration');
        }
    }
    catch (error) {
        console.warn('Error removing MCP server:', error);
    }
}
//# sourceMappingURL=extension.js.map