import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { AgentCli, AgentStep, Change, ClaudeResult, proposePrompt } from '../src/main/services/agents/claudeCli';
import { AgentTask, AgentTaskManager } from '../src/main/services/agents/AgentTaskManager';
import { ToolRunner } from '../src/main/services/agents/agentRunners';
import { runArgs, runProblem } from '../src/main/services/agents/toolRuns';
import { answerFileName, columnIndex, hashCandidates, listFiles, officeText, prepareContext, saveAnswer } from '../src/main/services/agents/folderContext';
import { AgentSchedules } from '../src/main/services/agents/AgentSchedules';

const tick = () => new Promise(r => setImmediate(r));
const flush = async () => {
    for (let i = 0; i < 5; i++) await tick();
};

function fakeTools(installed: string[] = ['ffmpeg']) {
    const log: string[] = [];
    const tools: ToolRunner = {
        installed: () => installed,
        run: async (_cwd, c) => {
            if (c.path === 'broken.mov') throw new Error('ffmpeg exited 1');
            log.push(`run ${c.to}`);
        },
        undo: async (_cwd, _id, c) => {
            log.push(`undo ${c.to}`);
        }
    };
    return { tools, log };
}

function harness(results: ClaudeResult[], tools?: ToolRunner) {
    const data: Record<string, any> = {};
    const steps: AgentStep[] = [];
    const runners = (_c: AgentCli) => ({
        run: async (_cwd: string, step: AgentStep) => {
            steps.push(step);
            return results.shift()!;
        }
    });
    const manager = new AgentTaskManager({ get: k => data[k], set: (k, v) => (data[k] = v) }, runners, { changed: (_t: AgentTask) => {} }, () => 'agy', tools);
    return { manager, steps };
}

const ok = (output: object): ClaudeResult => ({ sessionId: 's', isError: false, text: '', output });

test('a question gets an answer, and a follow-up asks again', async () => {
    const { manager, steps } = harness([
        ok({ summary: 'Images', plan: [], changes: [], answer: 'Two **photos** of a beach.' }),
        ok({ summary: 'Images', plan: [], changes: [], answer: 'Taken in 2024.' })
    ]);
    const task = manager.start('/tmp/f', 'what are these images?');
    await flush();
    assert.equal(task.state, 'answered');
    assert.equal(task.proposal!.answer, 'Two **photos** of a beach.');
    manager.refine(task.id, 'when?');
    await flush();
    assert.equal(task.proposal!.answer, 'Taken in 2024.');
    assert.equal(steps[1].kind, 'refine');
});

test('the propose prompt names the inventory, answers and the installed tools', () => {
    const prompt = proposePrompt('find duplicates', ['ffmpeg', 'qpdf']);
    assert.match(prompt, /\.tactio-trash\/context\/inventory\.tsv/);
    assert.match(prompt, /"answer"/);
    assert.match(prompt, /Installed tools: ffmpeg, qpdf/);
    assert.match(proposePrompt('convert'), /propose no "run" changes/);
});

const convert: Change = { op: 'run', tool: 'ffmpeg', path: 'a.mov', to: 'a.mp4', args: ['-i', 'a.mov', 'a.mp4'] };

test('Tactio runs the tools itself after the agent, and skips the agent when only tools run', async () => {
    const { tools, log } = fakeTools();
    const mkdir: Change = { op: 'mkdir', path: 'out' };
    const { manager, steps } = harness([
        ok({ summary: 'Convert', plan: ['x'], changes: [mkdir, convert] }),
        ok({ done: [mkdir], failed: [] })
    ], tools);
    const task = manager.start('/tmp/f', 'convert');
    await flush();
    assert.equal(task.state, 'proposed');
    manager.approve(task.id);
    await flush();
    assert.equal(task.state, 'applied');
    assert.deepEqual((steps[1] as { changes: Change[] }).changes, [mkdir]);
    assert.deepEqual(task.applied!.done, [mkdir, convert]);
    assert.deepEqual(log, ['run a.mp4']);

    const only = harness([ok({ summary: 'Convert', plan: ['x'], changes: [convert] })], tools);
    const t2 = only.manager.start('/tmp/f', 'convert');
    await flush();
    only.manager.approve(t2.id);
    await flush();
    assert.equal(t2.state, 'applied');
    assert.equal(only.steps.length, 1);
    only.manager.undo(t2.id);
    await flush();
    assert.equal(t2.state, 'undone');
    assert.deepEqual(log, ['run a.mp4', 'run a.mp4', 'undo a.mp4']);
    assert.equal(only.steps.length, 1);
});

