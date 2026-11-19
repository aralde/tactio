import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
    AgentCli, AgentStep, Change, ClaudeResult, applyArgs, claudeArgs, cliCandidates, isInside, outsideChange, parseAgentCommand,
    parseResult, proposeArgs, standalonePrompt, unexpectedChanges
} from '../src/main/services/agents/claudeCli';
import { extractObject, opencodeArgs, opencodeEnv, opencodeResult, parseOpencode } from '../src/main/services/agents/opencodeCli';
import { AGY_AGENT, agyAgent, agyArgs, agySettings, fileRules, otherCommands, parseAgy } from '../src/main/services/agents/agyCli';
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
    assert.deepEqual(parseAgentCommand(['Tactio.exe', '--agent', 'C:\\fotos', '--request', 'rename']), { kind: 'start', dir: 'C:\\fotos', request: 'rename' });
    assert.deepEqual(parseAgentCommand(['Tactio.exe', '--agent-answer', 'ab12', 'by date']), { kind: 'answer', id: 'ab12', text: 'by date' });
    assert.deepEqual(parseAgentCommand(['Tactio.exe', '--agent', 'C:\\fotos']), { kind: 'open', dir: 'C:\\fotos' });
    assert.deepEqual(parseAgentCommand(['Tactio.exe', '--allow-file-access-from-files', '--agent=C:\\my files']), { kind: 'open', dir: 'C:\\my files' });
    assert.equal(parseAgentCommand(['Tactio.exe', '--agent', '--allow-file-access-from-files', 'C:\\fotos']), undefined);
    assert.equal(parseAgentCommand(['Tactio.exe']), undefined);
});

function harness(results: ClaudeResult[], cli: AgentCli = 'claude') {
    const data: Record<string, any> = {};
    const calls: string[][] = [];
    const steps: AgentStep[] = [];
    const used: AgentCli[] = [];
    const seen: string[] = [];
    // Records each step as Claude's arguments too, so the resume checks read like the real run.
    const runners = (c: AgentCli) => ({
        run: async (_cwd: string, step: AgentStep) => {
            used.push(c);
            steps.push(step);
            if (c === 'claude') calls.push(claudeArgs(step));
            return results.shift()!;
        }
    });
    const manager = new AgentTaskManager(
        { get: k => data[k], set: (k, v) => (data[k] = v) },
        runners,
        { changed: (t: AgentTask) => seen.push(t.state) },
        () => cli
    );
    return { manager, calls, steps, used, seen, data };
}

const tick = async () => {
    for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
};

test('a task goes from proposal to applied to undone', async () => {
    const change: Change = { op: 'rename', path: 'a.jpg', to: 'b.jpg' };
    const { manager, calls, seen } = harness([
        { sessionId: 's1', isError: false, text: '', output: { summary: 'Rename', plan: ['Rename a.jpg'], changes: [change] } },
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
        { sessionId: 's2', isError: false, text: '', output: { summary: '', plan: [], changes: [], questions: [{ question: 'Group by?', options: ['Date', 'Type'] }] } },
        { sessionId: 's2', isError: false, text: '', output: { summary: 'ok', plan: ['Make 2026'], changes: [{ op: 'mkdir', path: '2026' }] } }
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
        { sessionId: 's3', isError: false, text: '', output: { summary: 'x', plan: [], changes: [{ op: 'move', path: 'a', to: '../a' }] } }
    ]);
    const task = manager.start('/tmp/f', 'move');
    await tick();
    assert.equal(task.state, 'failed');
    assert.throws(() => manager.approve(task.id));
});

test('tasks left running by a restart are marked failed', () => {
    const data: Record<string, any> = { agentTasks: [{ id: 'a', state: 'applying' }] };
    const manager = new AgentTaskManager({ get: k => data[k], set: (k, v) => (data[k] = v) }, () => ({ run: async () => ({ isError: true, text: '' }) }), { changed: () => {} });
    assert.equal(manager.get('a')!.state, 'failed');
});

test('the folder menu launches Tactio on the clicked folder', () => {
    assert.equal(menuCommand('C:\\T\\Tactio.exe', undefined, '%1'), '"C:\\T\\Tactio.exe" --agent="%1"');
    assert.equal(menuCommand('C:\\e\\electron.exe', 'C:\\src\\tactio', '%V'), '"C:\\e\\electron.exe" "C:\\src\\tactio" --agent="%V"');
    const calls = addMenuCalls('C:\\T\\Tactio.exe');
    assert.equal(calls.length, 6);
    assert.ok(calls.some(c => c[1].endsWith('\\Background\\shell\\Tactio\\command') && c[4].endsWith('--agent="%V"')));
    assert.deepEqual(removeMenuCalls().map(c => c[0]), ['delete', 'delete']);
});

