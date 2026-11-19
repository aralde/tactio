import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { AgentResult, AgentStep, CONTEXT_DIR, TRASH_DIR } from './claudeCli';
import { Runner } from './agentRunners';

const SKIP_DIRS = new Set([TRASH_DIR, '.git', 'node_modules']);
const MAX_FILES = 5000;
const MAX_HASH_FILE = 1024 ** 3;
const MAX_HASH_TOTAL = 8 * 1024 ** 3;
const OFFICE = /\.(docx|xlsx|pptx)$/i;
const MAX_OFFICE_FILES = 100;
const MAX_OFFICE_BYTES = 50 * 1024 ** 2;
const MAX_TEXT = 300_000;

export interface Entry {
    /** relative to the folder, with forward slashes */
    path: string;
    size: number;
    modified: string;
    sha256?: string;
}

/** Every file under `dir`, up to MAX_FILES, leaving out Tactio's trash and the usual heavy folders. */
export function listFiles(dir: string): Entry[] {
    const out: Entry[] = [];
    const walk = (rel: string) => {
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entries) {
            if (out.length >= MAX_FILES) return;
            const child = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) {
                if (!SKIP_DIRS.has(e.name)) walk(child);
            } else if (e.isFile()) {
                try {
                    const st = fs.statSync(path.join(dir, child));
                    out.push({ path: child, size: st.size, modified: st.mtime.toISOString().slice(0, 16).replace('T', ' ') });
                } catch {
                    // A file that vanished or can't be read is left out.
                }
            }
        }
    };
    walk('');
    return out;
}

/** Files worth hashing: only a file that shares its size with another can be an exact duplicate. */
export function hashCandidates(entries: Entry[]): Entry[] {
    const bySize = new Map<number, number>();
    for (const e of entries) bySize.set(e.size, (bySize.get(e.size) ?? 0) + 1);
    let total = 0;
    return entries
        .filter(e => e.size > 0 && e.size <= MAX_HASH_FILE && (bySize.get(e.size) ?? 0) > 1)
        .sort((a, b) => a.size - b.size)
        .filter(e => (total += e.size) <= MAX_HASH_TOTAL);
}

function sha256(file: string): Promise<string | undefined> {
    return new Promise(resolve => {
        const hash = createHash('sha256');
        fs.createReadStream(file)
            .on('data', d => hash.update(d))
            .on('end', () => resolve(hash.digest('hex')))
            .on('error', () => resolve(undefined));
    });
}

