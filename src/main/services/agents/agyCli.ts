import * as fs from 'fs';
import * as path from 'path';
import { AgentResult, AgentStep, standalonePrompt, stepSchema, writes } from './claudeCli';

/** The custom agent each run selects; it is written into the run's own home. */
export const AGY_AGENT = 'tactio';

const READ_TOOLS = ['finish', 'view_file', 'list_dir', 'grep_search', 'find_by_name'];
const WRITE_TOOLS = [...READ_TOOLS, 'write_to_file', 'replace_file_content', 'multi_replace_file_content', 'run_command'];

/** The programs a run that writes may start. */
export const AGY_COMMANDS = ['cp', 'mkdir', 'mv'];

/**
 * What a run's home copies from the real one: the login, and nothing else, so personal rules
 * (~/.gemini/GEMINI.md) and settings stay out. `finish` is how agy hands back the structured result.
 */
export const LOGIN_FILES = [
    '.gemini/oauth_creds.json',
    '.gemini/google_accounts.json',
    '.gemini/settings.json',
    '.gemini/antigravity-cli/installation_id',
    '.gemini/antigravity-cli/antigravity-oauth-token'
];

/** Login files a run may refresh, copied back to the real home when they changed. */
export const REFRESHED_FILES = ['.gemini/oauth_creds.json', '.gemini/antigravity-cli/antigravity-oauth-token'];

export const SETTINGS_FILE = '.gemini/antigravity-cli/settings.json';
export const AGENT_FILE = `.gemini/config/agents/${AGY_AGENT}.md`;

const escape = (c: string) => (c === ' ' ? '\\x20' : c.replace(/[\\^$.|?*+()[\]{}-]/g, '\\$&'));

/**
 * A regex for every program that isn't one of `programs`, without lookahead (agy's matcher has
 * none): each stem of an allowed name followed by any other character. One flat alternation.
 */
export function otherCommands(programs: string[]): string {
    const alternatives = new Set<string>();
    const stems = new Set<string>();
    for (const p of programs) for (let i = 0; i <= p.length; i++) stems.add(p.slice(0, i));
    for (const stem of stems) {
        const head = [...stem].map(escape).join('');
        if (programs.includes(stem)) {
            alternatives.add(`${head}\\S.*`);
            continue;
        }
        const next = [...new Set(programs.filter(p => p.startsWith(stem) && p.length > stem.length).map(p => p[stem.length]))];
        alternatives.add(`${head}[^${next.map(escape).join('')}].*`);
        if (stem) alternatives.add(head);
    }
    return `^(?:${[...alternatives].join('|')})$`;
}

const listDir = (dir: string): string[] => {
    try {
        return fs.readdirSync(dir);
    } catch {
        return [];
    }
};

/** agy writes rule paths with forward slashes, `C:/Users/...`. */
const slashed = (p: string) => p.replace(/\\/g, '/');

/**
 * File rules that keep file tools inside `cwd`. A read outside it would fall to ask and end the run,
 * so everything beside the way down is denied piece by piece (a deny only refuses that read), and the
 * folders on the way may be read, so a run that lists one goes on. File rules take no wildcard, and a
 * deny on a parent would also cover the folder under it.
 */
export function fileRules(cwd: string, list: (dir: string) => string[] = listDir): { allow: string[]; deny: string[] } {
    const kept = path.resolve(cwd);
    const ancestors: string[] = [];
    for (let p = path.dirname(kept); ; p = path.dirname(p)) {
        ancestors.push(p);
        if (p === path.dirname(p)) break;
    }
    const onTheWay = new Set([kept, ...ancestors].map(p => p.toLowerCase()));
    const beside = ancestors.flatMap(dir => list(dir).map(name => path.join(dir, name))).filter(p => !onTheWay.has(p.toLowerCase()));
    return {
        allow: [kept, ...ancestors].map(p => `read_file(${slashed(p)})`),
        deny: beside.sort().map(p => `read_file(${slashed(p)})`)
    };
}

/**
 * The run's settings. Every rule is allow or deny: in headless mode a permission that falls to ask
 * ends the run with no result. Files stay inside the folder; a run that writes may start only mv,
 * mkdir and cp.
 */
export function agySettings(step: AgentStep, cwd: string, list?: (dir: string) => string[]): object {
    const files = fileRules(cwd, list);
    const allow = [...files.allow];
    const deny = ['execute_url(*)', 'mcp(*)', 'read_url(*)', ...files.deny];
    if (writes(step)) {
        allow.push(`write_file(${cwd})`, ...AGY_COMMANDS.map(c => `command(${c})`));
        deny.push(`command(regex:${otherCommands(AGY_COMMANDS)})`);
    } else {
        deny.push('command(*)');
    }
    return { toolPermission: 'request-review', allowNonWorkspaceAccess: false, permissions: { allow, deny }, trustedWorkspaces: [cwd] };
}

/** The custom agent the run selects with `--agent`: only these tools exist for it. */
export function agyAgent(step: AgentStep): string {
    const tools = writes(step) ? WRITE_TOOLS : READ_TOOLS;
    return ['---', `name: ${AGY_AGENT}`, 'description: Works in one folder for Tactio', `tools: [${tools.join(', ')}]`, '---', ''].join('\n');
}

export function agyArgs(step: AgentStep, model?: string): string[] {
    const args = ['-p', standalonePrompt(step), '--output-format', 'stream-json', '--json-schema', JSON.stringify(stepSchema(step)), '--disable-slash-commands', '--agent', AGY_AGENT];
    if (model) args.push('--model', model);
    return args;
}

/** The environment of a run whose home is `home`: updates off and no browser, so a lapsed login fails instead of waiting. */
export function agyEnv(home: string, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    return { ...env, HOME: home, USERPROFILE: home, AGY_CLI_DISABLE_AUTO_UPDATE: 'true', BROWSER: 'false' };
}

interface AgyEvent {
    event?: string;
    conversation_id?: string;
    result?: {
        error?: string;
        status?: string;
        response?: string;
        structured_output?: unknown;
        conversation_id?: string;
        denied_actions?: { action?: string }[];
    };
}

/** Reads `--output-format stream-json`: an `init` event, a `step_update` per step and a final `result`. */
export function parseAgy(stdout: string, stderr = ''): AgentResult {
    let result: AgyEvent['result'];
    let sessionId: string | undefined;
    for (const line of stdout.split('\n')) {
        if (!line.trim().startsWith('{')) continue;
        let event: AgyEvent;
        try {
            event = JSON.parse(line);
        } catch {
            continue;
        }
        sessionId = event.result?.conversation_id ?? event.conversation_id ?? sessionId;
        if (event.event === 'result' && event.result) result = event.result;
    }
    const output = result?.structured_output;
    if (result?.status === 'SUCCESS' && output !== undefined && output !== null) {
        return { sessionId, output, isError: false, text: result.response ?? '' };
    }
    const denied = (result?.denied_actions ?? []).flatMap(a => a.action ?? []);
    const why = result?.error === 'interrupted' ? 'Antigravity was stopped before it finished.'
        : denied.length ? `Antigravity was refused the ${denied.join(', ')} permission.`
        : result?.status ? `Antigravity ended with ${result.status}: ${result.response ?? ''}`
        : `Antigravity returned no result: ${(stderr || stdout).slice(-300)}`;
    return { sessionId, isError: true, text: why };
}
