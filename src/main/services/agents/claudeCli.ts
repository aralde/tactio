export type ChangeOp = 'rename' | 'move' | 'mkdir' | 'create' | 'edit' | 'delete' | 'run';

export interface Change {
    op: ChangeOp;
    path: string;
    to?: string;
    detail?: string;
    /** `run` only: the program Tactio runs after approval, from the tools it found installed */
    tool?: string;
    /** `run` only: its arguments, with paths relative to the folder */
    args?: string[];
}

export interface Question {
    question: string;
    hint?: string;
    options: string[];
}

export interface Proposal {
    summary: string;
    plan: string[];
    changes: Change[];
    questions?: Question[];
    /** the reply to a question about the folder, in Markdown, when nothing needs to change */
    answer?: string;
}

export interface Applied {
    done: Change[];
    failed: { change: Change; reason: string }[];
}

export interface AgentResult {
    sessionId?: string;
    output?: unknown;
    isError: boolean;
    text: string;
}

/** Claude's result is the shape every runner returns. */
export type ClaudeResult = AgentResult;

/** The command-line agents Tactio can drive. */
export type AgentCli = 'claude' | 'opencode' | 'agy';

export const AGENT_CLIS: AgentCli[] = ['claude', 'opencode', 'agy'];

export const CLI_NAMES: Record<AgentCli, string> = { claude: 'Claude Code', opencode: 'OpenCode', agy: 'Antigravity CLI' };

export function isAgentCli(value: unknown): value is AgentCli {
    return typeof value === 'string' && (AGENT_CLIS as string[]).includes(value);
}

/**
 * One run of the agent. `sessionId` lets Claude resume its own conversation; the other CLIs get
 * everything the run needs in its prompt, so `request` and `previous` travel with a refine.
 */
export type AgentStep =
    | { kind: 'propose'; request: string; tools?: string[] }
    | { kind: 'refine'; request: string; feedback: string; previous?: Proposal; sessionId?: string; tools?: string[] }
    | { kind: 'apply'; taskId: string; changes: Change[]; sessionId?: string }
    | { kind: 'undo'; taskId: string; done: Change[]; sessionId?: string };

export const TRASH_DIR = '.tactio-trash';

/** Where Tactio leaves what it read for the agent: the folder's inventory and the text of Office files. */
export const CONTEXT_DIR = `${TRASH_DIR}/context`;

const changeSchema = {
    type: 'object',
    properties: {
        op: { type: 'string', enum: ['rename', 'move', 'mkdir', 'create', 'edit', 'delete', 'run'] },
        path: { type: 'string' },
        to: { type: 'string' },
        detail: { type: 'string' },
        tool: { type: 'string' },
        args: { type: 'array', items: { type: 'string' } }
    },
    required: ['op', 'path']
};

export const proposalSchema = {
    type: 'object',
    properties: {
        summary: { type: 'string' },
        plan: { type: 'array', items: { type: 'string' } },
        changes: { type: 'array', items: changeSchema },
        answer: { type: 'string' },
        questions: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    question: { type: 'string' },
                    hint: { type: 'string' },
                    options: { type: 'array', items: { type: 'string' } }
                },
                required: ['question', 'options']
            }
        }
    },
    required: ['summary', 'plan', 'changes']
};

export const appliedSchema = {
    type: 'object',
    properties: {
        done: { type: 'array', items: changeSchema },
        failed: {
            type: 'array',
            items: {
                type: 'object',
                properties: { change: changeSchema, reason: { type: 'string' } },
                required: ['change', 'reason']
            }
        }
    },
    required: ['done', 'failed']
};

const READ_TOOLS = ['Read', 'Glob', 'Grep'];

// Shell access is limited to moving and copying; deletes go to the trash folder so they can be undone.
export const WRITE_TOOLS = [...READ_TOOLS, 'Write', 'Edit', 'Bash(mv *)', 'Bash(mkdir *)', 'Bash(cp *)'];

const ISOLATED_SETTINGS = JSON.stringify({ attribution: { commit: '', pr: '' } });

