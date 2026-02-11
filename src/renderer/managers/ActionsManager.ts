import { Action } from "../types";
import { UIManager } from "./UIManager";

export class ActionsManager {
    private uiManager: UIManager;
    private onActionTrigger: (label: string, prompt: string, style?: string) => void;
    private onOpenPromptManager: () => void;

    private currentActions: Action[] = [];

    constructor(
        uiManager: UIManager,
        onActionTrigger: (label: string, prompt: string, style?: string) => void,
        onOpenPromptManager: () => void
    ) {
        this.uiManager = uiManager;
        this.onActionTrigger = onActionTrigger;
        this.onOpenPromptManager = onOpenPromptManager;
    }

    public render(actions: Action[]) {
        this.currentActions = actions;
        const container = this.uiManager.actionsList;
        if (!container) return;

        container.innerHTML = '';

        if (!actions || actions.length === 0) {
            const msg = document.createElement('div');
            msg.className = 'message';
            msg.textContent = 'No actions found. Add one below.';
            container.appendChild(msg);
        } else {
            actions.forEach((action, index) => {
                const button = document.createElement('button');
                button.className = 'action-btn';
                button.textContent = action.icon || action.label.substring(0, 2);

                const shortcutHint = index < 9 ? ` (Alt+${index + 1})` : '';
                button.title = action.label + shortcutHint;

                button.onclick = () => this.onActionTrigger(action.label, action.prompt, action.style);
                container.appendChild(button);
            });
        }

        // Add + Button
        const addBtn = document.createElement('button');
        addBtn.className = 'action-btn';
        addBtn.textContent = '+';
        addBtn.title = 'Manage Prompts';
        addBtn.style.border = '1px dashed #555';
        addBtn.onclick = () => this.onOpenPromptManager();
        container.appendChild(addBtn);
    }

    public getActionByIndex(index: number): Action | undefined {
        return this.currentActions[index];
    }
}
