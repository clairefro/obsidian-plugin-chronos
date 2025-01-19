import {
	Plugin,
	App,
	Setting,
	PluginSettingTab,
	Notice,
	Editor,
	TFile,
	MarkdownView,
	setTooltip,
} from "obsidian";

import { ChronosPluginSettings } from "./types";

import { TextModal } from "./components/TextModal";
import { knownLocales } from "./util/knownLocales";
import {
	cheatsheet,
	templateAdvanced,
	templateBasic,
	templateBlank,
} from "./util/snippets";
import { DEFAULT_LOCALE, PEPPER } from "./constants";
import { ChronosTimeline } from "./lib/ChronosTimeline";
import { decrypt, encrypt } from "./util/vanillaEncrypt";
import { GenAi } from "./lib/ai/GenAi";

const DEFAULT_SETTINGS: ChronosPluginSettings = {
	selectedLocale: DEFAULT_LOCALE,
	align: "left",
	clickToUse: false,
	roundRanges: false,
};

export default class ChronosPlugin extends Plugin {
	settings: ChronosPluginSettings;

	async onload() {
		console.log("Loading Chronos Timeline Plugin...");

		this.settings = (await this.loadData()) || DEFAULT_SETTINGS;
		this.addSettingTab(new ChronosPluginSettingTab(this.app, this));

		this.registerEvent(
			this.app.vault.on("rename", async (file, oldPath) => {
				await this._updateWikiLinks(oldPath, file.path);
			}),
		);

		this.registerMarkdownCodeBlockProcessor(
			"chronos",
			this._renderChronosBlock.bind(this),
		);

		this.addCommand({
			id: "insert-timeline-blank",
			name: "Insert timeline (blank)",
			editorCallback: (editor, _view) => {
				this._insertSnippet(editor, templateBlank);
			},
		});

		this.addCommand({
			id: "insert-timeline-basic",
			name: "Insert timeline example (basic)",
			editorCallback: (editor, _view) => {
				this._insertSnippet(editor, templateBasic);
			},
		});

		this.addCommand({
			id: "insert-timeline-advanced",
			name: "Insert timeline example (advanced)",
			editorCallback: (editor, _view) => {
				this._insertSnippet(editor, templateAdvanced);
			},
		});
		this.addCommand({
			id: "generate-timeline-ai",
			name: "Generate timeline with AI",
			editorCallback: (editor, _view) => {
				this._generateTimelineWithAi(editor);
			},
		});
	}

	onunload() {}

