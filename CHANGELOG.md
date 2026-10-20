# Change Log

## [0.0.19] - 2026-10-20

- `Add` and `Remove MCP Server Configuration` ask which clients to use, with one checkbox each: `GitHub Copilot` (`.vscode/mcp.json`), `Anthropic Claude` (`.mcp.json`), `Cursor` (`.cursor/mcp.json`) and `OpenAI Codex` (`.codex/config.toml`); only project-scoped files in the workspace folder are used, and only for clients that run in VS Code or a VS Code fork
- `Add` asks its questions once for all ticked clients; every file is checked before anything is written
- existing config files are checked before the client list is shown: configured clients are pre-ticked and their arguments are the default answers
- JSON files may contain comments and trailing commas (JSONC), TOML may contain comments; they are preserved when the server entry is added, updated or removed
- `--export-path` is written exactly as entered: relative paths stay relative and `${workspaceFolder}` is not replaced
- `Add MCP Server Configuration` now asks interactively for the server arguments (`--tia-major-version`, `--project-path`, `--software-path`, `--export-path`, `--preserve-path`, `--allow-write`) and writes `type: stdio` entry; `--allow-write` is only written if you answer `Yes` (default `No`)
- extension update only refreshes the server `command` in `mcp.json`, user arguments are kept
- invalid `mcp.json` is no longer overwritten, errors are shown to the user
- update of [tiaportal-mcp](https://github.com/heilingbrunner/tiaportal-mcp) to the latest version

## [0.0.18] - 2025-09-30

- silent exceptions in Export functions fixed

## [0.0.17] - 2025-09-22

- bugfixes, export path fixed

## [0.0.16] - 2025-09-21

- bugfixes
- improved eception handling

## [0.0.15] - 2025-08-30

- prompts improved
- long running tasks as async tasks

## [0.0.14] - 2025-08-18

- better structure/tree format
- new GetSoftwareTree()
- bugfixes

## [0.0.13] - 2025-08-14

- logging integrated
- prompts added

## [0.0.12] - 2025-08-07

- export path fixed

## [0.0.11] - 2025-08-07

- project structure formatted as markdown code

## [0.0.10] - 2025-08-07

- tool responses improved

## [0.0.9] - 2025-08-04

- export of blocks and types with 'preservePath' option
- new tools
- some infos with attributes

## [0.0.8] - 2025-08-01

- improved jsonrpc responses
- updated dependencies

## [0.0.7] - 2025-07-18

- update `mcp.json` entry to use current installed version of TIA Portal MCP server from this extension

## [0.0.6] - 2025-07-16

- refactored code to use new TIA Portal API
- only blocks (OB/FB/FC/DB) and types (UDT) are now retrieved from the PLC software
- use regex to filter blocks and types
- import of blocks and types to PLC software

## [0.0.5] - 2025-07-11

- locating of plc software by softwarePath. This makes it possible to access plc software in groups/subgroups
- new tool: retrieving of project structure as text
- new tool: compile plc software

## [0.0.4] - 2025-06-30

- opens local session or projects, depending on project file extension

## [0.0.3] - 2025-06-23

- Release on Visual Studio Code Narketplace

## [0.0.2] - 2025-06-16

- Internal stuff

## [0.0.1] - 2025-06-05

- Initial release
- Deployment as VSCode-Extension

