import { AgentChange, AgentTask } from "../types";

const STATE_LABELS: Record<AgentTask['state'], string> = {
    proposing: 'Proposing…',
    awaiting_input: 'Question',
    proposed: 'Review',
    applying: 'Applying…',
    applied: 'Done',
    undoing: 'Undoing…',
    undone: 'Undone',
    cancelled: 'Cancelled',
    failed: 'Failed'
};

const SHOWN_TASKS = 20;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function folderName(dir: string): string {
    return dir.split(/[\\/]/).filter(Boolean).pop() || dir;
}

function describe(c: AgentChange): string {
    return c.to ? `${c.op}  ${c.path} → ${c.to}` : `${c.op}  ${c.path}`;
}

/** The folder agent: pick a folder, say what to do, then review, answer or undo each task. */
export class AgentPanel {
    private modal = document.getElementById('agent-modal') as HTMLDivElement;
    private problem = document.getElementById('agent-problem') as HTMLDivElement;
    private dirInput = document.getElementById('agent-dir-input') as HTMLInputElement;
    private dirBtn = document.getElementById('agent-dir-btn') as HTMLButtonElement;
    private intentInput = document.getElementById('agent-intent-input') as HTMLTextAreaElement;
    private startBtn = document.getElementById('agent-start-btn') as HTMLButtonElement;
    private closeBtn = document.getElementById('agent-close-btn') as HTMLButtonElement;
    private list = document.getElementById('agent-task-list') as HTMLDivElement;
    private icon = document.getElementById('agent-icon') as HTMLDivElement;

    // Every task update re-renders the list, so replies being typed are kept here.
    private drafts = new Map<string, string>();

    constructor() {
        this.icon.onclick = () => this.open();
        this.closeBtn.onclick = () => this.modal.classList.add('hidden');
        this.dirBtn.onclick = async () => {
            const dir = await window.api.agentSelectFolder();
            if (dir) this.dirInput.value = dir;
        };
        this.startBtn.onclick = () => this.start();
        this.intentInput.onkeydown = (e) => {
            if (e.key === 'Enter' && e.ctrlKey) this.start();
        };

        window.api.onAgentTasks(tasks => this.render(tasks));
        window.api.onAgentOpen(dir => this.open(dir));
    }

    async open(dir?: string) {
        if (dir) this.dirInput.value = dir;
        this.modal.classList.remove('hidden');
        (this.dirInput.value ? this.intentInput : this.dirInput).focus();
        this.render(await window.api.agentList());
        const status = await window.api.agentStatus();
        this.problem.textContent = status.problem || '';
        this.problem.classList.toggle('hidden', !status.problem);
    }

    private async start() {
        const dir = this.dirInput.value.trim();
        const intent = this.intentInput.value.trim();
        if (!dir || !intent) return;
        await this.call(() => window.api.agentStart(dir, intent));
        this.intentInput.value = '';
    }

    private async call(fn: () => Promise<unknown>) {
        try {
            await fn();
        } catch (e: any) {
            alert(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
        }
    }

    private render(tasks: AgentTask[]) {
        this.list.replaceChildren();
        if (!tasks.length) {
            this.list.append(el('div', 'agent-empty', 'No tasks yet.'));
            return;
        }
        for (const task of tasks.slice(0, SHOWN_TASKS)) this.list.append(this.card(task));
    }

    private card(task: AgentTask): HTMLElement {
        const card = el('div', `agent-task agent-${task.state}`);
        const head = el('div', 'agent-task-head');
        head.append(el('span', 'agent-task-folder', folderName(task.dir)), el('span', 'agent-task-state', STATE_LABELS[task.state]));
        head.title = task.dir;
        card.append(head, el('div', 'agent-task-intent', task.intent));

        switch (task.state) {
            case 'proposed':
                card.append(el('div', 'agent-task-text', task.proposal!.summary), this.changes(task.proposal!.changes));
                card.append(this.reply(task, 'What should change?', [
                    { label: 'Cancel', run: () => window.api.agentCancel(task.id) },
                    { label: 'Adjust', run: (text) => window.api.agentRefine(task.id, text), needsText: true },
                    { label: 'Apply', run: () => window.api.agentApprove(task.id), primary: true }
                ]));
                break;
            case 'awaiting_input':
                card.append(el('div', 'agent-task-text', task.proposal!.question!));
                card.append(this.reply(task, 'Your answer', [
                    { label: 'Cancel', run: () => window.api.agentCancel(task.id) },
                    { label: 'Answer', run: (text) => window.api.agentRefine(task.id, text), needsText: true, primary: true }
                ]));
                break;
            case 'applied':
                card.append(this.changes(task.applied!.done));
                if (task.unexpected!.length) {
                    card.append(el('div', 'agent-task-warn', 'Not in the proposal:'), this.changes(task.unexpected!));
                }
                for (const f of task.applied!.failed) card.append(el('div', 'agent-task-warn', `${describe(f.change)}: ${f.reason}`));
                card.append(this.buttons(task, [{ label: 'Undo', run: () => window.api.agentUndo(task.id) }]));
                break;
            case 'undone':
                card.append(el('div', 'agent-task-text', `${task.undone!.done.length} changes reverted`));
                for (const f of task.undone!.failed) card.append(el('div', 'agent-task-warn', `${describe(f.change)}: ${f.reason}`));
                break;
            case 'failed':
                card.append(el('div', 'agent-task-warn', task.error || 'Unknown error'));
                break;
        }
        return card;
    }

    private changes(changes: AgentChange[]): HTMLElement {
        const ul = el('ul', 'agent-changes');
        for (const c of changes) {
            const li = el('li', undefined, describe(c));
            if (c.detail) li.title = c.detail;
            ul.append(li);
        }
        return ul;
    }

    private reply(task: AgentTask, placeholder: string, buttons: Button[]): HTMLElement {
        const wrap = el('div');
        const input = el('textarea', 'agent-textarea agent-reply');
        input.placeholder = placeholder;
        input.value = this.drafts.get(task.id) || '';
        input.oninput = () => this.drafts.set(task.id, input.value);
        wrap.append(input, this.buttons(task, buttons, input));
        return wrap;
    }

    private buttons(task: AgentTask, buttons: Button[], input?: HTMLTextAreaElement): HTMLElement {
        const row = el('div', 'modal-actions');
        for (const b of buttons) {
            const btn = el('button', b.primary ? 'agent-primary' : 'agent-secondary', b.label);
            btn.onclick = () => {
                const text = input?.value.trim() || '';
                if (b.needsText && !text) return input?.focus();
                if (input) this.drafts.delete(task.id);
                this.call(() => b.run(text));
            };
            row.append(btn);
        }
        return row;
    }
}

interface Button {
    label: string;
    run: (text: string) => Promise<unknown>;
    needsText?: boolean;
    primary?: boolean;
}
