import { execFile, spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AgentCli, AgentResult, AgentStep, CLI_NAMES, Change, TRASH_DIR, claudeArgs, cliCandidates, parseResult, stepSchema } from './claudeCli';
import { KNOWN_TOOLS, runArgs, runProblem } from './toolRuns';
import { opencodeArgs, opencodeEnv, opencodeResult, matchesSchema, extractObject, parseOpencode, schemaReminder } from './opencodeCli';
import { AGENT_FILE, LOGIN_FILES, REFRESHED_FILES, SETTINGS_FILE, agyAgent, agyArgs, agyEnv, agySettings, parseAgy } from './agyCli';

const RUN_TIMEOUT_MS = 30 * 60_000;

export interface Runner {
    /** `signal` stops the run: its process is killed and the promise rejects. */
    run(cwd: string, step: AgentStep, signal?: AbortSignal): Promise<AgentResult>;
}

export const STOPPED = 'Stopped before it finished.';

/**
 * Finds a CLI's binary: the path saved in settings, then `where <name>`, then the usual install
 * locations. On Windows only an `.exe` counts: a `.cmd` shim would need a shell, which mangles the
 * JSON arguments.
 */
export function resolveCliPath(cli: AgentCli, saved?: string): string | undefined {
    if (saved && fs.existsSync(saved)) return saved;
    const finder = process.platform === 'win32' ? 'where' : 'which';
    const found = spawnSync(finder, [cli], { encoding: 'utf8', timeout: 10_000, windowsHide: true });
    const listed = (found.stdout || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const runnable = (p: string) => process.platform !== 'win32' || /\.exe$/i.test(p);
    return cliCandidates(cli, listed, process.env).find(p => runnable(p) && fs.existsSync(p));
}

export const resolveClaudePath = (saved?: string) => resolveCliPath('claude', saved);

/** Why the agent can't run, or undefined when `<cli> --version` answers. */
export function cliProblem(cli: AgentCli, bin: string | undefined): Promise<string | undefined> {
    const name = CLI_NAMES[cli];
    if (!bin) return Promise.resolve(`${name} not found. Install it and sign in, or set its path in Settings.`);
    return new Promise(resolve => {
        execFile(bin, ['--version'], { timeout: 30_000, windowsHide: true }, err =>
            resolve(err ? `\`${bin} --version\` failed. Check the ${name} install.` : undefined));
    });
}

export interface Exit {
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
}

export function runProcess(bin: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number, signal?: AbortSignal): Promise<Exit> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new Error(STOPPED));
        const child = spawn(bin, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', d => (stdout += d));
        child.stderr.on('data', d => (stderr += d));
        const timer = setTimeout(() => child.kill(), Math.max(timeoutMs, 1));
        const stop = () => child.kill();
        signal?.addEventListener('abort', stop, { once: true });
        const done = () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', stop);
        };
        child.on('error', err => {
            done();
            reject(err);
        });
        child.on('close', (code, killedBy) => {
            done();
            if (signal?.aborted) reject(new Error(STOPPED));
            else resolve({ code, signal: killedBy, stdout, stderr });
        });
    });
}

const tooLong = (cli: AgentCli) => new Error(`${CLI_NAMES[cli]} took longer than 30 minutes and was stopped.`);

/** Runs a CLI after checking it answers; each subclass turns a step into its own run. */
abstract class CliRunner implements Runner {
    constructor(protected cli: AgentCli, private bin: () => string | undefined) {}

    async run(cwd: string, step: AgentStep, signal?: AbortSignal): Promise<AgentResult> {
        const bin = this.bin();
        const problem = await cliProblem(this.cli, bin);
        if (signal?.aborted) throw new Error(STOPPED);
        if (problem) throw new Error(problem);
        return this.runWith(bin!, cwd, step, signal);
    }

    protected abstract runWith(bin: string, cwd: string, step: AgentStep, signal?: AbortSignal): Promise<AgentResult>;
}

export class ClaudeRunner extends CliRunner {
    constructor(bin: () => string | undefined) {
        super('claude', bin);
    }

    protected async runWith(bin: string, cwd: string, step: AgentStep, signal?: AbortSignal): Promise<AgentResult> {
        const exit = await runProcess(bin, claudeArgs(step), cwd, process.env, RUN_TIMEOUT_MS, signal);
        if (exit.signal) throw tooLong(this.cli);
        const result = parseResult(exit.stdout);
        if (!result) throw new Error(`claude exited ${exit.code} without a result: ${(exit.stderr || exit.stdout).slice(-300)}`);
        return result;
    }
}

/**
 * `opencode run` with an agent defined inline whose permissions allow only what the step needs.
 * Smaller models sometimes end with a report instead of the object, so it is asked once more in the
 * same session.
 */
export class OpencodeRunner extends CliRunner {
    constructor(bin: () => string | undefined, private model: () => string | undefined) {
        super('opencode', bin);
    }

