import { Notification } from 'electron';
import * as path from 'path';
import { AgentNotifier, AgentTask } from './AgentTaskManager';

/**
 * Tells the user about each task with Windows notifications. Clicking one opens the agent window on
 * that task, to answer, run, undo or retry it.
 */
export class AgentNotifications implements AgentNotifier {
    // Electron drops the click handler of a notification that gets garbage collected.
    private shown = new Set<Notification>();

    constructor(private onOpen: (task: AgentTask) => void, private onChange: (task: AgentTask) => void) {}

    changed(task: AgentTask) {
        this.onChange(task);
        const folder = path.basename(task.dir) || task.dir;
        switch (task.state) {
            case 'proposed':
                return this.show(task, `Plan ready · ${folder}`, task.proposal!.summary);
            case 'awaiting_input':
                return this.show(task, `A question first · ${folder}`, task.proposal!.questions![0].question);
            case 'applied': {
                const failed = task.applied!.failed.length;
                const extra = task.unexpected!.length;
                const body = [`${task.applied!.done.length} changes`, failed ? `${failed} failed` : '', extra ? `${extra} not in the proposal` : '']
                    .filter(Boolean).join(' · ');
                return this.show(task, `Done · ${folder}`, body);
            }
            case 'undone':
                return this.show(task, `Undone · ${folder}`, `${task.undone!.done.length} changes reverted`);
            case 'failed':
                return this.show(task, `Failed · ${folder}`, task.error || 'Unknown error');
        }
    }

    private show(task: AgentTask, title: string, body: string) {
        if (!Notification.isSupported()) return console.log(`[Agent] ${title}: ${body}`);
        const n = new Notification({ title, body });
        this.shown.add(n);
        n.on('click', () => this.onOpen(task));
        n.on('close', () => this.shown.delete(n));
        n.show();
    }
}
