import { App, SuggestModal, TFolder } from "obsidian";

export class FolderListModal extends SuggestModal<TFolder> {
	folders: TFolder[];
	suggestionCallback: (f: TFolder) => void;
	folderCounts: Map<string, number>;
	getCachingEnabled: () => boolean;

	constructor(
		app: App,
		_text: TFolder[],
		suggestionCallback: (f: TFolder) => void,
		folderCounts?: Map<string, number>,
		getCachingEnabled?: () => boolean,
	) {
		super(app);
		this.folders = _text;
		this.suggestionCallback = suggestionCallback;
		this.folderCounts = folderCounts || new Map();
		this.getCachingEnabled = getCachingEnabled || (() => false);
	}

	getSuggestions(query: string): TFolder[] {
		return this.folders
			.filter((folder) =>
				folder.path.toLowerCase().includes(query.toLowerCase()),
			)
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	renderSuggestion(folder: TFolder, el: HTMLElement) {
		// Calculate indentation based on folder depth
		const depth = folder.path.split("/").length;

		// Create tree-like prefix
		let prefix = "";
		if (depth > 1) {
			prefix = "    ".repeat(depth - 2) + "└─ ";
		}

		// Only show count if caching is enabled
		let countDisplay = "";
		if (this.getCachingEnabled()) {
			const count = this.folderCounts.get(folder.path) || 0;
			const itemText = count === 1 ? "item" : "items";
			countDisplay = ` <span class="chronos-folder-list-modal-muted-text">(${count} ${itemText})</span>`;
		}

		const div = el.createEl("div");
		const prefixSpan = document.createElement("span");
		prefixSpan.className = "chronos-folder-list-modal-muted-text";
		prefixSpan.textContent = prefix;
		div.appendChild(prefixSpan);
		div.append(document.createTextNode(folder.path));
		if (countDisplay) {
			const temp = document.createElement("span");
			temp.className = "chronos-folder-list-modal-muted-text";
			// Extract the count and item text from countDisplay string
			const match = countDisplay.match(/\((\d+) (item|items)\)/);
			if (match) {
				temp.textContent = ` (${match[1]} ${match[2]})`;
			}
			div.appendChild(temp);
		}
	}

	onChooseSuggestion(folder: TFolder, _evt: MouseEvent | KeyboardEvent) {
		this.suggestionCallback(folder);
	}
}
