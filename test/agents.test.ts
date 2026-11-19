import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
    Change, ClaudeResult, applyArgs, isInside, outsideChange, parseAgentCommand, parseResult, proposeArgs, unexpectedChanges
} from '../src/main/services/agents/claudeCli';
import { AgentTask, AgentTaskManager } from '../src/main/services/agents/AgentTaskManager';
import { addMenuCalls, menuCommand, removeMenuCalls } from '../src/main/services/agents/folderMenu';

test('propose runs read-only tools with the proposal schema', () => {
    const args = proposeArgs('rename the photos');
    assert.equal(args[args.indexOf('--tools') + 1], 'Read,Glob,Grep');
    assert.ok(JSON.parse(args[args.indexOf('--json-schema') + 1]).required.includes('changes'));
    assert.ok(!args.includes('--resume'));
});

test('apply resumes the session and allows only the write list', () => {
    const args = applyArgs('t1', 'sess-1', [{ op: 'rename', path: 'a.jpg', to: 'b.jpg' }]);
    assert.equal(args[args.indexOf('--resume') + 1], 'sess-1');
    assert.equal(args[args.indexOf('--permission-mode') + 1], 'dontAsk');
    assert.ok(args.includes('Bash(mv *)'));
    assert.ok(!args.some(a => a.startsWith('Bash(rm')));
});

test('parseResult reads session, structured output and errors', () => {
    const out = parseResult('noise\n{"type":"result","session_id":"s","is_error":false,"structured_output":{"x":1},"result":"ok"}\n');
    assert.deepEqual(out, { sessionId: 's', output: { x: 1 }, isError: false, text: 'ok' });
    assert.equal(parseResult('not json'), undefined);
});

test('paths must stay inside the folder', () => {
    assert.ok(isInside('photos/a.jpg'));
    assert.ok(isInside(undefined));
    for (const p of ['../a', 'a/../../b', 'C:\\x', '/etc/passwd', '\\\\server\\share', '']) assert.ok(!isInside(p), p);
    assert.deepEqual(outsideChange([{ op: 'move', path: 'a', to: '../b' }]), { op: 'move', path: 'a', to: '../b' });
});

test('unexpectedChanges flags work that was not approved', () => {
    const approved: Change[] = [{ op: 'rename', path: 'a', to: 'b' }];
    assert.deepEqual(unexpectedChanges(approved, approved), []);
    assert.deepEqual(unexpectedChanges(approved, [{ op: 'delete', path: 'c' }]), [{ op: 'delete', path: 'c' }]);
    assert.deepEqual(unexpectedChanges(approved, [{ op: 'mkdir', path: '.tactio-trash/t1' }, { op: 'create', path: '.tactio-trash\\t1\\a' }]), []);
});

test('parseAgentCommand reads start and answer commands', () => {
    assert.deepEqual(parseAgentCommand(['Tactio.exe', '--agent', 'C:\\fotos', '--intent', 'rename']), { kind: 'start', dir: 'C:\\fotos', intent: 'rename' });
    assert.deepEqual(parseAgentCommand(['Tactio.exe', '--agent-answer', 'ab12', 'by date']), { kind: 'answer', id: 'ab12', text: 'by date' });
    assert.deepEqual(parseAgentCommand(['Tactio.exe', '--agent', 'C:\\fotos']), { kind: 'open', dir: 'C:\\fotos' });
    assert.equal(parseAgentCommand(['Tactio.exe']), undefined);
});

function harness(results: ClaudeResult[]) {
    const data: Record<string, any> = {};
    const calls: string[][] = [];
    const seen: string[] = [];
    const runner = { run: async (_cwd: string, args: string[]) => { calls.push(args); return results.shift()!; } };
    const manager = new AgentTaskManager(
        { get: k => data[k], set: (k, v) => (data[k] = v) },
        runner,
        { changed: (t: AgentTask) => seen.push(t.state) }
    );
    return { manager, calls, seen, data };
}

const tick = () => new Promise(r => setImmediate(r));

test('a task goes from proposal to applied to undone', async () => {
    const change: Change = { op: 'rename', path: 'a.jpg', to: 'b.jpg' };
    const { manager, calls, seen } = harness([
        { sessionId: 's1', isError: false, text: '', output: { summary: 'Rename', changes: [change] } },
        { sessionId: 's1', isError: false, text: '', output: { done: [change, { op: 'delete', path: 'x' }], failed: [] } },
        { sessionId: 's1', isError: false, text: '', output: { done: [change], failed: [] } }
    ]);
    const task = manager.start('/tmp/f', 'rename');
    await tick();
    assert.equal(task.state, 'proposed');
    manager.approve(task.id);
    await tick();
    assert.equal(task.state, 'applied');
    assert.deepEqual(task.unexpected, [{ op: 'delete', path: 'x' }]);
    manager.undo(task.id);
    await tick();
    assert.equal(task.state, 'undone');
    assert.equal(calls[1][calls[1].indexOf('--resume') + 1], 's1');
    assert.deepEqual(seen, ['proposing', 'proposed', 'applying', 'applied', 'undoing', 'undone']);
});

test('a question waits for an answer that resumes the session', async () => {
    const { manager, calls } = harness([
        { sessionId: 's2', isError: false, text: '', output: { summary: '', changes: [], question: 'By date?' } },
        { sessionId: 's2', isError: false, text: '', output: { summary: 'ok', changes: [{ op: 'mkdir', path: '2026' }] } }
    ]);
    const task = manager.start('/tmp/f', 'sort');
    await tick();
    assert.equal(task.state, 'awaiting_input');
    manager.refine(task.id, 'yes');
    await tick();
    assert.equal(task.state, 'proposed');
    assert.equal(calls[1][calls[1].indexOf('--resume') + 1], 's2');
});

test('a proposal that leaves the folder fails without asking', async () => {
    const { manager } = harness([
        { sessionId: 's3', isError: false, text: '', output: { summary: 'x', changes: [{ op: 'move', path: 'a', to: '../a' }] } }
    ]);
    const task = manager.start('/tmp/f', 'move');
    await tick();
    assert.equal(task.state, 'failed');
    assert.throws(() => manager.approve(task.id));
});

test('tasks left running by a restart are marked failed', () => {
    const data: Record<string, any> = { agentTasks: [{ id: 'a', state: 'applying' }] };
    const manager = new AgentTaskManager({ get: k => data[k], set: (k, v) => (data[k] = v) }, { run: async () => ({ isError: true, text: '' }) }, { changed: () => {} });
    assert.equal(manager.get('a')!.state, 'failed');
});

test('the folder menu launches Tactio on the clicked folder', () => {
    assert.equal(menuCommand('C:\\T\\Tactio.exe', undefined, '%1'), '"C:\\T\\Tactio.exe" --agent "%1"');
    assert.equal(menuCommand('C:\\e\\electron.exe', 'C:\\src\\tactio', '%V'), '"C:\\e\\electron.exe" "C:\\src\\tactio" --agent "%V"');
    const calls = addMenuCalls('C:\\T\\Tactio.exe');
    assert.equal(calls.length, 6);
    assert.ok(calls.some(c => c[1].endsWith('\\Background\\shell\\Tactio\\command') && c[4].endsWith('--agent "%V"')));
    assert.deepEqual(removeMenuCalls().map(c => c[0]), ['delete', 'delete']);
});