export function inventoryTsv(entries: Entry[]): string {
    const rows = entries.map(e => [e.path, e.size, e.modified, e.sha256 ?? ''].join('\t'));
    const note = entries.length >= MAX_FILES ? [`# only the first ${MAX_FILES} files are listed`] : [];
    return [...note, 'path\tsize\tmodified\tsha256', ...rows].join('\n') + '\n';
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** The text of an Office XML part: a line per paragraph, a tab per tab, no tags. */
export function xmlText(xml: string, paragraph: RegExp): string {
    return xml
        .replace(paragraph, '\n')
        .replace(/<(w|a):tab\/>/g, '\t')
        .replace(/<[^>]+>/g, '')
        .replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITIES[e])
        .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

const numbered = (name: string) => Number(/(\d+)\.xml$/.exec(name)?.[1] ?? 0);

/** Column letters of a cell reference to a 0-based index: `C7` is 2. */
export function columnIndex(ref: string): number {
    const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
    return [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
}

function sheetText(xml: string, shared: string[]): string {
    const rows: string[] = [];
    for (const row of xml.match(/<row\b[\s\S]*?<\/row>/g) ?? []) {
        const cells: string[] = [];
        for (const cell of row.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
            const ref = /\br="([A-Z]+)\d+"/.exec(cell)?.[1] ?? '';
            const type = /\bt="(\w+)"/.exec(cell)?.[1];
            const value = /<v>([\s\S]*?)<\/v>/.exec(cell)?.[1];
            const inline = /<is>([\s\S]*?)<\/is>/.exec(cell)?.[1];
            const text = type === 's' ? shared[Number(value)] ?? '' : inline !== undefined ? xmlText(inline, /<\/t>/g) : xmlText(value ?? '', /$^/g);
            cells[ref ? columnIndex(ref) : cells.length] = text.replace(/\s+/g, ' ');
        }
        rows.push(Array.from(cells, c => c ?? '').join('\t'));
    }
    return rows.join('\n');
}

/** The text of a .docx, .xlsx or .pptx file, or undefined when it isn't one Tactio can read. */
export function officeText(file: string): string | undefined {
    let zip: AdmZip;
    try {
        zip = new AdmZip(file);
    } catch {
        return undefined;
    }
    const read = (name: string) => zip.getEntry(name)?.getData().toString('utf8');
    const ext = path.extname(file).toLowerCase();
    if (ext === '.docx') {
        const doc = read('word/document.xml');
        return doc === undefined ? undefined : xmlText(doc, /<\/w:p>/g);
    }
    if (ext === '.pptx') {
        const slides = zip.getEntries().map(e => e.entryName).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => numbered(a) - numbered(b));
        return slides.map((n, i) => `--- Slide ${i + 1} ---\n${xmlText(read(n) ?? '', /<\/a:p>/g)}`).join('\n\n');
    }
    if (ext === '.xlsx') {
        const shared = (read('xl/sharedStrings.xml')?.match(/<si>[\s\S]*?<\/si>/g) ?? []).map(si => xmlText(si, /$^/g));
        const names = [...(read('xl/workbook.xml') ?? '').matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map(m => xmlText(m[1], /$^/g));
        const sheets = zip.getEntries().map(e => e.entryName).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => numbered(a) - numbered(b));
        return sheets.map((n, i) => `--- Sheet ${names[i] ?? i + 1} ---\n${sheetText(read(n) ?? '', shared)}`).join('\n\n');
    }
    return undefined;
}

/**
 * Writes the folder's inventory and the text of its Office files under CONTEXT_DIR, where the
 * agent's read tools can reach them, and returns what removes them again.
 */
export async function prepareContext(dir: string): Promise<() => void> {
    const root = path.join(dir, CONTEXT_DIR);
    fs.rmSync(root, { recursive: true, force: true });
    const entries = listFiles(dir);
    for (const e of hashCandidates(entries)) e.sha256 = await sha256(path.join(dir, e.path));
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'inventory.tsv'), inventoryTsv(entries));
    const office = entries.filter(e => OFFICE.test(e.path) && e.size <= MAX_OFFICE_BYTES).slice(0, MAX_OFFICE_FILES);
    for (const e of office) {
        const text = officeText(path.join(dir, e.path));
        if (!text) continue;
        const out = path.join(root, 'text', `${e.path}.txt`);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n[cut at ${MAX_TEXT} characters]` : text);
    }
    return () => {
        fs.rmSync(root, { recursive: true, force: true });
        const trash = path.join(dir, TRASH_DIR);
        try {
            if (!fs.readdirSync(trash).length) fs.rmdirSync(trash);
        } catch {
            // The trash holds backups of this or another task; it stays.
        }
    };
}

/** A runner that gives every step the folder's context and cleans it up afterwards. */
export function withFolderContext(runner: Runner): Runner {
    return {
        async run(cwd: string, step: AgentStep): Promise<AgentResult> {
            let cleanup: () => void = () => {};
            try {
                cleanup = await prepareContext(cwd);
            } catch (e) {
                console.error('[Agent] Could not prepare the folder context:', e);
            }
            try {
                return await runner.run(cwd, step);
            } finally {
                cleanup();
            }
        }
    };
}

/** A file name for a saved answer, from the request: `tactio-what-are-these-images.md`. */
export function answerFileName(request: string): string {
    const slug = request.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    return `tactio-${slug || 'answer'}.md`;
}

/** Writes the task's answer into its folder, next to any earlier one rather than over it. */
export function saveAnswer(dir: string, request: string, answer: string): string {
    const base = answerFileName(request).replace(/\.md$/, '');
    let file = path.join(dir, `${base}.md`);
    for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${base}-${i}.md`);
    fs.writeFileSync(file, `# ${request}\n\n${answer.trim()}\n`);
    return file;
}
