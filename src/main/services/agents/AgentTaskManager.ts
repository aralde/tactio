import { randomUUID } from 'crypto';
import { Runner, ToolRunner } from './agentRunners';
import {
    AgentCli, AgentStep, Applied, CLI_NAMES, Change, Proposal,
    friendlyError, outsideChange, unexpectedChanges
} from './claudeCli';
import { isRun, refusedRun } from './toolRuns';

export type TaskState =
    | 'proposing' | 'awaiting_input' | 'proposed' | 'answered'
    | 'applying' | 'applied' | 'undoing' | 'undone'
    | 'cancelled' | 'failed';

export interface AgentTask {
    id: string;
    dir: string;
    intent: string;
    /** the CLI that runs every step of this task; tasks saved before there was a choice ran on Claude */
    cli?: AgentCli;
    state: TaskState;
    sessionId?: string;
    proposal?: Proposal;
    applied?: Applied;
    unexpected?: Change[];
    undone?: Applied;
    error?: string;
    createdAt: string;
    updatedAt: string;
}

export interface AgentNotifier {
    changed(task: AgentTask): void;
}

interface TaskStore {
    get(key: string): any;
    set(key: string, val: any): void;
}

const STORE_KEY = 'agentTasks';
const KEEP = 50;
const RUNNING: TaskState[] = ['proposing', 'applying', 'undoing'];

const NO_TOOLS: ToolRunner = {
    installed: () => [],
    run: async () => { throw new Error('No tools are available.'); },
    undo: async () => {}
};

/** A step the agent couldn't do, with its message already put in words the user can act on. */
class StepFailed extends Error {}

const message = (e: unknown) => e instanceof Error ? e.message : String(e);

export class AgentTaskManager {
    private tasks: AgentTask[];

    constructor(
        private store: TaskStore,
        private runners: (cli: AgentCli) => Runner,
        private notifier: AgentNotifier,
        private currentCli: () => AgentCli = () => 'claude',
        private tools: ToolRunner = NO_TOOLS
    ) {
        this.tasks = store.get(STORE_KEY) || [];
        // A run can't survive a restart: its process died with the app.
        for (const t of this.tasks) {
            if (RUNNING.includes(t.state)) Object.assign(t, { state: 'failed', error: 'Tactio closed while the task was running.' });
        }
        this.save();
    }

    list(): AgentTask[] {
        return [...this.tasks];
    }

    get(id: string): AgentTask | undefined {
        return this.tasks.find(t => t.id === id);
    }

    start(dir: string, intent: string): AgentTask {
        const now = new Date().toISOString();
        const task: AgentTask = { id: randomUUID().slice(0, 8), dir, intent, cli: this.currentCli(), state: 'proposing', createdAt: now, updatedAt: now };
        this.tasks.unshift(task);
        this.tasks = this.tasks.slice(0, KEEP);
        this.update(task, {});
        this.propose(task, { kind: 'propose', intent, tools: this.tools.installed() });
        return task;
    }

    /** Answers the agent's question, asks it to rework a proposal, or follows up on an answer. */
    refine(id: string, feedback: string) {
        const task = this.require(id, ['awaiting_input', 'proposed', 'answered']);
        const previous = task.proposal;
        this.update(task, { state: 'proposing', proposal: undefined });
        this.propose(task, { kind: 'refine', intent: task.intent, feedback, previous, sessionId: task.sessionId, tools: this.tools.installed() });
    }

    /**
     * Applies the approved proposal: the agent makes its changes, then Tactio runs the tools of the
     * `run` changes itself, so no agent needs a shell for them.
     */
    approve(id: string) {
        const task = this.require(id, ['proposed']);
        const changes = task.proposal!.changes;
        const byAgent = changes.filter(c => !isRun(c));
        this.update(task, { state: 'applying' });
        this.execute(task, async () => {
            let applied: Applied = { done: [], failed: [] };
            let unexpected: Change[] = [];
            if (byAgent.length) {
                applied = await this.step(task, { kind: 'apply', taskId: task.id, changes: byAgent, sessionId: task.sessionId }) as Applied;
                unexpected = unexpectedChanges(byAgent, applied.done);
            }
            for (const change of changes.filter(isRun)) {
                try {
                    await this.tools.run(task.dir, change);
                    applied.done.push(change);
                } catch (e) {
                    applied.failed.push({ change, reason: message(e) });
                }
            }
            this.update(task, { state: 'applied', applied, unexpected });
        });
    }