    protected async runWith(bin: string, cwd: string, step: AgentStep, signal?: AbortSignal): Promise<AgentResult> {
        const deadline = Date.now() + RUN_TIMEOUT_MS;
        const env = opencodeEnv(step, cwd);
        const schema = stepSchema(step);
        const model = this.model() || undefined;
        let exit = await runProcess(bin, opencodeArgs(step, model), cwd, env, RUN_TIMEOUT_MS, signal);
        let parsed = parseOpencode(exit.stdout);
        if (!exit.signal && exit.code === 0 && !parsed.error && parsed.sessionId && !matchesSchema(extractObject(parsed.text), schema)) {
            const resume = { sessionId: parsed.sessionId, message: schemaReminder(schema) };
            exit = await runProcess(bin, opencodeArgs(step, model, resume), cwd, env, deadline - Date.now(), signal);
            parsed = { ...parsed, ...parseOpencode(exit.stdout) };
        }
        if (exit.signal) throw tooLong(this.cli);
        if (!parsed.text && !parsed.error && exit.code !== 0) parsed.error = `opencode exited ${exit.code}: ${(exit.stderr || exit.stdout).slice(-300)}`;
        return opencodeResult(parsed, schema);
    }
}

/**
 * `agy -p` in a home of its own per run, removed afterwards: agy always loads the home's GEMINI.md
 * and settings and has no flag to skip them, and the step's permissions live in that settings file.
 * The home gets copies of the login files; a token the run refreshes is copied back.
 */
export class AgyRunner extends CliRunner {
    constructor(bin: () => string | undefined, private model: () => string | undefined, private realHome = os.homedir(), private start = runProcess) {
        super('agy', bin);
    }

    protected async runWith(bin: string, cwd: string, step: AgentStep, signal?: AbortSignal): Promise<AgentResult> {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tactio-agy-'));
        const write = (rel: string, content: string) => {
            fs.mkdirSync(path.dirname(path.join(home, rel)), { recursive: true });
            fs.writeFileSync(path.join(home, rel), content);
        };
        try {
            for (const rel of LOGIN_FILES) {
                const real = path.join(this.realHome, rel);
                if (fs.existsSync(real)) write(rel, fs.readFileSync(real, 'utf8'));
            }
            write(SETTINGS_FILE, JSON.stringify(agySettings(step, cwd)));
            write(AGENT_FILE, agyAgent(step));
            const exit = await this.start(bin, agyArgs(step, this.model() || undefined), cwd, agyEnv(home), RUN_TIMEOUT_MS, signal);
            const result = parseAgy(exit.stdout, exit.stderr);
            if (exit.signal || /stopped before it finished/.test(result.text)) throw tooLong(this.cli);
            return result;
        } finally {
            this.copyBackLogin(home);
            fs.rmSync(home, { recursive: true, force: true });
        }
    }

    private copyBackLogin(home: string) {
        for (const rel of REFRESHED_FILES) {
            const used = path.join(home, rel);
            const real = path.join(this.realHome, rel);
            if (!fs.existsSync(used) || !fs.existsSync(real)) continue;
            const content = fs.readFileSync(used, 'utf8');
            if (content !== fs.readFileSync(real, 'utf8')) fs.writeFileSync(real, content);
        }
    }
}

/** Runs the tools a proposal's `run` changes name, and puts their outputs in the trash on undo. */
export interface ToolRunner {
    installed(): string[];
    run(cwd: string, change: Change): Promise<void>;
    undo(cwd: string, taskId: string, change: Change): Promise<void>;
}

const TOOL_TIMEOUT_MS = 10 * 60_000;
const TOOL_CACHE_MS = 5 * 60_000;

/** The tools found with `where`, looked up again every few minutes so a fresh install shows up. */
export class LocalTools implements ToolRunner {
    private found = new Map<string, string>();
    private checkedAt = 0;

    installed(): string[] {
        return [...this.lookup().keys()];
    }

    async run(cwd: string, change: Change): Promise<void> {
        const problem = runProblem(change, this.installed());
        if (problem) throw new Error(problem);
        const out = path.join(cwd, change.to!);
        if (fs.existsSync(out)) throw new Error(`${change.to} already exists.`);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        const exit = await runProcess(this.lookup().get(change.tool!)!, runArgs(change), cwd, process.env, TOOL_TIMEOUT_MS);
        if (exit.signal) throw new Error(`${change.tool} took longer than 10 minutes and was stopped.`);
        if (exit.code !== 0) throw new Error(`${change.tool} exited ${exit.code}: ${(exit.stderr || exit.stdout).trim().slice(-300)}`);
        if (!fs.existsSync(out)) throw new Error(`${change.tool} finished without writing ${change.to}.`);
    }

    async undo(cwd: string, taskId: string, change: Change): Promise<void> {
        const out = path.join(cwd, change.to!);
        if (!fs.existsSync(out)) return;
        const kept = path.join(cwd, TRASH_DIR, taskId, change.to!);
        fs.mkdirSync(path.dirname(kept), { recursive: true });
        fs.renameSync(out, kept);
    }

    private lookup(): Map<string, string> {
        if (Date.now() - this.checkedAt < TOOL_CACHE_MS) return this.found;
        this.found = new Map();
        for (const tool of KNOWN_TOOLS) {
            const bin = resolveTool(tool);
            if (bin) this.found.set(tool, bin);
        }
        this.checkedAt = Date.now();
        return this.found;
    }
}

function resolveTool(tool: string): string | undefined {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    const found = spawnSync(finder, [tool], { encoding: 'utf8', timeout: 10_000, windowsHide: true });
    const runnable = (p: string) => process.platform !== 'win32' || /\.exe$/i.test(p);
    return (found.stdout || '').split(/\r?\n/).map(l => l.trim()).find(p => p && runnable(p) && fs.existsSync(p));
}
