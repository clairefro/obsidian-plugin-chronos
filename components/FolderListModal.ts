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
		return this.folders.filter((folder) =>
			folder.path.toLowerCase().includes(query.toLowerCase()),
		);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement) {
		const count = this.folderCounts.get(folder.path) || 0;
		const itemText = count === 1 ? "item" : "items";
		el.createEl("div", { text: `${folder.path} (${count} ${itemText})` });
	}

	onChooseSuggestion(folder: TFolder, evt: MouseEvent | KeyboardEvent) {
		this.suggestionCallback(folder);
	}
}