test('a failing tool is reported as failed, not as a failed task', async () => {
    const { tools } = fakeTools();
    const broken: Change = { ...convert, path: 'broken.mov', args: ['-i', 'broken.mov', 'b.mp4'], to: 'b.mp4' };
    const { manager } = harness([ok({ summary: 'x', plan: ['x'], changes: [broken] })], tools);
    const task = manager.start('/tmp/f', 'convert');
    await flush();
    manager.approve(task.id);
    await flush();
    assert.equal(task.state, 'applied');
    assert.match(task.applied!.failed[0].reason, /exited 1/);
});

test('a proposal with a tool that is not installed fails before approval', async () => {
    const { tools } = fakeTools([]);
    const { manager } = harness([ok({ summary: 'x', plan: ['x'], changes: [convert] })], tools);
    const task = manager.start('/tmp/f', 'convert');
    await flush();
    assert.equal(task.state, 'failed');
    assert.match(task.error!, /won't run ffmpeg/);
});

test('runs must stay in the folder and write a new file named in their arguments', () => {
    const installed = ['ffmpeg', 'magick'];
    assert.equal(runProblem(convert, installed), undefined);
    assert.match(runProblem({ ...convert, tool: 'rm' }, installed)!, /not one Tactio can run/);
    assert.match(runProblem({ ...convert, to: 'c.mp4' }, installed)!, /not among/);
    assert.match(runProblem({ ...convert, args: ['-i', '../x.mov', 'a.mp4'] }, installed)!, /outside the folder/);
    assert.match(runProblem({ ...convert, args: ['-i', 'C:\\x.mov', 'a.mp4'] }, installed)!, /outside the folder/);
    assert.match(runProblem({ ...convert, args: ['-i', 'https://x/y.mov', 'a.mp4'] }, installed)!, /not allowed/);
    assert.match(runProblem({ op: 'run', tool: 'magick', path: 'a', to: 'b.jpg', args: ['@list.txt', 'b.jpg'] }, installed)!, /not allowed/);
    assert.match(runProblem({ ...convert, to: '.tactio-trash/a.mp4', args: ['-i', 'a.mov', '.tactio-trash/a.mp4'] }, installed)!, /trash/);
    assert.deepEqual(runArgs(convert).slice(0, 1), ['-n']);
});

function tempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'tactio-test-'));
}

function zip(file: string, entries: Record<string, string>) {
    const z = new AdmZip();
    for (const [name, content] of Object.entries(entries)) z.addFile(name, Buffer.from(content, 'utf8'));
    z.writeZip(file);
}

