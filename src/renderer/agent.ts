import { AgentChange, AgentTask } from "./types";

type Question = NonNullable<NonNullable<AgentTask['proposal']>['questions']>[number];

const ICONS = {
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'
};

const OTHER = -1;

const card = document.getElementById('card') as HTMLDivElement;
const title = document.getElementById('title') as HTMLHeadingElement;
const subtitle = document.getElementById('subtitle') as HTMLParagraphElement;
const body = document.getElementById('body') as HTMLElement;
const foot = document.getElementById('foot') as HTMLElement;
const closeBtn = document.getElementById('close') as HTMLButtonElement;

let dir = '';
let taskId: string | null = null;
let answers: { option: number; other: string }[] = [];
let questionIndex = 0;

function icon(name: keyof typeof ICONS): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[name];
    return svg;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function button(label: string, kind: 'primary' | 'ghost', run: () => unknown, wide = false): HTMLButtonElement {
    const btn = el('button', `btn btn-${kind}${wide ? ' btn-wide' : ''}`, label);
    btn.onclick = async () => {
        btn.classList.add('loading');
        try {
            await run();
        } catch (e: any) {
            showError(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
        } finally {
            btn.classList.remove('loading');
        }
    };
    return btn;
}

function folderName(path: string): string {
    return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function describe(c: AgentChange): string {
    if (c.op === 'run') return `run ${c.tool}  ${c.path} → ${c.to}`;
    return c.to ? `${c.op}  ${c.path} → ${c.to}` : `${c.op}  ${c.path}`;
}

/** `**bold**` and `code` inside a line, as text nodes so nothing in the answer runs as HTML. */
function inline(text: string): Node[] {
    return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).filter(Boolean).map(part => {
        if (part.startsWith('**') && part.endsWith('**')) return el('strong', undefined, part.slice(2, -2));
        if (part.startsWith('`') && part.endsWith('`')) return el('code', undefined, part.slice(1, -1));
        return document.createTextNode(part);
    });
}

/** A small Markdown reader for answers: headings, lists, tables and paragraphs. */
function markdown(text: string): HTMLElement {
    const root = el('div', 'answer');
    let list: HTMLElement | null = null;
    let table: HTMLElement | null = null;
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trimEnd();
        const bullet = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
        const heading = /^(#{1,4})\s+(.*)$/.exec(line);
        const row = /^\s*\|(.*)\|\s*$/.exec(line);
        if (!bullet) list = null;
        if (!row) table = null;
        if (!line.trim()) continue;
        if (row) {
            if (/^[\s|:-]+$/.test(row[1])) continue;
            if (!table) root.append(table = el('table'));
            const tr = el('tr');
            for (const cell of row[1].split('|')) {
                const td = el('td');
                td.append(...inline(cell.trim()));
                tr.append(td);
            }
            table.append(tr);
        } else if (heading) {
            const h = el('p', 'answer-heading');
            h.append(...inline(heading[2]));
            root.append(h);
        } else if (bullet) {
            if (!list) root.append(list = el(/^\s*\d/.test(line) ? 'ol' : 'ul'));
            const li = el('li');
            li.append(...inline(bullet[1]));
            list.append(li);
        } else {
            const p = el('p');
            p.append(...inline(line));
            root.append(p);
        }
    }
    return root;
}

/** A toggle for repeating the task's request weekly. */
async function repeatButton(task: AgentTask): Promise<HTMLButtonElement> {
    let on = await window.api.agentRepeatGet(task.id);
    const btn = el('button', 'link');
    const sync = () => (btn.textContent = on ? 'Repeats weekly · stop' : 'Repeat weekly');
    btn.onclick = async () => {
        on = await window.api.agentRepeatSet(task.id, !on);
        sync();
    };
    sync();
    return btn;
}

function view(heading: string, sub: string, content: Node[], footer: Node[]) {
    title.textContent = heading;
    subtitle.textContent = sub;
    const wrap = el('div', 'view');
    wrap.append(...content);
    body.replaceChildren(wrap);
    foot.replaceChildren(...footer);
}

function footRow(...nodes: Node[]): HTMLElement {
    const row = el('div', 'foot');
    row.append(...nodes);
    return row;
}

function spacer(): HTMLElement {
    return el('div', 'spacer');
}

function hide() {
    window.api.agentHide();
}

function showError(message: string) {
    const existing = body.querySelector('.error.inline');
    existing?.remove();
    const p = el('p', 'error inline', message);
    p.style.marginTop = '12px';
    body.firstElementChild?.append(p);
}

// --- Views ---

async function compose() {
    taskId = null;
    const folder = el('div', 'folder');
    const path = el('span', 'folder-path', dir || 'No folder chosen');
    path.title = dir;
    const change = el('button', 'link', dir ? 'Change' : 'Choose');
    change.onclick = async () => {
        const picked = await window.api.agentSelectFolder();
        if (picked) {
            dir = picked;
            compose();
        }
    };
    folder.append(icon('folder'), path, change);

    const input = el('textarea');
    input.placeholder = 'Ask about this folder or say what to do, e.g. "Which files are duplicates?" or "Turn the invoices into a CSV"';

    const plan = button('Ask', 'primary', async () => {
        const intent = input.value.trim();
        if (!dir || !intent) return;
        taskId = await window.api.agentStart(dir, intent);
        const task = await window.api.agentGet(taskId);
        if (task) render(task);
    });
    const sync = () => (plan.disabled = !dir || !input.value.trim());
    input.oninput = sync;
    input.onkeydown = (e) => {
        if (e.key === 'Enter' && e.ctrlKey && !plan.disabled) plan.click();
    };
    sync();

    const content: Node[] = [folder, input];
    const status = await window.api.agentStatus();
    if (status.problem) content.unshift(el('div', 'problem', status.problem));

    view('Ask the agent', `Runs on ${status.name}`, content, [footRow(el('span', 'hint', 'Ctrl+Enter'), spacer(), button('Cancel', 'ghost', hide), plan)]);
    input.focus();
}

function working(task: AgentTask) {
    const what = task.state === 'proposing' ? 'Reading the folder and working out an answer or a plan.'
        : task.state === 'applying' ? 'Making the changes.'
        : 'Putting things back.';
    const bars = [92, 78, 54].map(w => {
        const bar = el('div', 'skeleton');
        bar.style.width = `${w}%`;
        return bar;
    });
    view(task.intent, folderName(task.dir), [...bars, el('p', 'note', `${what} You can close this; a notification will tell you when it's done.`)],
        [footRow(spacer(), button('Close', 'ghost', hide))]);
}

function questions(task: AgentTask) {
    const list = task.proposal!.questions!;
    if (answers.length !== list.length) {
        answers = list.map(() => ({ option: NaN, other: '' }));
        questionIndex = 0;
    }
    const q: Question = list[questionIndex];
    const answer = answers[questionIndex];

    const steps = el('div', 'steps');
    list.forEach((_, i) => {
        const step = el('span', `step${i === questionIndex ? ' current' : ''}`);
        if (i < questionIndex) step.append(icon('check'));
        else step.textContent = String(i + 1);
        steps.append(step);
    });
    steps.append(el('span', 'step-count', `${questionIndex + 1} of ${list.length}`));

    const options = el('div', 'options');
    options.setAttribute('role', 'radiogroup');
    const otherInput = el('input', 'text-input other-input');
    otherInput.placeholder = 'Say what you want';
    otherInput.value = answer.other;

    const isLast = questionIndex === list.length - 1;
    const next = button(isLast ? 'Continue' : 'Next', 'primary', async () => {
        if (!isLast) {
            questionIndex++;
            return questions(task);
        }
        const text = list.map((item, i) => {
            const a = answers[i];
            return `${item.question}\n→ ${a.option === OTHER ? a.other.trim() : item.options[a.option]}`;
        }).join('\n\n');
        answers = [];
        await window.api.agentRefine(task.id, text);
    }, true);
    const sync = () => {
        next.disabled = Number.isNaN(answer.option) || (answer.option === OTHER && !answer.other.trim());
    };

    const choices = [...q.options.map((label, i) => ({ label, i })), { label: 'Something else', i: OTHER }];
    for (const choice of choices) {
        const row = el('button', 'option');
        row.setAttribute('role', 'radio');
        row.setAttribute('aria-checked', String(answer.option === choice.i));
        row.append(el('span', 'radio'), el('span', undefined, choice.label));
        row.onclick = () => {
            answer.option = choice.i;
            questions(task);
            if (choice.i === OTHER) (body.querySelector('.other-input') as HTMLInputElement)?.focus();
        };
        options.append(row);
    }

    otherInput.oninput = () => {
        answer.other = otherInput.value;
        sync();
    };
    sync();

    const content: Node[] = [steps, el('p', 'question', q.question)];
    if (q.hint) content.push(el('p', 'question-hint', q.hint));
    content.push(options);
    if (answer.option === OTHER) content.push(otherInput);

    const back = el('button', 'icon-btn');
    back.setAttribute('aria-label', 'Previous question');
    back.append(icon('back'));
    back.disabled = questionIndex === 0;
    back.onclick = () => {
        questionIndex--;
        questions(task);
    };

    const skip = el('button', 'link', 'Skip and let the agent decide');
    skip.onclick = async () => {
        answers = [];
        await window.api.agentRefine(task.id, 'Decide these yourself, using your best judgement.');
    };
    const skipRow = el('div', 'foot-center');
    skipRow.append(skip);

    view(task.intent, folderName(task.dir), content, [footRow(back, next), skipRow]);
}

function plan(task: AgentTask) {
    const proposal = task.proposal!;
    const steps = el('ol', 'plan');
    for (const step of proposal.plan) steps.append(el('li', undefined, step));

    const content: Node[] = [steps];
    if (proposal.changes.length) {
        const toggle = el('button', 'disclose');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.append(el('span', undefined, `${proposal.changes.length} file changes`), icon('chevron'));
        const list = el('ul', 'changes');
        list.hidden = true;
        for (const c of proposal.changes) {
            const li = el('li', undefined, describe(c));
            li.title = c.detail || describe(c);
            list.append(li);
        }
        toggle.onclick = () => {
            list.hidden = !list.hidden;
            toggle.setAttribute('aria-expanded', String(!list.hidden));
        };
        content.push(toggle, list);
    }

    const adjust = el('div', 'adjust');
    const input = el('input', 'text-input');
    input.placeholder = 'Ask for a change to the plan';
    const send = el('button', 'icon-btn');
    send.setAttribute('aria-label', 'Send change');
    send.append(icon('send'));
    const refine = async () => {
        const text = input.value.trim();
        if (text) await window.api.agentRefine(task.id, text);
    };
    send.onclick = refine;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') refine();
    };
    adjust.append(input, send);
    content.push(adjust);

    const run = button('Run', 'primary', async () => {
        await window.api.agentApprove(task.id);
        hide();
    });
    view(proposal.summary, `In ${folderName(task.dir)}`, content,
        [footRow(button('Cancel task', 'ghost', () => window.api.agentCancel(task.id)), spacer(), run)]);
    run.focus();
}

