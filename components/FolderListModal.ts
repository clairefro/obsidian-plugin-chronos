import { App, Notice, SuggestModal, TFolder } from "obsidian";

export class FolderListModal extends SuggestModal<TFolder> {
	folders: TFolder[];
	suggestionCallback: (f: TFolder) => void;

	constructor(
		app: App,
		_text: TFolder[],
		suggestionCallback: (f: TFolder) => void,
	) {
		super(app);
		this.folders = _text;
		this.suggestionCallback = suggestionCallback;
	}

	getSuggestions(query: string): TFolder[] {
		return this.folders.filter((folder) =>
			folder.name.toLowerCase().includes(query.toLowerCase()),
		);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement) {
		el.createEl("div", { text: folder.name });
	}

	onChooseSuggestion(folder: TFolder, evt: MouseEvent | KeyboardEvent) {
		this.suggestionCallback(folder);
	}
}
