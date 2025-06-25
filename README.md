# TIA-Portal MCP-Server

A Visual Studio Code extension to connect to Siemens TIA Portal and interact with TIA Portal projects directly from VS Code with GitHub Copilot.

## MCP-Server

- Refer to [tiaportal-mcp](https://github.com/heilingbrunner/tiaportal-mcp) 

## Features

- Connect to a TIA Portal instance
- Browse and interact with TIA Portal projects
- Perform basic project operations from within VS Code

## Requirements

- __.net Framework 4.8__ installed
- __Siemens TIA Portal V20__ installed and running on your machine
- Check if under `Environment Variables/User variable for user <name>` the variable `TiaPortalLocation` is set to `C:\Program Files\Siemens\Automation\Portal V20`
- User must be in Windows User Group `Siemens TIA Openness`

## Usage

### Visaul Studio Code

#### Add server to `mcp.json`

- After installation restart VS Code.
- Run the command `TIA Portal: Add MCP Server Configuration` to add mcp server entry to `mcp.json.
- Check `.vscode\mcp.json` for the correct TIA Portal path.
   - `<user>`: Your Windows username
   - `<version>`: The version of the extension you have installed.
    ```json
    {
        "servers": {
            "vscode-tiaportal-mcp": {
            "command": "c:\\Users\\<user>\\.vscode\\extensions\\jheilingbrunner.vscode-tiaportal-mcp-<version>\\srv\\net48\\TiaMcpServer.exe",
            "args": [],
            "env": {}
            }
        }
    }
    ```
- Open GitHub Copilot.
- Switch to `Agent` mode.
- Check tools by `Select Tools`
- Start to chat with TIA Portal.

#### Remove server from `mcp.json`

- Run the command `TIA Portal: Remove MCP Server Configuration` to remove mcp server entry from `mcp.json`.

### Claude Desktop

Create/Edit to add/remove server to `C:\Users\<user>\AppData\Roaming\Claude\claude_desktop_config.json`:

```
{
  "mcpServers": {
    "vscode-tiaportal-mcp": {
      "command": "c:\\Users\\<user>\\.vscode\\extensions\\jheilingbrunner.vscode-tiaportal-mcp-<version>\\srv\\net48\\TiaMcpServer.exe",
      "args": [],
      "env": {}
    }
  }
}
```

## License

MIT