function baseArgs(prompt: string, schema: object, resume?: string): string[] {
    const args = [
        '-p', prompt,
        '--output-format', 'json',
        '--json-schema', JSON.stringify(schema),
        '--setting-sources', 'project,local',
        '--settings', ISOLATED_SETTINGS
    ];
    if (resume) args.push('--resume', resume);
    return args;
}

/** What the prompt says about `run` changes: the tools Tactio found, or that there are none. */
function toolRules(tools: string[]): string[] {
    if (!tools.length) return ['No conversion tools are installed, so propose no "run" changes; if one is needed, say in "answer" what the user could install.'];
    return [
        `To convert, merge, split or rotate files, propose "run" changes. Tactio runs them itself after the user approves, after every other change. Installed tools: ${tools.join(', ')}.`,
        'A "run" change has "tool", "args" (relative paths, no shell syntax, no URLs), "path" (the main input) and "to" (the new file it writes, which must not exist yet). Never overwrite or delete the inputs.'
    ];
}

export function proposePrompt(request: string, tools: string[] = []): string {
    return [
        'You work inside the current folder for a desktop app. The user asked:',
        '',
        request,
        '',
        'Inspect the folder with your read-only tools and work out how to do this. Change nothing yet.',
        `Tactio left ${CONTEXT_DIR}/inventory.tsv: every file with its size in bytes, when it was modified and, for files that share a size, a sha256 hash (equal hashes are exact duplicates). The text of Word, Excel and PowerPoint files is under ${CONTEXT_DIR}/text/. Use them, and never list anything under ${TRASH_DIR} as a change.`,
        'If the user asks a question or wants to know something, reply in "answer" in Markdown, in the language they wrote in, and leave "changes" empty. Write a file only when they ask for one.',
        ...toolRules(tools),
        '"summary" is a title of at most 12 words saying what you will do. "plan" is 2 to 6 short, plain steps saying what you will do, not how.',
        '"changes" lists every exact change. Paths are relative to the current folder and stay inside it: no absolute paths, no "..".',
        'Ops: rename and move need "to"; mkdir, create, edit and delete need only "path"; use "detail" to say what an edit or create writes.',
        'If a choice would change the result a lot, ask about it in "questions" (at most 3), each with 2 to 4 short options, and leave "changes" empty.',
        'Ask nothing you can decide from the files themselves.'
    ].join('\n');
}

export function refinePrompt(feedback: string): string {
    return [
        'The user answered your questions or asked for changes to your plan:',
        '',
        feedback,
        '',
        'Propose again with the same rules. Change nothing yet.'
    ].join('\n');
}

export function applyPrompt(taskId: string, changes: Change[]): string {
    return [
        'The user approved these changes. Apply exactly these, in order, and nothing else:',
        '',
        JSON.stringify(changes, null, 2),
        '',
        `Before an edit or a delete, copy the original file to ${TRASH_DIR}/${taskId}/<its path>. A delete moves the file there instead of removing it.`,
        'Report each change you made in "done" and each one you could not make in "failed" with the reason.'
    ].join('\n');
}

export function undoPrompt(taskId: string, done: Change[]): string {
    return [
        'Revert these changes you applied, in reverse order:',
        '',
        JSON.stringify(done, null, 2),
        '',
        `Originals of edited and deleted files are in ${TRASH_DIR}/${taskId}/. Restore them from there.`,
        'Report each reverted change in "done" and each one you could not revert in "failed" with the reason.'
    ].join('\n');
}

export function proposeArgs(request: string, tools: string[] = []): string[] {
    return [...baseArgs(proposePrompt(request, tools), proposalSchema), '--tools', READ_TOOLS.join(',')];
}

export function refineArgs(sessionId: string, feedback: string): string[] {
    return [...baseArgs(refinePrompt(feedback), proposalSchema, sessionId), '--tools', READ_TOOLS.join(',')];
}

// Each shell command is checked against WRITE_TOOLS as a whole, so a leading `cd` or a chain is denied.
const SHELL_RULES = 'You are already in the folder. Run one mv, mkdir or cp per shell command with relative paths: no cd, no &&, no ;.';