test('an expired login becomes an actionable message, and the task can be retried', async () => {
    const { manager } = harness([
        { isError: true, text: 'Failed to authenticate: OAuth session expired and could not be refreshed' },
        { sessionId: 's4', isError: false, text: '', output: { summary: 'ok', plan: ['x'], changes: [] } }
    ]);
    const task = manager.start('/tmp/f', 'tidy');
    await tick();
    assert.equal(task.state, 'failed');
    assert.match(task.error!, /run `claude` and use \/login/);
    const again = manager.retry(task.id);
    await tick();
    assert.equal(again.request, 'tidy');
    assert.equal(again.state, 'proposed');
});

test('a task keeps the CLI it started on, and its refine carries the request and the last proposal', async () => {
    const proposal = { summary: '', plan: [], changes: [], questions: [{ question: 'Group by?', options: ['Date', 'Type'] }] };
    const { manager, steps, used } = harness([
        { sessionId: 'ses_1', isError: false, text: '', output: proposal },
        { sessionId: 'ses_1', isError: false, text: '', output: { summary: 'ok', plan: ['Make 2026'], changes: [{ op: 'mkdir', path: '2026' }] } }
    ], 'opencode');
    const task = manager.start('/tmp/f', 'sort');
    await tick();
    assert.equal(task.cli, 'opencode');
    manager.refine(task.id, 'by date');
    await tick();
    assert.deepEqual(used, ['opencode', 'opencode']);
    assert.deepEqual(steps[1], { kind: 'refine', request: 'sort', feedback: 'by date', previous: proposal, sessionId: 'ses_1', tools: [] });
    const prompt = standalonePrompt(steps[1]);
    assert.match(prompt, /sort/);
    assert.match(prompt, /Group by\?/);
    assert.match(prompt, /by date/);
});

test('a Claude step without a session fails the task instead of throwing', async () => {
    const data: Record<string, any> = { agentTasks: [{ id: 'old', dir: '/tmp/f', request: 'x', state: 'proposed', proposal: { summary: '', plan: [], changes: [{ op: 'mkdir', path: 'x' }] } }] };
    const runner = { run: async (_cwd: string, step: AgentStep): Promise<ClaudeResult> => { claudeArgs(step); return { isError: true, text: '' }; } };
    const manager = new AgentTaskManager({ get: k => data[k], set: (k, v) => (data[k] = v) }, () => runner, { changed: () => {} });
    manager.approve('old');
    await tick();
    assert.equal(manager.get('old')!.state, 'failed');
    assert.match(manager.get('old')!.error!, /no Claude session/);
});

test('an expired OpenCode key points to its own login', async () => {
    const { manager } = harness([{ isError: true, text: 'This API key has expired. Create a new API key in OpenCode Console' }], 'opencode');
    const task = manager.start('/tmp/f', 'tidy');
    await tick();
    assert.match(task.error!, /opencode auth login/);
});

const applyStep: AgentStep = { kind: 'apply', taskId: 't1', changes: [{ op: 'rename', path: 'a', to: 'b' }] };
const proposeStep: AgentStep = { kind: 'propose', request: 'rename the photos' };

test('OpenCode reads only while proposing, and writes with mv, mkdir and cp only', () => {
    const read = JSON.parse(opencodeEnv(proposeStep, 'C:\\f', {}).OPENCODE_CONFIG_CONTENT!).agent.tactio.permission;
    assert.equal(read['*'], 'deny');
    assert.equal(read.read, 'allow');
    assert.equal(read.edit, undefined);
    assert.equal(read.bash, undefined);
    const env = opencodeEnv(applyStep, 'C:\\f', {});
    assert.equal(env.PWD, 'C:\\f');
    const write = JSON.parse(env.OPENCODE_CONFIG_CONTENT!).agent.tactio.permission;
    assert.equal(write.edit, 'allow');
    assert.deepEqual(write.bash, { '*': 'deny', 'mv *': 'allow', 'mkdir *': 'allow', 'cp *': 'allow' });
    assert.equal(write.external_directory, 'deny');
});

test('OpenCode gets the schema in the prompt, and a reminder resumes its session', () => {
    const args = opencodeArgs(proposeStep, 'opencode/big-pickle');
    assert.deepEqual(args.slice(0, 5), ['run', '--format', 'json', '--agent', 'tactio']);
    assert.equal(args[args.indexOf('--model') + 1], 'opencode/big-pickle');
    assert.match(args[args.length - 1], /"required":\["summary","plan","changes"\]/);
    const again = opencodeArgs(proposeStep, undefined, { sessionId: 'ses_9', message: 'only the JSON' });
    assert.equal(again[again.indexOf('--session') + 1], 'ses_9');
    assert.equal(again[again.length - 1], 'only the JSON');
});