    /** Starts the same request again as a new task. */
    retry(id: string): AgentTask {
        const task = this.require(id, ['failed', 'cancelled', 'undone', 'answered', 'applied']);
        return this.start(task.dir, task.intent);
    }

    cancel(id: string) {
        this.update(this.require(id, ['awaiting_input', 'proposed']), { state: 'cancelled' });
    }

    /** Reverts in reverse order: Tactio puts the tools' outputs in the trash, then the agent reverts its own changes. */
    undo(id: string) {
        const task = this.require(id, ['applied']);
        const done = task.applied!.done;
        this.update(task, { state: 'undoing' });
        this.execute(task, async () => {
            const undone: Applied = { done: [], failed: [] };
            for (const change of done.filter(isRun).reverse()) {
                try {
                    await this.tools.undo(task.dir, task.id, change);
                    undone.done.push(change);
                } catch (e) {
                    undone.failed.push({ change, reason: message(e) });
                }
            }
            const byAgent = done.filter(c => !isRun(c));
            if (byAgent.length) {
                const reverted = await this.step(task, { kind: 'undo', taskId: task.id, done: byAgent, sessionId: task.sessionId }) as Applied;
                undone.done.push(...reverted.done);
                undone.failed.push(...reverted.failed);
            }
            this.update(task, { state: 'undone', undone });
        });
    }

    private propose(task: AgentTask, step: AgentStep) {
        this.execute(task, async () => {
            const proposal = await this.step(task, step) as Proposal;
            proposal.changes ??= [];
            if (proposal.questions?.length) return this.update(task, { state: 'awaiting_input', proposal });
            if (proposal.answer?.trim() && !proposal.changes.length) return this.update(task, { state: 'answered', proposal });
            const outside = outsideChange(proposal.changes);
            if (outside) {
                return this.update(task, { state: 'failed', proposal, error: `The proposal reaches outside the folder: ${outside.path}${outside.to ? ` → ${outside.to}` : ''}` });
            }
            const refused = refusedRun(proposal.changes, this.tools.installed());
            if (refused) return this.update(task, { state: 'failed', proposal, error: `Tactio won't run ${refused.change.tool ?? 'that tool'}: ${refused.reason}` });
            this.update(task, { state: 'proposed', proposal });
        });
    }

    /** Runs one agent step on the task's CLI and returns its structured output. */
    private async step(task: AgentTask, step: AgentStep): Promise<unknown> {
        const cli = task.cli ?? 'claude';
        let result;
        try {
            result = await this.runners(cli).run(task.dir, step);
        } catch (e) {
            throw new StepFailed(friendlyError(message(e), cli));
        }
        if (result.sessionId) task.sessionId = result.sessionId;
        if (result.isError || !result.output) throw new StepFailed(friendlyError(result.text.slice(-300), cli) || `${CLI_NAMES[cli]} returned no result.`);
        return result.output;
    }

    /** Runs work in the background; anything that fails it, including a step that can't start, fails the task. */
    private execute(task: AgentTask, work: () => Promise<void>) {
        Promise.resolve().then(work).catch(e => this.update(task, { state: 'failed', error: message(e) }));
    }

    private require(id: string, states: TaskState[]): AgentTask {
        const task = this.get(id);
        if (!task) throw new Error(`No task ${id}`);
        if (!states.includes(task.state)) throw new Error(`Task ${id} is ${task.state}, expected ${states.join(' or ')}`);
        return task;
    }

    private update(task: AgentTask, patch: Partial<AgentTask>) {
        Object.assign(task, patch, { updatedAt: new Date().toISOString() });
        this.save();
        this.notifier.changed(task);
    }

    private save() {
        this.store.set(STORE_KEY, this.tasks);
    }
}