function writeArgs(prompt: string, sessionId: string): string[] {
    return [...baseArgs(`${prompt}\n${SHELL_RULES}`, appliedSchema, sessionId), '--permission-mode', 'dontAsk', '--allowedTools', ...WRITE_TOOLS];
}

export function applyArgs(taskId: string, sessionId: string, changes: Change[]): string[] {
    return writeArgs(applyPrompt(taskId, changes), sessionId);
}

export function undoArgs(taskId: string, sessionId: string, done: Change[]): string[] {
    return writeArgs(undoPrompt(taskId, done), sessionId);
}

export const writes = (step: AgentStep) => step.kind === 'apply' || step.kind === 'undo';

export function stepSchema(step: AgentStep): object {
    return writes(step) ? appliedSchema : proposalSchema;
}

/** The arguments `claude -p` gets for a step; refine, apply and undo resume the proposing session. */
export function claudeArgs(step: AgentStep): string[] {
    const session = (id?: string) => {
        if (!id) throw new Error('This task has no Claude session to continue. Retry it.');
        return id;
    };
    switch (step.kind) {
        case 'propose': return proposeArgs(step.request, step.tools);
        case 'refine': return refineArgs(session(step.sessionId), step.feedback);
        case 'apply': return applyArgs(step.taskId, session(step.sessionId), step.changes);
        case 'undo': return undoArgs(step.taskId, session(step.sessionId), step.done);
    }
}

/** A refine for a CLI that starts fresh each run: the request and the last proposal come along. */
export function standaloneRefinePrompt(request: string, feedback: string, previous?: Proposal, tools: string[] = []): string {
    const lines = [proposePrompt(request, tools), ''];
    if (previous) lines.push('Your previous proposal was:', '', JSON.stringify(previous, null, 2), '');
    lines.push('The user answered your questions or asked for changes to it:', '', feedback, '', 'Propose again with the same rules. Change nothing yet.');
    return lines.join('\n');
}

/** The whole prompt for a step, for CLIs that don't resume Claude's session. */
export function standalonePrompt(step: AgentStep): string {
    switch (step.kind) {
        case 'propose': return proposePrompt(step.request, step.tools);
        case 'refine': return standaloneRefinePrompt(step.request, step.feedback, step.previous, step.tools);
        case 'apply': return `${applyPrompt(step.taskId, step.changes)}\n${SHELL_RULES}`;
        case 'undo': return `${undoPrompt(step.taskId, step.done)}\n${SHELL_RULES}`;
    }
}

const AUTH_ERROR = /oauth|failed to authenticate|not logged in|please run \/login|invalid api key|api key has expired|unauthorized/i;

const LOGIN_HELP: Record<AgentCli, string> = {
    claude: 'Your Claude Code login expired or is missing. Open a terminal, run `claude` and use /login, then retry.',
    opencode: 'Your OpenCode login or API key expired or is missing. Open a terminal, run `opencode auth login`, then retry.',
    agy: 'Your Antigravity login expired or is missing. Open a terminal, run `agy` once and sign in, then retry.'
};

/** Turns the agent's failure text into something the user can act on. */
export function friendlyError(text: string, cli: AgentCli = 'claude'): string {
    if (AUTH_ERROR.test(text)) return LOGIN_HELP[cli];
    return text;
}

/** Reads the single JSON object `--output-format json` prints at the end of a run. */
export function parseResult(stdout: string): ClaudeResult | undefined {
    const line = stdout.trim().split('\n').reverse().find(l => l.trim().startsWith('{'));
    if (!line) return undefined;
    try {
        const raw = JSON.parse(line);
        return {
            sessionId: typeof raw.session_id === 'string' ? raw.session_id : undefined,
            output: raw.structured_output,
            isError: Boolean(raw.is_error),
            text: String(raw.result ?? '')
        };
    } catch {
        return undefined;
    }
}

export function isInside(p: string | undefined): boolean {
    if (p === undefined) return true;
    if (!p.trim() || /^[a-zA-Z]:/.test(p) || /^[\\/]/.test(p)) return false;
    return !p.split(/[\\/]/).includes('..');
}