test('the inventory lists files and hashes only those that share a size', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'a.txt'), 'same');
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', 'b.txt'), 'same');
    fs.writeFileSync(path.join(dir, 'c.txt'), 'different');
    fs.mkdirSync(path.join(dir, '.tactio-trash'));
    fs.writeFileSync(path.join(dir, '.tactio-trash', 'old.txt'), 'same');
    const entries = listFiles(dir);
    assert.deepEqual(entries.map(e => e.path).sort(), ['a.txt', 'c.txt', 'sub/b.txt']);
    assert.deepEqual(hashCandidates(entries).map(e => e.path).sort(), ['a.txt', 'sub/b.txt']);

    zip(path.join(dir, 'memo.docx'), { 'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>Hola &amp; adiós</w:t></w:r></w:p><w:p><w:r><w:t>Segunda</w:t></w:r></w:p></w:body></w:document>' });
    const cleanup = await prepareContext(dir);
    const inventory = fs.readFileSync(path.join(dir, '.tactio-trash/context/inventory.tsv'), 'utf8').split('\n');
    const a = inventory.find(l => l.startsWith('a.txt\t'))!.split('\t');
    const b = inventory.find(l => l.startsWith('sub/b.txt\t'))!.split('\t');
    assert.equal(a[3].length, 64);
    assert.equal(a[3], b[3]);
    assert.equal(inventory.find(l => l.startsWith('c.txt\t'))!.split('\t')[3], '');
    assert.equal(fs.readFileSync(path.join(dir, '.tactio-trash/context/text/memo.docx.txt'), 'utf8'), 'Hola & adiós\n\nSegunda'.replace('\n\n', '\n'));
    cleanup();
    assert.ok(!fs.existsSync(path.join(dir, '.tactio-trash/context')));
    assert.ok(fs.existsSync(path.join(dir, '.tactio-trash/old.txt')));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('Excel and PowerPoint text comes out as rows and slides', () => {
    const dir = tempDir();
    const xlsx = path.join(dir, 'gastos.xlsx');
    zip(xlsx, {
        'xl/workbook.xml': '<workbook><sheets><sheet name="Enero" sheetId="1"/></sheets></workbook>',
        'xl/sharedStrings.xml': '<sst><si><t>Proveedor</t></si><si><t>Importe</t></si><si><t>Luz</t></si></sst>',
        'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>42.5</v></c></row></sheetData></worksheet>'
    });
    assert.equal(officeText(xlsx), '--- Sheet Enero ---\nProveedor\tImporte\nLuz\t\t42.5');
    const pptx = path.join(dir, 'deck.pptx');
    zip(pptx, {
        'ppt/slides/slide2.xml': '<p:sld><a:p><a:r><a:t>Second</a:t></a:r></a:p></p:sld>',
        'ppt/slides/slide10.xml': '<p:sld><a:p><a:r><a:t>Tenth</a:t></a:r></a:p></p:sld>',
        'ppt/slides/slide1.xml': '<p:sld><a:p><a:r><a:t>First</a:t></a:r></a:p></p:sld>'
    });
    assert.equal(officeText(pptx), '--- Slide 1 ---\nFirst\n\n--- Slide 2 ---\nSecond\n\n--- Slide 3 ---\nTenth');
    assert.equal(officeText(path.join(dir, 'missing.docx')), undefined);
    assert.equal(columnIndex('AA3'), 26);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('answers are saved next to earlier ones, never over them', () => {
    const dir = tempDir();
    assert.equal(answerFileName('¿Qué son las imágenes?'), 'tactio-que-son-las-imagenes.md');
    const first = saveAnswer(dir, 'Qué hay', 'Uno');
    const second = saveAnswer(dir, 'Qué hay', 'Dos');
    assert.equal(path.basename(first), 'tactio-que-hay.md');
    assert.equal(path.basename(second), 'tactio-que-hay-2.md');
    assert.equal(fs.readFileSync(first, 'utf8'), '# Qué hay\n\nUno\n');
    fs.rmSync(dir, { recursive: true, force: true });
});

test('a weekly request starts once when due, even after days closed', () => {
    const data: Record<string, any> = {};
    const started: string[] = [];
    let now = new Date('2026-11-01T10:00:00Z');
    const schedules = new AgentSchedules({ get: k => data[k], set: (k, v) => (data[k] = v) }, (dir, intent) => started.push(`${dir}:${intent}`), () => now);
    const s = schedules.add('C:\\Descargas', 'ordenar');
    assert.equal(schedules.add('C:\\Descargas', 'ordenar').id, s.id);
    assert.equal(s.nextAt, '2026-11-08T10:00:00.000Z');
    schedules.tick();
    assert.deepEqual(started, []);
    now = new Date('2026-11-20T09:00:00Z');
    schedules.tick();
    assert.deepEqual(started, ['C:\\Descargas:ordenar']);
    assert.equal(schedules.list()[0].nextAt, '2026-11-22T10:00:00.000Z');
    schedules.tick();
    assert.equal(started.length, 1);
    schedules.remove(s.id);
    assert.deepEqual(data.agentSchedules, []);
});