async function answered(task: AgentTask) {
    const proposal = task.proposal!;
    const content: Node[] = [markdown(proposal.answer!)];

    const adjust = el('div', 'adjust');
    const input = el('input', 'text-input');
    input.placeholder = 'Ask a follow-up';
    const send = el('button', 'icon-btn');
    send.setAttribute('aria-label', 'Send follow-up');
    send.append(icon('send'));
    const follow = async () => {
        const text = input.value.trim();
        if (text) await window.api.agentRefine(task.id, text);
    };
    send.onclick = follow;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') follow();
    };
    adjust.append(input, send);
    content.push(adjust);

    const saved = el('p', 'note');
    const save = button('Save as .md', 'ghost', async () => {
        const file = await window.api.agentSaveAnswer(task.id);
        saved.textContent = `Saved to ${file}`;
        if (!saved.isConnected) body.firstElementChild?.append(saved);
    });
    const copy = button('Copy', 'ghost', async () => {
        await window.api.copyToClipboard(proposal.answer!);
        copy.textContent = 'Copied';
    });
    view(proposal.summary || task.intent, `In ${folderName(task.dir)}`, content,
        [footRow(copy, save, spacer(), button('Close', 'primary', hide)), footCenter(await repeatButton(task))]);
}

function footCenter(...nodes: Node[]): HTMLElement {
    const row = el('div', 'foot-center');
    row.append(...nodes);
    return row;
}

