import { AgentResult, AgentStep, standalonePrompt, stepSchema, writes } from './claudeCli';

/** The agent each run selects; it is defined inline in the run's config, so nothing is installed. */
export const OPENCODE_AGENT = 'tactio';

type Action = 'allow' | 'deny';
type Permission = Record<string, Action | Record<string, Action>>;

const SHELL: Record<string, Action> = { '*': 'deny', 'mv *': 'allow', 'mkdir *': 'allow', 'cp *': 'allow' };

/**
 * What a run may do: read the folder, and when it writes, edit files and run only mv, mkdir and cp.
 * Everything is allow or deny, because a permission that falls to ask stops a headless run. OpenCode
 * 1.x names the shell permission `bash` and v2 `shell`, so both are set.
 */
export function opencodePermission(write: boolean): Permission {
    const permission: Permission = { '*': 'deny', read: 'allow', list: 'allow', glob: 'allow', grep: 'allow', external_directory: 'deny' };
    if (write) Object.assign(permission, { edit: 'allow', bash: SHELL, shell: SHELL });
    return permission;
}

/** `opencode run` has no JSON schema flag, so the prompt asks for the object and the runner checks it. */
export function withSchema(prompt: string, schema: object): string {
    return `${prompt}\n\nWhen you are done, your final message must be only a JSON object that matches this JSON schema, with no other text and no code fence:\n\n${JSON.stringify(schema)}\n`;
}

/** What the runner sends, in the same session, when the agent finished without the object. */
export function schemaReminder(schema: object): string {
    return `Your last message was not the JSON object this run must end with. Reply now with only that JSON object, matching this JSON schema, with no other text and no code fence:\n\n${JSON.stringify(schema)}\n`;
}

/** With `resume`, the run continues that session with its message instead of starting on the step. */
export function opencodeArgs(step: AgentStep, model?: string, resume?: { sessionId: string; message: string }): string[] {
    const args = ['run', '--format', 'json', '--agent', OPENCODE_AGENT];
    args.push(...(resume ? ['--session', resume.sessionId] : ['--title', 'Tactio']));
    if (model) args.push('--model', model);
    args.push(resume ? resume.message : withSchema(standalonePrompt(step), stepSchema(step)));
    return args;
}

/** OpenCode takes its session folder from `PWD`, not from the process's working folder. */
export function opencodeEnv(step: AgentStep, cwd: string, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    const agent = { mode: 'primary', permission: opencodePermission(writes(step)) };
    return { ...env, PWD: cwd, OPENCODE_CONFIG_CONTENT: JSON.stringify({ agent: { [OPENCODE_AGENT]: agent } }) };
}

export interface OpencodeOutput {
    /** the last thing the agent wrote */
    text?: string;
    sessionId?: string;
    error?: string;
}

/** Reads `--format json`: one event per line, with a `text` event per message. */
export function parseOpencode(stdout: string): OpencodeOutput {
    const out: OpencodeOutput = {};
    for (const line of stdout.split('\n')) {
        if (!line.trim().startsWith('{')) continue;
        let event: { type?: string; sessionID?: string; part?: { text?: string }; error?: { data?: { message?: string } } | string };
        try {
            event = JSON.parse(line);
        } catch {
            continue;
        }
        if (event.sessionID) out.sessionId = event.sessionID;
        if (event.type === 'text' && event.part?.text?.trim()) out.text = event.part.text;
        if (event.type === 'error') {
            const e = event.error;
            out.error = typeof e === 'string' ? e : e?.data?.message ?? JSON.stringify(e);
        }
    }
    return out;
}

/** The JSON object in the agent's last message, tolerating a code fence or a sentence around it. */
export function extractObject(text: string | undefined): unknown {
    if (!text) return undefined;
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < start) return undefined;
    try {
        return JSON.parse(text.slice(start, end + 1));
    } catch {
        return undefined;
    }
}

interface Schema {
    required?: string[];
}

/** An object with the schema's required keys: what the task manager relies on. */
export function matchesSchema(value: unknown, schema: object): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    return ((schema as Schema).required ?? []).every(key => key in value);
}

/** The run's result, shaped like Claude's. */
export function opencodeResult(parsed: OpencodeOutput, schema: object): AgentResult {
    const output = extractObject(parsed.text);
    if (matchesSchema(output, schema)) return { sessionId: parsed.sessionId, output, isError: false, text: parsed.text ?? '' };
    const why = parsed.error ?? (parsed.text ? `OpenCode's answer does not match the expected result: ${parsed.text}` : 'OpenCode returned no result.');
    return { sessionId: parsed.sessionId, isError: true, text: why };
}
