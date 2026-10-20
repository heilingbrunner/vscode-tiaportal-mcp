import * as vscode from 'vscode';
import * as path from 'path';
import { TiaServerArgs } from './mcpConfig';

const TIA_MAJOR_VERSIONS = ['19', '20', '21'];
const DEFAULT_EXPORT_PATH = '${workspaceFolder}\\Project';

function nonEmpty(value: string): string | undefined {
    return value.trim() ? undefined : 'A value is required.';
}

/** Puts the current value first so it is the one preselected. */
function currentFirst(items: string[], current: string | undefined): vscode.QuickPickItem[] {
    const ordered = current && items.includes(current)
        ? [current, ...items.filter(i => i !== current)]
        : items;
    return ordered.map(label => ({ label, description: label === current ? 'current' : undefined }));
}

async function pickProjectPath(version: string, current: string | undefined): Promise<string | undefined> {
    const browse = 'Browse…';
    const choice = await vscode.window.showQuickPick(
        [
            ...(current ? [{ label: current, description: 'current' }] : []),
            { label: browse, description: `select a .ap${version} project or .als${version} session` }
        ],
        { title: 'TIA Portal project path (2/6)', ignoreFocusOut: true }
    );
    if (!choice) {
        return undefined;
    }
    if (choice.label !== browse) {
        return choice.label;
    }

    const picked = await vscode.window.showOpenDialog({
        title: 'Select TIA Portal project or session',
        canSelectMany: false,
        defaultUri: current ? vscode.Uri.file(path.dirname(current)) : undefined,
        filters: { 'TIA Portal': [`ap${version}`, `als${version}`] }
    });
    return picked?.[0]?.fsPath;
}

/** Asks for all server arguments. Returns undefined if the user cancels any step. */
export async function promptTiaServerArgs(defaults: Partial<TiaServerArgs>): Promise<TiaServerArgs | undefined> {
    const version = (await vscode.window.showQuickPick(
        currentFirst(TIA_MAJOR_VERSIONS, defaults.tiaMajorVersion),
        { title: 'TIA Portal major version (1/6)', ignoreFocusOut: true }
    ))?.label;
    if (!version) {
        return undefined;
    }

    const projectPath = await pickProjectPath(version, defaults.projectPath);
    if (!projectPath) {
        return undefined;
    }

    const softwarePath = await vscode.window.showInputBox({
        title: 'PLC software path (3/6)',
        prompt: 'Path of the PLC software in the project tree',
        value: defaults.softwarePath ?? '',
        placeHolder: 'PC-System_1/Software PLC_1',
        validateInput: nonEmpty,
        ignoreFocusOut: true
    });
    if (softwarePath === undefined) {
        return undefined;
    }

    const exportPath = await vscode.window.showInputBox({
        title: 'Export path (4/6)',
        prompt: 'Folder for exported sources',
        value: defaults.exportPath ?? DEFAULT_EXPORT_PATH,
        validateInput: nonEmpty,
        ignoreFocusOut: true
    });
    if (exportPath === undefined) {
        return undefined;
    }

    const preserve = (await vscode.window.showQuickPick(
        currentFirst(['Yes', 'No'], defaults.preservePath === undefined ? undefined : defaults.preservePath ? 'Yes' : 'No'),
        { title: 'Preserve path structure on export (--preserve-path) (5/6)', ignoreFocusOut: true }
    ))?.label;
    if (!preserve) {
        return undefined;
    }

    // Write access to the TIA Portal project is the riskier choice, so "No" is the default
    const allowWrite = (await vscode.window.showQuickPick(
        currentFirst(['No', 'Yes'], defaults.allowWrite === undefined ? undefined : defaults.allowWrite ? 'Yes' : 'No'),
        { title: 'Allow write access to the project (--allow-write) (6/6)', ignoreFocusOut: true }
    ))?.label;
    if (!allowWrite) {
        return undefined;
    }

    return {
        tiaMajorVersion: version,
        projectPath,
        softwarePath: softwarePath.trim(),
        exportPath: exportPath.trim(),
        preservePath: preserve === 'Yes',
        allowWrite: allowWrite === 'Yes'
    };
}
