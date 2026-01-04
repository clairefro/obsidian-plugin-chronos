import { App, Notice, SuggestModal, TFolder } from "obsidian";

export class FolderListModal extends SuggestModal<TFolder> {
	folders: TFolder[];
	suggestionCallback: (f: TFolder) => void;
	folderCounts: Map<string, number>;

	constructor(
		app: App,
		_text: TFolder[],
		suggestionCallback: (f: TFolder) => void,
		folderCounts?: Map<string, number>,
	) {
		super(app);
		this.folders = _text;
		this.suggestionCallback = suggestionCallback;
		this.folderCounts = folderCounts || new Map();
	}

	getSuggestions(query: string): TFolder[] {
		return this.folders
			.filter((folder) =>
				folder.path.toLowerCase().includes(query.toLowerCase()),
			)
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	renderSuggestion(folder: TFolder, el: HTMLElement) {
		const count = this.folderCounts.get(folder.path) || 0;
		const itemText = count === 1 ? "item" : "items";

		// Calculate indentation based on folder depth
		const depth = folder.path.split("/").length;

		// Create tree-like prefix
		let prefix = "";
		if (depth > 1) {
			prefix = "    ".repeat(depth - 2) + "└─ ";
		}

		el.createEl("div").innerHTML =
			`${prefix}${folder.path} <span class="chronos-folder-list-modal-item-count">(${count} ${itemText})</span>`;
	}

	onChooseSuggestion(folder: TFolder, _evt: MouseEvent | KeyboardEvent) {
		this.suggestionCallback(folder);
	}
}