async function result(task: AgentTask) {
    const folder = folderName(task.dir);
    const close = button('Close', 'primary', hide);
    const retry = button('Try again', 'ghost', async () => {
        taskId = await window.api.agentRetry(task.id);
        const next = await window.api.agentGet(taskId);
        if (next) render(next);
    });

    if (task.state === 'applied') {
        const content: Node[] = [];
        for (const f of task.applied!.failed) content.push(el('p', 'warn', `Couldn't ${describe(f.change)}: ${f.reason}`));
        if (task.unexpected!.length) content.push(el('p', 'warn', `Also did, without it being in the plan: ${task.unexpected!.map(describe).join(', ')}`));
        const n = task.applied!.done.length;
        const undo = n ? [button('Undo', 'ghost', () => window.api.agentUndo(task.id))] : [];
        return view(n ? 'Done' : 'Nothing changed', `${n} change${n === 1 ? '' : 's'} in ${folder} · ${task.intent}`, content,
            [footRow(...undo, spacer(), close), footCenter(await repeatButton(task))]);
    }
    if (task.state === 'undone') {
        const content = task.undone!.failed.map(f => el('p', 'warn', `Couldn't revert ${describe(f.change)}: ${f.reason}`));
        return view('Undone', `${folder} is back to how it was · ${task.intent}`, content, [footRow(spacer(), close)]);
    }
    if (task.state === 'cancelled') {
        return view('Cancelled', `${folder} · ${task.intent}`, [], [footRow(retry, spacer(), close)]);
    }
    view("It didn't work", `${folder} · ${task.intent}`, [el('p', 'error', task.error || 'Unknown error')], [footRow(retry, spacer(), close)]);
}

function render(task: AgentTask) {
    taskId = task.id;
    dir = task.dir;
    switch (task.state) {
        case 'proposing':
        case 'applying':
        case 'undoing':
            return working(task);
        case 'awaiting_input':
            return questions(task);
        case 'proposed':
            return plan(task);
        case 'answered':
            return answered(task);
        default:
            return result(task);
    }
}

// --- Wiring ---

closeBtn.append(icon('close'));
closeBtn.onclick = hide;
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
});

new ResizeObserver(() => window.api.agentFit(card.offsetHeight + 16)).observe(card);

window.api.onAgentShow(async (shown) => {
    if (shown.taskId) {
        const task = await window.api.agentGet(shown.taskId);
        if (task) return render(task);
    }
    if (shown.dir) dir = shown.dir;
    compose();
});

window.api.onAgentTask((task) => {
    if (task.id === taskId) render(task);
});