	async loadSettings() {
		this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private _insertSnippet(editor: Editor, snippet: string) {
		const cursor = editor.getCursor();
		editor.replaceRange(snippet, cursor);
	}

	private _insertTextAfterSelection(editor: Editor, textToInsert: string) {
		const cursor = editor.getCursor("to");
		const padding = "\n\n";
		editor.replaceRange(padding + textToInsert, cursor);
	}

	private _renderChronosBlock(source: string, el: HTMLElement) {
		const container = el.createEl("div", {
			cls: "chronos-timeline-container",
		});
		const timeline = new ChronosTimeline({
			container,
			settings: this.settings,
		});

		try {
			timeline.render(source);
			// handle note linking
			timeline.on("mouseDown", (event) => {
				const itemId = event.item;
				if (itemId) {
					event.event.preventDefault();
					const item = timeline.items?.find((i) => i.id === itemId);

					const openInNewLeaf =
						event.event.button === 1 || event.event.shiftKey;

					if (item?.cLink) {
						this._openFileFromWikiLink(item.cLink, openInNewLeaf);
					}
				}
			});

			// Add hover preview for linked notes
			timeline.on("itemover", async (event) => {
				const itemId = event.item;
				if (itemId) {
					const item = timeline.items?.find((i) => i.id === itemId);
					if (item?.cLink) {
						// Get the target element to show hover on
						const targetEl = event.event.target as HTMLElement;

						// Use Obsidian's built-in hover preview
						this.app.workspace.trigger("hover-link", {
							event: event.event,
							source: "chronos-timeline",
							hoverParent: container,
							targetEl: targetEl,
							linktext: item.cLink,
						});
					}
				}
			});
			// Close item preview on item out
			timeline.on("itemout", () => {
				// Force close any open hovers
				this.app.workspace.trigger("hover-link:close");
			});

			// Add click to use functionality and UI hints if,enabled
			if (this.settings.clickToUse && container) {
				timeline.timeline?.setOptions({
					clickToUse: this.settings.clickToUse,
				});

				timeline.on("mouseOver", (e) => {
					if (
						this.settings.clickToUse &&
						!container.querySelectorAll(".vis-active").length
					) {
						setTooltip(container, "Click to use");
					} else {
						setTooltip(container, "");
					}
				});
			}
		} catch (error) {
			console.log(error);
		}
	}

	async _openFileFromWikiLink(wikiLink: string, openInNewLeaf = false) {
		const cleanedLink = wikiLink.replace(/^\[\[|\]\]$/g, "");

		// Check if the link contains a section/heading
		const [filename, section] = cleanedLink.split("#");
		const [path, alias] = cleanedLink.split("|");

		const pathNoHeader = path.split("#")[0];

		try {
			const file =
				// 1. Try with file finder and match based on full path or alias
				this.app.vault
					.getFiles()
					.find(
						(file) =>
							file.path === pathNoHeader + ".md" ||
							file.path === pathNoHeader ||
							file.basename === pathNoHeader,
					) ||
				// 2. Try matching by basename (case-insensitive)
				this.app.vault
					.getFiles()
					.find(
						(file) =>
							file.basename.toLowerCase() ===
							alias?.toLowerCase(),
					) ||
				null; // Return null if no match is found
			if (file) {
				let leaf = this.app.workspace.getLeaf(false); // open in current leaf by default
				if (openInNewLeaf) {
					// apparently getLeaf("tab") opens the link in a new tab
					leaf = this.app.workspace.getLeaf("tab");
				}
				const line = section
					? await this._findLineForHeading(file, section)
					: 0;

				await leaf.openFile(file, {
					active: true,
					// If a section is specified, try to scroll to that heading
					state: {
						focus: true,
						line,
					},
				});

				/* set cursor to heading if present */
				line &&
					setTimeout(() => {
						const editor =
							this.app.workspace.getActiveViewOfType(
								MarkdownView,
							)?.editor;

						if (editor && line != null) {
							editor.setCursor(line + 30);
						}
					}, 100);
			} else {
				const msg = `Linked note not found: ${filename}`;
				console.warn(msg);
				new Notice(msg);
			}
		} catch (error) {
			const msg = `Error opening file: ${error.message}`;
			console.error(msg);
			new Notice(msg);
		}
	}

	// Helper method to find the line number for a specific heading
	private async _findLineForHeading(
		file: TFile,
		heading: string,
	): Promise<number | undefined> {
		const fileContent = await this.app.vault.read(file);
		const lines = fileContent.split("\n");

		// Find the line number of the heading
		const headingLine = lines.findIndex(
			(line) =>
				line.trim().replace("#", "").trim().toLowerCase() ===
				heading.toLowerCase(),
		);

		return headingLine !== -1 ? headingLine : 0;
	}

	private async _generateTimelineWithAi(editor: Editor) {
		if (!editor) {
			new Notice(
				"Make sure you are highlighting text in your note to generate a timeline from",
			);
		}

		const selection = this._getCurrentSelectedText(editor);
		if (!selection) {
			new Notice(
				"Highlight some text you'd like to convert into a timeline, then run the generate command again",
			);
			return;
		}
		// open loading modal
		const loadingModal = new TextModal(this.app, `Working on it....`);
		loadingModal.open();
		try {
			const chronos = await this._textToChronos(selection);
			chronos && this._insertTextAfterSelection(editor, chronos);
		} catch (e) {
			console.error(e);

			loadingModal.setText(e.message);
			return;
		}
		loadingModal.close();
	}

	private async _textToChronos(selection: string): Promise<string | void> {
		if (!this.settings.key) {
			new Notice(
				"No API Key found. Please add an OpenAI API key in Chronos Timeline Plugin Settings",
			);
			return;
		}
		const res = await new GenAi(this._getApiKey()).toChronos(selection);
		return res;
	}

	private _getCurrentSelectedText(editor: Editor): string {
		return editor ? editor.getSelection() : "";
	}

	private _getApiKey() {
		return decrypt(this.settings.key || "", PEPPER);
	}

	private async _updateWikiLinks(oldPath: string, newPath: string) {
		const files = this.app.vault.getMarkdownFiles();

		const updatedFiles = [];
		console.log(
			`Checking files for 'chronos' blocks to see whether there is a need to update links to ${this._normalizePath(
				newPath,
			)}...`,
		);
		for (const file of files) {
			const content = await this.app.vault.read(file);
			const hasChronosBlock = /```(?:\s*)chronos/.test(content);
			if (hasChronosBlock) {
				const updatedContent = this._updateLinksInChronosBlocks(
					content,
					oldPath,
					newPath,
				);

				if (updatedContent !== content) {
					console.log("UPDATING ", file.path);
					updatedFiles.push(file.path);

					await this.app.vault.modify(file, updatedContent);
				}
			}
		}
		console.log(`Done checking files with 'chronos' blocks.`);
		if (updatedFiles.length) {
			console.log(
				`Updated links to ${this._normalizePath(newPath)} in ${
					updatedFiles.length
				} files: `,
				updatedFiles,
			);
		}
	}

	private _updateLinksInChronosBlocks(
		content: string,
		oldPath: string,
		newPath: string,
	): string {
		const codeFenceRegex = /```(?:\s*)chronos([\s\S]*?)```/g;
		let match: RegExpExecArray | null;
		let modifiedContent = content;

		while ((match = codeFenceRegex.exec(content)) !== null) {
			const originalFence = match[0];
			const fenceContent = match[1];

			const normalizedOldPath = this._normalizePath(oldPath);
			const normalizedNewPath = this._normalizePath(newPath);

			// Replace wiki links inside the code fence
			const updatedFenceContent = fenceContent.replace(
				new RegExp(
					`\\[\\[${this._escapeRegExp(normalizedOldPath)}\\]\\]`,
					"g",
				),
				`[[${normalizedNewPath}]]`,
			);

			// Replace the entire code fence in the content
			modifiedContent = modifiedContent.replace(
				originalFence,
				`\`\`\`chronos${updatedFenceContent}\`\`\``,
			);
		}

		return modifiedContent;
	}

