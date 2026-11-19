import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import { claudeCandidates, parseResult, ClaudeResult } from './claudeCli';

const RUN_TIMEOUT_MS = 30 * 60_000;

export interface Runner {
    run(cwd: string, args: string[]): Promise<ClaudeResult>;
}

/**
 * Finds the `claude` binary: the path saved in settings, then `where claude`, then the usual install
 * locations. A `.cmd` shim is skipped because it would need a shell, which mangles the JSON arguments.
 */
export function resolveClaudePath(saved?: string): string | undefined {
    if (saved && fs.existsSync(saved)) return saved;
    const finder = process.platform === 'win32' ? 'where' : 'which';
    const found = spawnSync(finder, ['claude'], { encoding: 'utf8', timeout: 10_000 });
    const listed = (found.stdout || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const candidates = [...listed, ...claudeCandidates(process.env)];
    return candidates.find(p => fs.existsSync(p) && !/\.(cmd|bat)$/i.test(p));
}

/** Why the agent can't run, or undefined when `claude --version` answers. */
export function claudeProblem(bin: string | undefined): string | undefined {
    if (!bin) return 'Claude Code not found. Install it and sign in, or set its path in Settings.';
    const out = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 30_000 });
    if (out.error || out.status !== 0) return `\`${bin} --version\` failed. Check the Claude Code install.`;
    return undefined;
}

export class ClaudeRunner implements Runner {
    constructor(private bin: () => string | undefined) {}

    run(cwd: string, args: string[]): Promise<ClaudeResult> {
        const bin = this.bin();
        const problem = claudeProblem(bin);
        if (problem) return Promise.reject(new Error(problem));

        return new Promise((resolve, reject) => {
            const child = spawn(bin!, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', d => (stdout += d));
            child.stderr.on('data', d => (stderr += d));
            const timer = setTimeout(() => child.kill(), RUN_TIMEOUT_MS);
            child.on('error', err => {
                clearTimeout(timer);
                reject(err);
            });
            child.on('close', (code, signal) => {
                clearTimeout(timer);
                if (signal) return reject(new Error('Claude took longer than 30 minutes and was stopped.'));
                const result = parseResult(stdout);
                if (!result) return reject(new Error(`claude exited ${code} without a result: ${(stderr || stdout).slice(-300)}`));
                resolve(result);
            });
        });
    }
}
