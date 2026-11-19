import { randomUUID } from 'crypto';
import { Runner } from './ClaudeRunner';
import {
    Applied, Change, ClaudeResult, Proposal,
    applyArgs, outsideChange, proposeArgs, refineArgs, undoArgs, unexpectedChanges
} from './claudeCli';

export type TaskState =
    | 'proposing' | 'awaiting_input' | 'proposed'
    | 'applying' | 'applied' | 'undoing' | 'undone'
    | 'cancelled' | 'failed';

export interface AgentTask {
    id: string;
    dir: string;
    intent: string;
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

export class AgentTaskManager {
    private tasks: AgentTask[];

    constructor(private store: TaskStore, private runner: Runner, private notifier: AgentNotifier) {
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
        const task: AgentTask = { id: randomUUID().slice(0, 8), dir, intent, state: 'proposing', createdAt: now, updatedAt: now };
        this.tasks.unshift(task);
        this.tasks = this.tasks.slice(0, KEEP);
        this.update(task, {});
        this.propose(task, proposeArgs(intent));
        return task;
    }

    /** Answers the agent's question, or asks it to rework a proposal the user did not approve. */
    refine(id: string, feedback: string) {
        const task = this.require(id, ['awaiting_input', 'proposed']);
        this.update(task, { state: 'proposing', proposal: undefined });
        this.propose(task, refineArgs(task.sessionId!, feedback));
    }

    approve(id: string) {
        const task = this.require(id, ['proposed']);
        this.update(task, { state: 'applying' });
        this.run(task, applyArgs(task.id, task.sessionId!, task.proposal!.changes), result => {
            const applied = result.output as Applied;
            const unexpected = unexpectedChanges(task.proposal!.changes, applied.done);
            this.update(task, { state: 'applied', applied, unexpected });
        });
    }

    cancel(id: string) {
        this.update(this.require(id, ['awaiting_input', 'proposed']), { state: 'cancelled' });
    }

    undo(id: string) {
        const task = this.require(id, ['applied']);
        this.update(task, { state: 'undoing' });
        this.run(task, undoArgs(task.id, task.sessionId!, task.applied!.done), result => {
            this.update(task, { state: 'undone', undone: result.output as Applied });
        });
    }

    private propose(task: AgentTask, args: string[]) {
        this.run(task, args, result => {
            const proposal = result.output as Proposal;
            if (proposal.question && !proposal.changes.length) {
                return this.update(task, { state: 'awaiting_input', proposal });
            }
            const outside = outsideChange(proposal.changes);
            if (outside) {
                return this.update(task, { state: 'failed', proposal, error: `The proposal reaches outside the folder: ${outside.path}${outside.to ? ` → ${outside.to}` : ''}` });
            }
            this.update(task, { state: 'proposed', proposal });
        });
    }

    private run(task: AgentTask, args: string[], done: (result: ClaudeResult) => void) {
        this.runner.run(task.dir, args).then(
            result => {
                if (result.sessionId) task.sessionId = result.sessionId;
                if (result.isError || !result.output) {
                    return this.update(task, { state: 'failed', error: result.text.slice(-300) || 'Claude returned no result.' });
                }
                done(result);
            },
            err => this.update(task, { state: 'failed', error: err.message })
        );
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
