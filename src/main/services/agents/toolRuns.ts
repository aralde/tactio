import { Change, TRASH_DIR, isInside } from './claudeCli';

/**
 * Programs a proposal may ask Tactio to run after approval, for conversions the agent can't do with
 * its file tools: images (HEIC→JPG), PDFs (merge, split, rotate), documents (MD→DOCX) and media.
 */
export const KNOWN_TOOLS = ['magick', 'qpdf', 'pandoc', 'ffmpeg'];

/** Flags a tool gets first so it never overwrites an existing file. */
export const SAFE_FLAGS: Record<string, string[]> = { ffmpeg: ['-n', '-hide_banner', '-loglevel', 'error'] };

export const isRun = (c: Change) => c.op === 'run';

/** A URL or protocol (`https:`, `msl:`), a response file (`@list.txt`) or a pipe. Windows drives are caught by isInside. */
const UNSAFE_ARG = /^[a-z][a-z0-9+.-]+:|^@|^\||[\r\n]/i;

/**
 * Why Tactio won't run this change, or undefined when it may: an installed tool, an output inside
 * the folder that is named in the arguments, and arguments that stay inside the folder.
 */
export function runProblem(change: Change, installed: string[]): string | undefined {
    if (!change.tool || !installed.includes(change.tool)) return `${change.tool || 'The tool'} is not one Tactio can run here (installed: ${installed.join(', ') || 'none'}).`;
    if (!change.to) return `Running ${change.tool} needs the new file it writes in "to".`;
    const args = change.args ?? [];
    if (!args.includes(change.to)) return `The output ${change.to} is not among ${change.tool}'s arguments.`;
    if (change.to.split(/[\\/]/)[0] === TRASH_DIR) return 'The output may not go into Tactio\'s trash.';
    for (const arg of args) {
        if (UNSAFE_ARG.test(arg)) return `The argument "${arg}" is not allowed.`;
        if (!arg.startsWith('-') && !isInside(arg)) return `The argument "${arg}" reaches outside the folder.`;
    }
    return undefined;
}

/** The first `run` change Tactio would refuse, with the reason. */
export function refusedRun(changes: Change[], installed: string[]): { change: Change; reason: string } | undefined {
    for (const change of changes.filter(isRun)) {
        const reason = runProblem(change, installed);
        if (reason) return { change, reason };
    }
    return undefined;
}

/** The arguments a run gets: the safety flags first, then the proposal's. */
export function runArgs(change: Change): string[] {
    return [...(SAFE_FLAGS[change.tool!] ?? []), ...(change.args ?? [])];
}
