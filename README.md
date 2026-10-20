# TIA-Portal MCP-Server

![vscode-tiaportal-mcp-logo](https://raw.githubusercontent.com/heilingbrunner/vscode-tiaportal-mcp/master/assets/vscode-tiaportal-mcp-logo.png)

![License](https://img.shields.io/github/license/heilingbrunner/vscode-tiaportal-mcp.svg?style=flat)
[![Version](https://img.shields.io/visual-studio-marketplace/v/JHeilingbrunner.vscode-tiaportal-mcp.svg?label=Version&style=flat)](https://marketplace.visualstudio.com/items?itemName=JHeilingbrunner.vscode-tiaportal-mcp)
![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/JHeilingbrunner.vscode-tiaportal-mcp)

A Visual Studio Code extension to connect to Siemens TIA Portal and interact with TIA Portal projects directly from VS Code with GitHub Copilot.

## Requirements

- __Siemens TIA Portal V21__ installed and running on your machine
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

### Project configuration

The extension only writes project-scoped files in the first workspace folder. User-level files (for example the VS Code user `mcp.json` or `claude_desktop_config.json`) are never touched.

| Client | File in the workspace folder | Format and key |
|---|---|---|
| GitHub Copilot | `.vscode\mcp.json` | JSON, `servers` |
| Anthropic Claude (Claude Code) | `.mcp.json` | JSON, `mcpServers` |
| Cursor | `.cursor\mcp.json` | JSON, `mcpServers` |
| OpenAI Codex | `.codex\config.toml` | TOML, `[mcp_servers.vscode-tiaportal-mcp]` |

These are the clients that run in VS Code or a VS Code fork, where this extension can be installed: GitHub Copilot, the Claude Code extension, Cursor and the Codex IDE extension. Cursor installs extensions from Open VSX, so this extension has to be installed there from the `.vsix` file unless it is published on Open VSX.

Notes on single clients:

- The export path is written exactly as you enter it, relative paths stay relative and `${workspaceFolder}` is not replaced. Not every client expands `${workspaceFolder}` (GitHub Copilot and Cursor do), so for Claude and Codex enter a relative path such as `Project` if the placeholder does not work there.
- Claude Code asks for approval the first time it sees a project-scoped server. Codex only loads `.codex\config.toml` for trusted projects.

#### Add server

- After installation restart VS Code.
- Run the command `TIA Portal: Add MCP Server Configuration` and tick the clients (checkboxes) you want to configure, then press `Enter`. The questions are asked once and the files of all ticked clients are written.
- Before the list is shown, the extension looks at the config files of all clients. Clients that already contain the server entry are ticked and marked `(already configured)` (in `Remove` as well), and the arguments of the first entry found are the default answers of the questions, even if you tick a different client. A file that cannot be parsed is ignored at this point and reported when you select its client.
- Answer the prompts (press `Esc` to cancel, nothing is written then). Values from an existing entry are offered as defaults:
   1. TIA Portal major version (`--tia-major-version`)
   2. Project or session file (`--project-path`)
   3. PLC software path (`--software-path`), e.g. `PC-System_1/Software PLC_1`
   4. Export path (`--export-path`), default `${workspaceFolder}\Project`
   5. Preserve path structure (`--preserve-path`)
- Check the written file (GitHub Copilot example below). Other servers and settings in the file are kept.
   - `<user>`: Your Windows username
   - `<version>`: The version of the extension you have installed.
    ```json
    {
        "servers": {
            "vscode-tiaportal-mcp": {
                "type": "stdio",
                "command": "c:\\Users\\<user>\\.vscode\\extensions\\jheilingbrunner.vscode-tiaportal-mcp-<version>\\srv\\net48\\TiaMcpServer.exe",
                "args": [
                    "--tia-major-version", "21",
                    "--project-path", "D:\\Siemens\\Projects\\MyProject\\MyProject.ap21",
                    "--software-path", "PC-System_1/Software PLC_1",
                    "--export-path", "${workspaceFolder}\\Project",
                    "--preserve-path"
                ],
                "env": {}
            }
        }
    }
    ```
    The Anthropic Claude and Cursor entries look the same under `"mcpServers"` (Cursor has no `"type"` field).
- Comments and trailing commas in the JSON files, and comments in `config.toml`, are allowed and are kept when the entry is added, updated or removed. If a file is not valid JSON or TOML the command stops with an error instead of overwriting it.

#### Use the server

- GitHub Copilot: open GitHub Copilot, switch to `Agent` mode, check the tools by `Select Tools` and start to chat with TIA Portal.
- Anthropic Claude: start Claude Code in the workspace folder and approve the project-scoped server `vscode-tiaportal-mcp` when asked (check with `/mcp`).
- Other clients: open the workspace folder in the tool; see its own MCP documentation for listing and enabling servers.

#### Remove server

- Run the command `TIA Portal: Remove MCP Server Configuration` and tick the clients (checkboxes) to remove the mcp server entry from their config files. The files of clients that are not ticked are not touched.

## License

MIT
