# TIA-Portal MCP-Server

![vscode-tiaportal-mcp-logo](https://raw.githubusercontent.com/heilingbrunner/vscode-tiaportal-mcp/master/assets/vscode-tiaportal-mcp-logo.png)

![License](https://img.shields.io/github/license/heilingbrunner/vscode-tiaportal-mcp.svg?style=flat)
[![Version](https://img.shields.io/visual-studio-marketplace/v/JHeilingbrunner.vscode-tiaportal-mcp.svg?label=Version&style=flat)](https://marketplace.visualstudio.com/items?itemName=JHeilingbrunner.vscode-tiaportal-mcp)
![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/JHeilingbrunner.vscode-tiaportal-mcp)

A Visual Studio Code extension to connect to Siemens TIA Portal and interact with TIA Portal projects directly from VS Code with GitHub Copilot.

## Requirements

- __Siemens TIA Portal V20__ installed and running on your machine
- __Siemens.Openness__ installed
- __net Framework 4.8__ installed
- __Visual Studio Code__ installed
- __GitHub Copilot__ in Visual Studio Code installed and configured (check: `Chat > Mcp: Enabled`)

## Chat Examples


```
Do the following steps:
- Connect to tia portal and open project from 'D:/Temp/TestProject1.als20'
- Export all blocks from plc software 'PC-System_1/Software PLC_1' to 'workspacefolder/Export'
- Export all types from plc software 'PC-System_1/Software PLC_1' to 'workspacefolder/Export'
- Close the project
- Disconnect from tia portal
```

```
Do the following steps:
- Connect to tia portal and open project from 'D:/Temp/TestProject1.als20'
- Give me the structure of the project as markdown with the exact words
- Close the project
- Disconnect from tia portal
```

```
Do the following steps:
- Connect to tia portal and open project from 'D:/Temp/TestProject1.als20'
- Compile plc software 'PLC_1'
- Close the project
- Disconnect from tia portal
```

## MCP-Server

- Refer to [tiaportal-mcp](https://github.com/heilingbrunner/tiaportal-mcp) 

## Features

- Connect to a TIA Portal instance
- Browse and interact with TIA Portal projects
- Perform basic project operations from within VS Code

## Requirements

- __.net Framework 4.8__ installed
- __Siemens TIA Portal V20__ installed and running on your machine
- Check if under `Environment Variables/User variable for user <name>` the variable `TiaPortalLocation` is set to `C:\Program Files\Siemens\Automation\Portal V20`. Details on [nuget.org - Siemens.Collaboration.Net.TiaPortal.Openness.Resolver](https://www.nuget.org/packages/Siemens.Collaboration.Net.TiaPortal.Openness.Resolver#readme-body-tab)
- User must be in Windows User Group `Siemens TIA Openness`. Details on [TIA Portal Openness - Adding Users to the Siemens TIA Openness User Group](https://docs.tia.siemens.cloud/r/en-us/v20/tia-portal-openness-api-for-automation-of-engineering-workflows/basics/installation/adding-users-to-the-siemens-tia-openness-user-group)


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