/** The first change that would leave the folder, so a proposal that does is refused before anyone approves it. */
export function outsideChange(changes: Change[]): Change | undefined {
    return changes.find(c => !isInside(c.path) || !isInside(c.to));
}

const key = (c: Change) => `${c.op}|${c.path}|${c.to ?? ''}`;

const inTrash = (p: string) => p.split(/[\\/]/)[0] === TRASH_DIR;

/** Changes the agent reports as done that were not in what the user approved, leaving out its trash backups. */
export function unexpectedChanges(approved: Change[], done: Change[]): Change[] {
    const allowed = new Set(approved.map(key));
    return done.filter(c => !allowed.has(key(c)) && !inTrash(c.path));
}

export type AgentCommand =
    | { kind: 'open'; dir: string }
    | { kind: 'start'; dir: string; request: string }
    | { kind: 'answer'; id: string; text: string };

/**
 * Reads `--agent <dir>` (the folder menu: open the agent panel there), `--agent <dir> --request <text>`
 * or `--agent-answer <id> <text>` from a command line.
 */
export function parseAgentCommand(argv: string[]): AgentCommand | undefined {
    // Accepts `--flag=value` and `--flag value`; a following `--switch` (Chromium adds some) is never a value.
    const values = (flag: string, count: number): string[] | undefined => {
        const joined = argv.find(a => a.startsWith(`${flag}=`));
        const i = argv.indexOf(flag);
        if (joined === undefined && i < 0) return undefined;
        const rest = joined !== undefined ? [joined.slice(flag.length + 1), ...argv.slice(argv.indexOf(joined) + 1)] : argv.slice(i + 1);
        const taken = rest.slice(0, count);
        return taken.length === count && taken.every(v => v && !v.startsWith('--')) ? taken : undefined;
    };
    const answer = values('--agent-answer', 2);
    if (answer) return { kind: 'answer', id: answer[0], text: answer[1] };
    const dir = values('--agent', 1)?.[0];
    // `--intent` was the flag's earlier name; launchers made with it keep working.
    const request = values('--request', 1)?.[0] ?? values('--intent', 1)?.[0];
    if (dir && request) return { kind: 'start', dir, request };
    if (dir) return { kind: 'open', dir };
    return undefined;
}

/** Places a native or npm install of Claude Code usually lands on Windows, checked after `where claude`. */
export function claudeCandidates(env: Record<string, string | undefined>): string[] {
    const out: string[] = [];
    if (env.USERPROFILE) out.push(`${env.USERPROFILE}\\.local\\bin\\claude.exe`);
    if (env.APPDATA) out.push(`${env.APPDATA}\\npm\\claude.cmd`);
    return out;
}

/**
 * Where each CLI's binary may be, after what `where <name>` lists. An npm install of OpenCode lists
 * a `.cmd` shim, which would need a shell that mangles the JSON arguments, so the real
 * `opencode.exe` beside it in `node_modules` is listed instead.
 */
export function cliCandidates(cli: AgentCli, listed: string[], env: Record<string, string | undefined>): string[] {
    if (cli === 'claude') return [...listed, ...claudeCandidates(env)];
    if (cli === 'agy') return [...listed, ...(env.LOCALAPPDATA ? [`${env.LOCALAPPDATA}\\agy\\bin\\agy.exe`] : [])];
    const shims = listed.flatMap(p => {
        const dir = p.replace(/[\\/][^\\/]+$/, '');
        return dir === p ? [] : [`${dir}\\node_modules\\opencode-ai\\bin\\opencode.exe`];
    });
    const home = env.USERPROFILE ? [`${env.USERPROFILE}\\.opencode\\bin\\opencode.exe`] : [];
    return [...listed, ...shims, ...home];
}

/** Tasks and schedules saved before the field was renamed call it `intent`. */
export function withRequest<T extends { request: string }>(saved: T & { intent?: string }): T {
    if (saved.request === undefined && saved.intent !== undefined) {
        const { intent, ...rest } = saved;
        return { ...rest, request: intent } as unknown as T;
    }
    return saved;
}