	private _normalizePath(path: string) {
		// strip aliases and .md extension
		return path.replace(/(\|.+$)|(\.md$)/g, "");
	}

	private _escapeRegExp(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}
}

class ChronosPluginSettingTab extends PluginSettingTab {
	plugin: ChronosPlugin;

	constructor(app: App, plugin: ChronosPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		const supportedLocales: string[] = [];
		const supportedLocalesNativeDisplayNames: Intl.DisplayNames[] = [];

		// get locales SUPPORTED by the user's environment, based off list of possible locales
		knownLocales.forEach((locale) => {
			if (Intl.DateTimeFormat.supportedLocalesOf(locale).length) {
				supportedLocales.push(locale);
			}
		});

		// get native display names of each locale
		supportedLocales.forEach((locale) => {
			const nativeDisplayNames = new Intl.DisplayNames([locale], {
				type: "language",
			});
			supportedLocalesNativeDisplayNames.push(
				nativeDisplayNames.of(locale) as unknown as Intl.DisplayNames,
			);
		});

		containerEl.createEl("h2", {
			text: "Display settings",
			cls: "chronos-setting-header",
		});

		new Setting(containerEl)
			.setName("Select locale")
			.setDesc("Choose a locale for displaying dates")
			.addDropdown((dropdown) => {
				supportedLocales.forEach((locale, i) => {
					const localeDisplayName =
						supportedLocalesNativeDisplayNames[i];
					const label = `${localeDisplayName} (${locale})`;
					dropdown.addOption(locale, label);
				});

				const savedLocale =
					this.plugin.settings.selectedLocale || DEFAULT_LOCALE;

				dropdown.setValue(savedLocale);

				dropdown.onChange((value) => {
					this.plugin.settings.selectedLocale = value;
					this.plugin.saveData(this.plugin.settings);
				});
			});

		new Setting(containerEl)
			.setName("Require click to use")
			.setDesc(
				"Require clicking on a timeline to activate features like zoom and scroll",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.clickToUse)
					.onChange(async (value) => {
						if (value) {
							new Notice(
								"Refresh rendering of timlines for change to take effect",
							);
						}
						this.plugin.settings.clickToUse = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Round endcaps on ranges")
			.setDesc(
				"Adds rounding to ranged events to make start and end clear",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.roundRanges)
					.onChange(async (value) => {
						if (value) {
							new Notice(
								"Refresh rendering of timlines for change to take effect",
							);
						}
						this.plugin.settings.roundRanges = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Item alignment")
			.setDesc(
				"Alignement of event boxes and item text (re-rerender timeline to see change)",
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("left", "Left")
					.addOption("center", "Center")
					.addOption("right", "Right")
					.setValue(this.plugin.settings.align)
					.onChange(async (value: "left" | "center" | "right") => {
						this.plugin.settings.align = value;
						await this.plugin.saveSettings();
					}),
			);

		containerEl.createEl("h2", {
			text: "AI settings",
			cls: "chronos-setting-header",
		});

		new Setting(containerEl)
			.setName("OpenAI API key")
			.setDesc("(optional) For generating timelines with AI")
			.addText((text) =>
				text
					.setPlaceholder("Enter your OpenAI API Key")
					.setValue(
						this.plugin.settings.key
							? decrypt(this.plugin.settings.key, PEPPER)
							: "",
					)
					.onChange(async (value) => {
						if (!value.trim()) {
							this.plugin.settings.key = "";
						} else {
							this.plugin.settings.key = encrypt(
								value.trim(),
								PEPPER,
							);
						}
						await this.plugin.saveSettings();
					}),
			);

		containerEl.createEl("h2", {
			text: "Cheatsheet",
			cls: "chronos-setting-header",
		});

		const textarea = containerEl.createEl("textarea", {
			cls: "chronos-settings-md-container",
			text: cheatsheet,
		});

		textarea.readOnly = true;

		new Setting(containerEl).addButton((btn) => {
			btn.setButtonText("Copy cheatsheet")
				.setCta()
				.onClick(async () => {
					try {
						await navigator.clipboard.writeText(cheatsheet);
						new Notice(
							"Cheatsheet copied to clipboard!\nPaste it in a new Obsidian note to learn Chronos syntax",
						);
					} catch (err) {
						console.error("Failed to copy cheatsheet:", err);
						new Notice("Failed to copy cheatsheet");
					}
				});
		});

		const link = document.createElement("a");
		link.textContent = "Learn more";
		link.href = "https://github.com/clairefro/obsidian-plugin-chronos";
		link.target = "_blank";
		link.style.textDecoration = "underline";

		containerEl.appendChild(link);
	}
}