test('OpenCode results are read from the last message', () => {
    const stdout = [
        '{"type":"step_start","sessionID":"ses_1"}',
        '{"type":"text","sessionID":"ses_1","part":{"text":"Looking"}}',
        JSON.stringify({ type: 'text', sessionID: 'ses_1', part: { text: '```json\n{"done":[],"failed":[]}\n```' } })
    ].join('\n');
    const parsed = parseOpencode(stdout);
    assert.equal(parsed.sessionId, 'ses_1');
    assert.deepEqual(extractObject(parsed.text), { done: [], failed: [] });
    assert.deepEqual(opencodeResult(parsed, { required: ['done', 'failed'] }).output, { done: [], failed: [] });
    assert.ok(opencodeResult({ text: '{"summary":"x"}' }, { required: ['summary', 'plan'] }).isError);
    const error = parseOpencode('{"type":"error","sessionID":"s","error":{"name":"APIError","data":{"message":"This API key has expired."}}}');
    assert.equal(opencodeResult(error, {}).text, 'This API key has expired.');
});

test('agy proposes with read tools only and no commands', () => {
    const args = agyArgs(proposeStep);
    assert.equal(args[args.indexOf('--agent') + 1], AGY_AGENT);
    assert.equal(args[args.indexOf('--output-format') + 1], 'stream-json');
    assert.ok(JSON.parse(args[args.indexOf('--json-schema') + 1]).required.includes('changes'));
    assert.match(agyAgent(proposeStep), /tools: \[finish, view_file, list_dir, grep_search, find_by_name\]/);
    const settings = agySettings(proposeStep, 'C:\\f', () => []) as { permissions: { allow: string[]; deny: string[] }; allowNonWorkspaceAccess: boolean };
    assert.deepEqual(settings.permissions.allow, ['read_file(C:/f)', 'read_file(C:/)']);
    assert.ok(settings.permissions.deny.includes('command(*)'));
    assert.equal(settings.allowNonWorkspaceAccess, false);
});

test('agy writes inside the folder and starts only mv, mkdir and cp', () => {
    assert.match(agyAgent(applyStep), /write_to_file/);
    const settings = agySettings(applyStep, 'C:\\f', () => []) as { permissions: { allow: string[]; deny: string[] } };
    assert.deepEqual(settings.permissions.allow.slice(2), ['write_file(C:\\f)', 'command(cp)', 'command(mkdir)', 'command(mv)']);
    const other = new RegExp(otherCommands(['cp', 'mkdir', 'mv']));
    for (const program of ['rm', 'del', 'Remove-Item', 'mvx', 'm', 'mk', 'c', 'powershell']) assert.ok(other.test(program), program);
    for (const program of ['cp', 'mkdir', 'mv']) assert.ok(!other.test(program), program);
});

test('agy results come from the stream, and a refused permission says which', () => {
    const ok = parseAgy([
        '{"event":"init","conversation_id":"c1","init":{}}',
        '{"event":"result","result":{"conversation_id":"c1","status":"SUCCESS","response":"{}","structured_output":{"done":[],"failed":[]}}}'
    ].join('\n'));
    assert.deepEqual(ok, { sessionId: 'c1', output: { done: [], failed: [] }, isError: false, text: '{}' });
    const refused = parseAgy('{"event":"result","result":{"status":"SUCCESS","denied_actions":[{"action":"command(rm)"}]}}');
    assert.ok(refused.isError);
    assert.match(refused.text, /command\(rm\)/);
    assert.match(parseAgy('', 'boom').text, /boom/);
});

test('binaries resolve to an .exe beside an npm shim', () => {
    const env = { USERPROFILE: 'C:\\Users\\a', LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' };
    assert.ok(cliCandidates('opencode', ['C:\\nodejs\\opencode.cmd'], env).includes('C:\\nodejs\\node_modules\\opencode-ai\\bin\\opencode.exe'));
    assert.ok(cliCandidates('agy', [], env).includes('C:\\Users\\a\\AppData\\Local\\agy\\bin\\agy.exe'));
    assert.ok(cliCandidates('claude', [], env).includes('C:\\Users\\a\\.local\\bin\\claude.exe'));
});

test('agy reads outside the folder are denied one by one, so they never end the run', () => {
    const tree: Record<string, string[]> = { 'C:\\': ['Users', 'Windows', 'prueba'], 'C:\\Users': ['ariel', 'Public'] };
    const rules = fileRules('C:\\Users\\ariel', dir => tree[dir] ?? []);
    assert.deepEqual(rules.allow, ['read_file(C:/Users/ariel)', 'read_file(C:/Users)', 'read_file(C:/)']);
    assert.deepEqual(rules.deny, ['read_file(C:/Users/Public)', 'read_file(C:/Windows)', 'read_file(C:/prueba)']);
});
