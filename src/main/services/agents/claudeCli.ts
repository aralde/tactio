export type ChangeOp = 'rename' | 'move' | 'mkdir' | 'create' | 'edit' | 'delete';

export interface Change {
    op: ChangeOp;
    path: string;
    to?: string;
    detail?: string;
}

export interface Proposal {
    summary: string;
    changes: Change[];
    question?: string;
}

export interface Applied {
    done: Change[];
    failed: { change: Change; reason: string }[];
}

export interface ClaudeResult {
    sessionId?: string;
    output?: unknown;
    isError: boolean;
    text: string;
}

export const TRASH_DIR = '.tactio-trash';

const changeSchema = {
    type: 'object',
    properties: {
        op: { type: 'string', enum: ['rename', 'move', 'mkdir', 'create', 'edit', 'delete'] },
        path: { type: 'string' },
        to: { type: 'string' },
        detail: { type: 'string' }
    },
    required: ['op', 'path']
};

export const proposalSchema = {
    type: 'object',
    properties: {
        summary: { type: 'string' },
        changes: { type: 'array', items: changeSchema },
        question: { type: 'string' }
    },
    required: ['summary', 'changes']
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

export function proposePrompt(intent: string): string {
    return [
        'You work inside the current folder for a desktop app. The user asked:',
        '',
        intent,
        '',
        'Inspect the folder with your read-only tools and propose the exact changes that do this. Change nothing yet.',
        'Every path is relative to the current folder and stays inside it: no absolute paths, no "..".',
        'Ops: rename and move need "to"; mkdir, create, edit and delete need only "path"; use "detail" to say what an edit or create writes.',
        'If the request is ambiguous, ask one short question in "question" and leave "changes" empty.'
    ].join('\n');
}

export function refinePrompt(feedback: string): string {
    return [
        'The user answered or asked for changes to your proposal:',
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

export function proposeArgs(intent: string): string[] {
    return [...baseArgs(proposePrompt(intent), proposalSchema), '--tools', READ_TOOLS.join(',')];
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
    | { kind: 'start'; dir: string; intent: string }
    | { kind: 'answer'; id: string; text: string };

/** Reads `--agent <dir> --intent <text>` or `--agent-answer <id> <text>` from a command line. */
export function parseAgentCommand(argv: string[]): AgentCommand | undefined {
    const after = (flag: string) => {
        const i = argv.indexOf(flag);
        return i >= 0 ? argv.slice(i + 1) : undefined;
    };
    const answer = after('--agent-answer');
    if (answer && answer[0] && answer[1]) return { kind: 'answer', id: answer[0], text: answer[1] };
    const dir = after('--agent')?.[0];
    const intent = after('--intent')?.[0];
    if (dir && intent) return { kind: 'start', dir, intent };
    return undefined;
}

/** Places a native or npm install of Claude Code usually lands on Windows, checked after `where claude`. */
export function claudeCandidates(env: Record<string, string | undefined>): string[] {
    const out: string[] = [];
    if (env.USERPROFILE) out.push(`${env.USERPROFILE}\\.local\\bin\\claude.exe`);
    if (env.APPDATA) out.push(`${env.APPDATA}\\npm\\claude.cmd`);
    return out;
}
