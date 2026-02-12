import { Action } from "../types";

export class PromptManager {
    // Modal & Views
    private modal = document.getElementById('prompt-manager-modal') as HTMLDivElement;
    private listView = document.getElementById('manager-list-view') as HTMLDivElement;
    private formView = document.getElementById('manager-form-view') as HTMLDivElement;
    private promptsList = document.getElementById('manager-prompts-list') as HTMLDivElement;

    // List Controls
    private addBtn = document.getElementById('manager-add-btn') as HTMLButtonElement;
    private closeBtn = document.getElementById('manager-close-btn') as HTMLButtonElement;

    // Form Controls
    private formTitle = document.getElementById('manager-form-title') as HTMLHeadingElement;
    private editIndexInput = document.getElementById('edit-index-input') as HTMLInputElement;
    private labelInput = document.getElementById('prompt-label-input') as HTMLInputElement;
    private iconInput = document.getElementById('prompt-icon-input') as HTMLInputElement;
    private styleSelect = document.getElementById('prompt-style-select') as HTMLSelectElement;
    private textInput = document.getElementById('prompt-text-input') as HTMLTextAreaElement;

    private saveBtn = document.getElementById('prompt-save-btn') as HTMLButtonElement;
    private cancelBtn = document.getElementById('prompt-cancel-btn') as HTMLButtonElement;
    private deleteBtn = document.getElementById('prompt-delete-btn') as HTMLButtonElement;

    // Emoji
    private emojiBtn = document.getElementById('emoji-picker-btn') as HTMLButtonElement;
    private emojiPalette = document.getElementById('emoji-palette') as HTMLDivElement;
    private commonEmojis = [
        '📝', '🔍', '✨', '🔥', '💡', '🚀', '✅', '❌',
        '🇪🇸', '🇬🇧', '🇫🇷', '🇩🇪', '🇮🇹', '🇯🇵', '🇨🇳', '🇷🇺',
        '📧', '💬', '📞', '📅', '📊', '📈', '📉', '📎',
        '🤖', '🧠', '💻', '📱', '⌨️', '🖱️', '🔋', '🔌',
        '💼', '📁', '📂', '🗂️', '🗑️', '🔒', '🔓', '🔑',
        '🐛', '🐞', '🕷️', '🕸️', '🦠', '🧬', '🔬', '🔭',
        '❤️', '👍', '👎', '👏', '🙌', '🤝', '🙏', '💪'
    ];

    private currentActions: Action[] = [];
    private onSaveActions: (actions: Action[]) => void;

    constructor(onSaveActions: (actions: Action[]) => void) {
        this.onSaveActions = onSaveActions;
        this.setupEventListeners();
        this.setupEmojiPicker();
    }

    private setupEventListeners() {
        if (this.addBtn) this.addBtn.onclick = () => this.openForm();
        if (this.closeBtn) this.closeBtn.onclick = () => this.hide();

        if (this.cancelBtn) this.cancelBtn.onclick = () => this.showListView();

        if (this.saveBtn) {
            this.saveBtn.onclick = () => this.savePrompt();
        }

        if (this.deleteBtn) {
            this.deleteBtn.onclick = () => this.deletePrompt();
        }
    }

    private setupEmojiPicker() {
        if (!this.emojiBtn || !this.emojiPalette) return;

        this.emojiBtn.onclick = () => {
            this.emojiPalette.classList.toggle('hidden');
        };

        // Populate
        this.commonEmojis.forEach(emoji => {
            const span = document.createElement('span');
            span.textContent = emoji;
            span.onclick = () => {
                this.iconInput.value = emoji;
                this.emojiPalette.classList.add('hidden');
            };
            this.emojiPalette.appendChild(span);
        });
    }

    public open(actions: Action[]) {
        this.currentActions = [...actions]; // copy
        this.renderList();
        this.showListView();
        this.modal.classList.remove('hidden');
    }

    public hide() {
        this.modal.classList.add('hidden');
    }

    private showListView() {
        if (this.listView) this.listView.classList.remove('hidden');
        if (this.formView) this.formView.classList.add('hidden');
    }

    private showFormView() {
        if (this.listView) this.listView.classList.add('hidden');
        if (this.formView) this.formView.classList.remove('hidden');
        this.emojiPalette.classList.add('hidden');
    }

    private renderList() {
        if (!this.promptsList) return;
        this.promptsList.innerHTML = '';

        this.currentActions.forEach((action, index) => {
            const div = document.createElement('div');
            div.className = 'manager-item';
            div.innerHTML = `
                <span class="icon">${action.icon || '⚡'}</span>
                <span class="label">${action.label}</span>
                <span class="style-badge">${action.style || 'concise'}</span>
            `;
            div.onclick = () => this.openForm(index);
            this.promptsList.appendChild(div);
        });
    }

    private openForm(index: number = -1) {
        this.showFormView();

        if (index === -1) {
            // New
            this.formTitle.innerText = "Add New Prompt";
            this.editIndexInput.value = "-1";
            this.labelInput.value = "";
            this.iconInput.value = "";
            this.styleSelect.value = "concise";
            this.textInput.value = "";
            if (this.deleteBtn) this.deleteBtn.classList.add('hidden');
        } else {
            // Edit
            const action = this.currentActions[index];
            this.formTitle.innerText = "Edit Prompt";
            this.editIndexInput.value = index.toString();

            this.labelInput.value = action.label;
            this.iconInput.value = action.icon || "";
            this.styleSelect.value = action.style || "concise";
            this.textInput.value = action.prompt;

            if (this.deleteBtn) this.deleteBtn.classList.remove('hidden');
        }
    }

    private savePrompt() {
        const index = parseInt(this.editIndexInput.value);
        const newAction: Action = {
            label: this.labelInput.value.trim() || 'Untitled',
            prompt: this.textInput.value,
            icon: this.iconInput.value.trim(),
            style: this.styleSelect.value
        };

        if (index === -1) {
            this.currentActions.push(newAction);
        } else {
            this.currentActions[index] = newAction;
        }

        this.notifyChange();
        this.showListView();
        this.renderList();
    }

    private deletePrompt() {
        const index = parseInt(this.editIndexInput.value);
        if (index > -1) {
            if (confirm('Delete this prompt?')) {
                this.currentActions.splice(index, 1);
                this.notifyChange();
                this.showListView();
                this.renderList();
            }
        }
    }

    private notifyChange() {
        this.onSaveActions(this.currentActions);
    }
}
