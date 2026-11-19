const ROOT = 'HKCU\\Software\\Classes\\Directory';

// Right-clicking a folder passes it as %1; right-clicking the empty space inside one passes it as %V.
export const MENU_KEYS = [
    { key: `${ROOT}\\shell\\Tactio`, placeholder: '%1' },
    { key: `${ROOT}\\Background\\shell\\Tactio`, placeholder: '%V' }
];

export const MENU_LABEL = 'Ask the agent to…';

/** The launch command: the exe alone when packaged, or electron plus the app path in development. */
export function menuCommand(exe: string, appArg: string | undefined, placeholder: string): string {
    const app = appArg ? ` "${appArg}"` : '';
    return `"${exe}"${app} --agent "${placeholder}"`;
}

/** `reg` invocations that add the menu entries. */
export function addMenuCalls(exe: string, appArg?: string): string[][] {
    return MENU_KEYS.flatMap(({ key, placeholder }) => [
        ['add', key, '/ve', '/d', MENU_LABEL, '/f'],
        ['add', key, '/v', 'Icon', '/d', exe, '/f'],
        ['add', `${key}\\command`, '/ve', '/d', menuCommand(exe, appArg, placeholder), '/f']
    ]);
}

export function removeMenuCalls(): string[][] {
    return MENU_KEYS.map(({ key }) => ['delete', key, '/f']);
}
