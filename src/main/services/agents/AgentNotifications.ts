import { Notification, dialog } from 'electron';
import * as path from 'path';
import { AgentNotifier, AgentTask, AgentTaskManager } from './AgentTaskManager';
import { Change } from './claudeCli';

const LIST_LIMIT = 25;

function describe(c: Change): string {
    const target = c.to ? `${c.path} → ${c.to}` : c.path;
    return `${c.op}  ${target}${c.detail ? `  (${c.detail})` : ''}`;
}

function listChanges(changes: Change[]): string {
    const lines = changes.slice(0, LIST_LIMIT).map(describe);
    if (changes.length > LIST_LIMIT) lines.push(`… and ${changes.length - LIST_LIMIT} more`);
    return lines.join('\n');
}

/**
 * Tells the user about each task with Windows notifications. Until the review window exists,
 * clicking a notification opens a native dialog to approve, cancel or undo.
 */
export class AgentNotifications implements AgentNotifier {
    private manager: AgentTaskManager | null = null;

    attach(manager: AgentTaskManager) {
        this.manager = manager;
    }

    changed(task: AgentTask) {
        const folder = path.basename(task.dir) || task.dir;
        switch (task.state) {
            case 'proposed':
                return this.show(`Proposal ready · ${folder}`, `${task.proposal!.summary} (${task.proposal!.changes.length} changes)`, () => this.review(task));
            case 'awaiting_input':
                return this.show(`Question · ${folder}`, `${task.proposal!.question}\nAnswer: Tactio.exe --agent-answer ${task.id} "<answer>"`);
            case 'applied': {
                const failed = task.applied!.failed.length;
                const extra = task.unexpected!.length;
                const body = [`${task.applied!.done.length} changes`, failed ? `${failed} failed` : '', extra ? `${extra} not in the proposal` : '']
                    .filter(Boolean).join(' · ');
                return this.show(`Done · ${folder}`, body, () => this.offerUndo(task));
            }
            case 'undone':
                return this.show(`Undone · ${folder}`, `${task.undone!.done.length} changes reverted`);
            case 'failed':
                return this.show(`Failed · ${folder}`, task.error || 'Unknown error');
        }
    }

    private show(title: string, body: string, onClick?: () => void) {
        if (!Notification.isSupported()) return console.log(`[Agent] ${title}: ${body}`);
        const n = new Notification({ title, body });
        if (onClick) n.on('click', onClick);
        n.show();
    }

    private async review(task: AgentTask) {
        const { response } = await dialog.showMessageBox({
            type: 'question',
            title: 'Tactio',
            message: task.proposal!.summary,
            detail: `${task.dir}\n\n${listChanges(task.proposal!.changes)}`,
            buttons: ['Apply', 'Cancel task', 'Later'],
            defaultId: 0,
            cancelId: 2
        });
        this.guard(() => {
            if (response === 0) this.manager?.approve(task.id);
            if (response === 1) this.manager?.cancel(task.id);
        });
    }

    private async offerUndo(task: AgentTask) {
        const failed = task.applied!.failed.map(f => `${describe(f.change)}: ${f.reason}`);
        const sections = [listChanges(task.applied!.done)];
        if (task.unexpected!.length) sections.push(`Not in the proposal:\n${listChanges(task.unexpected!)}`);
        if (failed.length) sections.push(`Failed:\n${failed.join('\n')}`);
        const { response } = await dialog.showMessageBox({
            type: 'info',
            title: 'Tactio',
            message: `Applied in ${task.dir}`,
            detail: sections.join('\n\n'),
            buttons: ['Close', 'Undo'],
            defaultId: 0,
            cancelId: 0
        });
        if (response === 1) this.guard(() => this.manager?.undo(task.id));
    }

    private guard(fn: () => void) {
        try {
            fn();
        } catch (err: any) {
            this.show('Tactio', err.message);
        }
    }
}
