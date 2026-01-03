import {
	Plugin,
	App,
	Setting,
	PluginSettingTab,
	Notice,
	Editor,
	TFile,
	TFolder,
	MarkdownView,
	setTooltip,
} from "obsidian";

import { ChronosPluginSettings } from "./types";

import { TextModal } from "./components/TextModal";
import { FolderListModal } from "./components/FolderListModal";
import { knownLocales } from "./util/knownLocales";
import {
	DEFAULT_LOCALE,
	PEPPER,
	PROVIDER_DEFAULT_MODELS,
	DETECTION_PATTERN_TEXT,
	DETECTION_PATTERN_HTML,
	DETECTION_PATTERN_CODEBLOCK,
} from "./constants";

// HACKY IMPORT TO ACCOMODATE SYMLINKS IN LOCAL DEV
import * as ChronosLib from "chronos-timeline-md";
const ChronosTimeline: any =
	(ChronosLib as any).ChronosTimeline ??
	(ChronosLib as any).default ??
	(ChronosLib as any);

// Debug: uncomment to inspect what was loaded if needed
// console.debug('Chronos lib exports:', ChronosLib);

import { decrypt, encrypt } from "./util/vanillaEncrypt";

const DEFAULT_SETTINGS: ChronosPluginSettings = {
	selectedLocale: DEFAULT_LOCALE,
	align: "left",
	clickToUse: false,
	roundRanges: false,
	useUtc: true,
	useAI: true,
};

export default class ChronosPlugin extends Plugin {
	settings: ChronosPluginSettings;
	private observedEditors = new Set<HTMLElement>();

	async onload() {
		console.log("Loading Chronos Timeline Plugin....");

		this.settings = (await this.loadData()) || DEFAULT_SETTINGS;

		// Migrate legacy single `key` into provider-specific `aiKeys.openai` if present
		if ((this.settings as any).key) {
			(this.settings as any).aiKeys = {
				...(this.settings as any).aiKeys,
				openai:
					(this.settings as any).aiKeys?.openai ||
					(this.settings as any).key,
			};
			// keep legacy `key` for backward compat but persist migration
			await this.saveSettings();
		}

		// Ensure aiModels exists and fill missing providers with defaults
		(this.settings as any).aiModels = {
			...(PROVIDER_DEFAULT_MODELS as any),
			...((this.settings as any).aiModels || {}),
		};

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

		this.registerMarkdownPostProcessor((element, context) => {
			const inlineCodes = element.querySelectorAll("code");

			inlineCodes.forEach((codeEl) => {
				if (codeEl.closest("pre")) return; // Skip fenced code blocks

				let match;
				if (
					(match = DETECTION_PATTERN_HTML.exec(
						codeEl.textContent ?? "",
					)) !== null
				) {
					const date_match = /\[.*?\]/.exec(match[1]);
					codeEl.textContent =
						date_match == null
							? "Chronos Error format..."
							: new Date(
									date_match[0].slice(1, -1),
								).toLocaleDateString(
									this.settings.selectedLocale,
									{
										month: "short",
										day: "2-digit",
										year: "2-digit",
									},
								);
				}
			});
		});

		this.addCommand({
			id: "insert-timeline-blank",
			name: "Insert timeline (blank)",
			editorCallback: (editor, _view) => {
				this._insertSnippet(editor, ChronosTimeline.templates.blank);
			},
		});

		this.addCommand({
			id: "insert-timeline-basic",
			name: "Insert timeline example (basic)",
			editorCallback: (editor, _view) => {
				this._insertSnippet(editor, ChronosTimeline.templates.basic);
			},
		});

		this.addCommand({
			id: "insert-timeline-advanced",
			name: "Insert timeline example (advanced)",
			editorCallback: (editor, _view) => {
				this._insertSnippet(editor, ChronosTimeline.templates.advanced);
			},
		});

		this.addCommand({
			id: "generate-timeline-folder",
			name: "Generate timeline from folder",
			editorCallback: (editor, _view) => {
				this._generateTimelineFromFolder(editor);
			},
		});

		this.addCommand({
			id: "generate-timeline-ai",
			name: "Generate timeline with AI",
			editorCheckCallback: (checking, editor, _view) => {
				if (checking) {
					return this.settings.useAI;
				} else {
					this._generateTimelineWithAi(editor);
				}
			},
		});
	}

	onunload() {
		// Clean up resize observers
		this.observedEditors.forEach((editorEl) => {
			const observer = (editorEl as any)._chronosResizeObserver;

			if (observer) {
				observer.disconnect();
				delete (editorEl as any)._chronosResizeObserver;
			}
		});
		this.observedEditors.clear();
		console.log("Chronos plugin unloaded, all observers cleaned up");
	}

	async loadSettings() {
		this.settings = {
			...DEFAULT_SETTINGS,
			...(await this.loadData()),
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private _insertSnippet(editor: Editor, snippet: string) {
		const cursor = editor.getCursor();
		editor.replaceRange(snippet, cursor);
	}

	/* Utility method to get current editor width */
	private _getCurrentEditorWidth(container: HTMLElement): number {
		const editorEl = container.closest(
			".markdown-source-view",
		) as HTMLElement;
		if (editorEl) {
			return editorEl.offsetWidth;
		}

		console.log(
			"No .markdown-source-view element found for width calculation",
		);
		return 0;
	}

	/* Utility method to update width using CSS custom property on editor element */
	private _updateChronosWidth(container: HTMLElement, newWidth: number) {
		const editorEl = container.closest(
			".markdown-source-view",
		) as HTMLElement;
		if (editorEl) {
			editorEl.style.setProperty(
				"--chronos-editor-width",
				`${newWidth}px`,
			);
		} else {
			console.log(
				"No .markdown-source-view element found for CSS property update",
			);
		}
	}

	/* Setup ResizeObserver to track editor size changes */
	private _setupEditorResizeObserver(container: HTMLElement) {
		// Function to attempt finding the editor element
		const attemptSetup = (attempt = 1) => {
			const editorEl = container.closest(
				".markdown-source-view",
			) as HTMLElement;

			if (!editorEl && attempt <= 5) {
				// Wait and try again - DOM might not be ready
				setTimeout(() => attemptSetup(attempt + 1), attempt * 100);
				return;
			}

			if (!editorEl) {
				console.log(
					"Could not find .markdown-source-view element after 5 attempts",
				);
				// Debug: log the container's ancestors
				let parent = container.parentElement;
				let level = 0;
				while (parent && level < 10) {
					parent = parent.parentElement;
					level++;
				}
				return;
			}

			// skip adding obeserver if already exists
			if (this.observedEditors.has(editorEl)) {
				return;
			}

			let lastWidth = editorEl.offsetWidth;

			// Create ResizeObserver to watch for actual size changes
			const resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					const currentWidth = entry.contentRect.width;

					if (currentWidth !== lastWidth) {
						lastWidth = currentWidth;

						// Only update if there are expanded chronos blocks in this editor
						const hasExpanded = editorEl.querySelector(
							".chronos-width-expanded",
						);

						if (hasExpanded && currentWidth > 0) {
							// Update the CSS custom property so expanded timelines resize
							editorEl.style.setProperty(
								"--chronos-editor-width",
								`${currentWidth}px`,
							);
						}
					}
				}
			});

			try {
				resizeObserver.observe(editorEl);
			} catch (error) {
				console.error("Failed to observe editor element:", error);
			}

			this.observedEditors.add(editorEl);

			// Store the observer so we can remove it later
			(editorEl as any)._chronosResizeObserver = resizeObserver;
		};

		// Start the attempt process
		attemptSetup();
	}

	/* Create and setup the width toggle button */
	private _createWidthToggleButton(container: HTMLElement): {
		button: HTMLButtonElement;
		icon: HTMLSpanElement;
	} {
		const button = container.createEl("button", {
			cls: "chronos-width-toggle",
			attr: { title: "Toggle timeline width" },
		});

		const icon = button.createEl("span", { text: "⟷" });

		return { button, icon };
	}

	/* Expand timeline to full editor width */
	private _expandTimeline(
		container: HTMLElement,
		icon: HTMLSpanElement,
	): boolean {
		/** Grandparent  */
		const grandparent = this._getTimelineGrandparent(container);
		if (!grandparent) return false;

		const editorWidth = this._getCurrentEditorWidth(container);

		if (editorWidth <= 0) return false;

		this._updateChronosWidth(container, editorWidth);
		grandparent.addClass("chronos-width-expanded");
		icon.textContent = "↔";

		return true;
	}

	/* Collapse timeline to normal width */
	private _collapseTimeline(
		container: HTMLElement,
		icon: HTMLSpanElement,
	): void {
		const grandparent = this._getTimelineGrandparent(container);
		if (!grandparent) return;

		grandparent.removeClass("chronos-width-expanded");
		icon.textContent = "⟷";
	}

	/* Get the timeline's grandparent element for width manipulation */
	private _getTimelineGrandparent(
		container: HTMLElement,
	): HTMLElement | null {
		const grandparent = container.closest(
			".cm-lang-chronos.cm-preview-code-block",
		) as HTMLElement;
		return grandparent;
	}

	/* Trigger timeline refit after width changes */
	private _refitTimeline(timeline: any): void {
		setTimeout(() => {
			if (timeline?.timeline) {
				timeline.timeline.redraw();
				timeline.timeline.fit();
			}
		}, 300);
	}

	private _insertTextAfterSelection(editor: Editor, textToInsert: string) {
		const cursor = editor.getCursor("to");
		const padding = "\n\n";
		editor.replaceRange(padding + textToInsert, cursor);
	}

	private _renderChronosBlock(source: string, el: HTMLElement) {
		// HACK for preventing triple propogation of mouseDown handler
		let lastEventTime = 0;
		const THROTTLE_MS = 500;

		const container = el.createEl("div", {
			cls: "chronos-timeline-container",
		});

		// Create width toggle button
		const { button: widthToggleBtn, icon: toggleIcon } =
			this._createWidthToggleButton(container);
		let isExpanded = false;

		// Clean toggle logic
		const toggleWidth = () => {
			if (!isExpanded) {
				isExpanded = this._expandTimeline(container, toggleIcon);
			} else {
				this._collapseTimeline(container, toggleIcon);
				isExpanded = false;
			}

			// Refit timeline after width change
			this._refitTimeline(timeline);
		};

		widthToggleBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			toggleWidth();
		});

		// Setup ResizeObserver to track editor size changes
		this._setupEditorResizeObserver(container);

		// disable touch event propogation on containainer so sidebars don't interfer on mobile when swiping timeline
		["touchstart", "touchmove", "touchend"].forEach((evt) => {
			container.addEventListener(
				evt,
				(e) => {
					e.stopPropagation();
				},
				{ passive: false },
			);
		});

		const timeline = new ChronosTimeline({
			container,
			settings: this.settings,
			callbacks: { setTooltip },
		});

		try {
			timeline.render(source);
			// handle note linking
			timeline.on("mouseDown", (event: any) => {
				const now = performance.now();
				if (now - lastEventTime < THROTTLE_MS) {
					event.event.stopImmediatePropagation();
					event.event.preventDefault();
					return;
				}
				lastEventTime = now;

				// Stop event immediately
				if (event.event instanceof MouseEvent) {
					// logEventDetails(event.event, "Timeline MouseDown");

					event.event.stopImmediatePropagation();
					event.event.preventDefault();

					const itemId = event.item;
					if (!itemId) return;

					const item = timeline.items?.find(
						(i: any) => i.id === itemId,
					);
					console.log("item", item);
					if (!item?.cLink) return;

					// Check for middle click or CMD+click (Mac)
					const isMiddleClick = event.event.button === 1;
					const isCmdClick =
						event.event.metaKey && event.event.button === 0;
					const isShiftClick = event.event.shiftKey;

					const shouldOpenInNewLeaf =
						isMiddleClick || isCmdClick || isShiftClick;
					this._openFileFromWikiLink(item.cLink, shouldOpenInNewLeaf);
				}
			});

			// Add hover preview for linked notes
			timeline.on("itemover", async (event: any) => {
				const itemId = event.item;
				if (itemId) {
					const item = timeline.items?.find(
						(i: any) => i.id === itemId,
					);
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

				timeline.on("mouseOver", (e: any) => {
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

	private async _generateTimelineFromFolder(editor: Editor) {
		new FolderListModal(
			this.app,
			this.app.vault.getAllFolders(),
			(f: TFolder) => {
				const folderName = f.name;
				const children = f.children;
				let extracted: Set<string> = new Set<string>();

				const tasks: Promise<string[]>[] = children
					.filter((file: TFile) => file instanceof TFile)
					.map((file: TFile) => {
						return this.app.vault
							.cachedRead(file as TFile)
							.then((text) => {
								const rex_match: string[] = [];
								let current_match;

								// Extract inline chronos blocks (need to add - prefix)
								const inlineMatches = [];
								while (
									(current_match =
										DETECTION_PATTERN_TEXT.exec(text)) !==
									null
								) {
									inlineMatches.push(
										current_match[1] as string,
									);
								}

								// Extract full chronos code blocks (already have prefixes)
								while (
									(current_match =
										DETECTION_PATTERN_CODEBLOCK.exec(
											text,
										)) !== null
								) {
									// Extract all non-blank, non-comment lines from the code block
									const blockContent = current_match[1];
									const lines = blockContent.split("\n");
									lines.forEach((line) => {
										const trimmed = line.trim();
										// Include any line that isn't blank and doesn't start with #
										if (
											trimmed &&
											!trimmed.startsWith("#")
										) {
											rex_match.push(trimmed);
										}
									});
								}

								// Add - prefix only to inline matches, then combine all
								return [
									...inlineMatches.map((text) => `- ${text}`),
									...rex_match,
								];
							})
							.catch((_error) => {
								new Notice(
									`Error while processing ${file.name}`,
								);
								return [];
							});
					});

				Promise.allSettled(tasks).then((results) => {
					results.forEach((result) => {
						if (result.status === "fulfilled")
							result.value.forEach((item) => extracted.add(item));
					});

					if (extracted.size === 0) {
						new Notice(
							`No chronos items found in folder ${folderName}`,
						);
						return;
					}

					this._insertSnippet(
						editor,
						ChronosTimeline.templates.blank.replace(
							/^\s*$/m,
							[...extracted].join("\n"),
						),
					);
				});
			},
		).open();
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
		const provider = (this.settings as any).aiProvider || "openai"; // backwards compatibility: OpenAI used to be sole provider

		const apiKey = this._getApiKey(provider);
		if (!apiKey) {
			new Notice(
				"No API Key found. Please add an API key in Chronos Timeline Plugin Settings",
			);
			return;
		}

		const model =
			(this.settings as any).aiModels?.[provider] ||
			(PROVIDER_DEFAULT_MODELS as any)[provider];

		const loadingModal = new TextModal(
			this.app,
			`Working on it.... (Provider: ${provider}, Model: ${model})`,
		);
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
		// Determine provider (if settings include selection) otherwise default to openai
		const provider = (this.settings as any).aiProvider || "openai"; // backwards compatibility: OpenAI used to be sole provider

		const apiKey = this._getApiKey(provider);
		if (!apiKey) {
			new Notice(
				"No API Key found. Please add an API key in Chronos Timeline Plugin Settings",
			);
			return;
		}

		const model =
			(this.settings as any).aiModels?.[provider] ||
			(PROVIDER_DEFAULT_MODELS as any)[provider];

		const { GenAi } = await import("./lib/ai/GenAi.js");
		const res = await new GenAi(provider, apiKey, model).toChronos(
			selection,
		);
		return res;
	}

	private _getCurrentSelectedText(editor: Editor): string {
		return editor ? editor.getSelection() : "";
	}

	private _getApiKey(provider: string = "openai") {
		// prefer provider-specific stored keys
		const keys = (this.settings as any).aiKeys || {};
		const enc = keys[provider] || (this.settings as any).key || "";
		return decrypt(enc, PEPPER);
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

		const announceLink = containerEl.createEl("a", {
			text: "Create and share Chronos Timelines outside of Obsidian ↗",
		});
		announceLink.setAttribute(
			"href",
			"https://clairefro.github.io/chronos-timeline-md/",
		);
		announceLink.setAttribute("target", "_blank");
		announceLink.setAttribute("rel", "noopener noreferrer");
		announceLink.className = "chronos-announcement-link";

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
						new Notice(
							"Refresh rendering of timlines for change to take effect",
						);
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
						new Notice(
							"Refresh rendering of timlines for change to take effect",
						);
						this.plugin.settings.roundRanges = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Use UTC time (recommended)")
			.setDesc(
				"If disabled, Chronos will use your system time to display the events and current time. Using local time is only recommended if you are using Chronos for tasks at the intra-day level, and may have unintended side effects like showing historical events one day off during certain times of day.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useUtc)
					.onChange(async (value) => {
						new Notice(
							"Refresh rendering of timlines for change to take effect",
						);
						this.plugin.settings.useUtc = value;
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
			.setName("Use AI Features")
			.setDesc(
				"Toggles commands and settings for AI timeline generation.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useAI)
					.onChange(async (value) => {
						this.plugin.settings.useAI = value;
						await this.plugin.saveSettings();
						// Call display to re-evaluate display conditionals for AI settings
						this.display();
					}),
			);

		// AI provider settings only shown when AI features are enabled
		if (this.plugin.settings.useAI) {
			new Setting(containerEl)
				.setName("AI Provider")
				.setDesc(
					"Choose which AI provider to use for timeline generation",
				)
				.addDropdown((dropdown) => {
					dropdown.addOption("openai", "OpenAI");
					dropdown.addOption("gemini", "Gemini (Google)");
					const saved =
						(this.plugin.settings as any).aiProvider || "openai";
					dropdown.setValue(saved);
					dropdown.onChange(async (value) => {
						(this.plugin.settings as any).aiProvider = value;
						await this.plugin.saveSettings();
						this.display();
					});
				});

			const currentProvider =
				(this.plugin.settings as any).aiProvider || "openai";

			// Allow editing the model used for this provider (defaults applied on load)
			const configuredModel =
				(this.plugin.settings as any).aiModels?.[currentProvider] ||
				(PROVIDER_DEFAULT_MODELS as any)[currentProvider] ||
				"";

			const defaultModel =
				(PROVIDER_DEFAULT_MODELS as any)[currentProvider] || "";

			// Build the Model setting and only show the "Use recommended model" button
			// when the configured model differs from the provider default. Re-render
			// the settings UI on change so the button can appear/disappear dynamically.
			const modelSetting = new Setting(containerEl)
				.setName("Model")
				.setDesc("Model used for the selected provider")
				.setClass("ai-setting");

			// add "Use default model" button
			if (configuredModel !== defaultModel) {
				modelSetting.addButton((btn) => {
					btn.setButtonText(`Use ${defaultModel} (recommended)`)
						.setTooltip(
							`Replace with recommended model: ${defaultModel}`,
						)
						.setCta() // Apply Obsidian theme accent color
						.onClick(async () => {
							(this.plugin.settings as any).aiModels = {
								...(this.plugin.settings as any).aiModels,
								[currentProvider]: defaultModel,
							};
							await this.plugin.saveSettings();
							// Update text field and hide button without re-rendering the entire settings UI
							const textField =
								modelSetting.settingEl.querySelector("input");
							if (textField) {
								textField.value = defaultModel;
							}
							btn.buttonEl.style.display = "none";
						});
				});
			}

			modelSetting.addText((t) => {
				t.setValue(configuredModel).onChange(async (value) => {
					const trimmed = value.trim();
					(this.plugin.settings as any).aiModels = {
						...(this.plugin.settings as any).aiModels,
						[currentProvider]: trimmed,
					};
					await this.plugin.saveSettings();
					// Update button visibility without re-rendering the entire settings UI
					const button =
						modelSetting.settingEl.querySelector("button");
					if (button) {
						button.style.display =
							trimmed === defaultModel ? "none" : "";
					}
				});
			});

			new Setting(containerEl)
				.setName(`API Key for ${currentProvider}`)
				.addText((text) => {
					const enc =
						(this.plugin.settings as any).aiKeys?.[
							currentProvider
						] || "";
					const dec = enc ? decrypt(enc, PEPPER) : "";
					text.setPlaceholder(`Enter your ${currentProvider} API key`)
						.setValue(dec)
						.onChange(async (value) => {
							if (!value.trim()) {
								if ((this.plugin.settings as any).aiKeys) {
									delete (this.plugin.settings as any).aiKeys[
										currentProvider
									];
								}
							} else {
								(this.plugin.settings as any).aiKeys = {
									...(this.plugin.settings as any).aiKeys,
									[currentProvider]: encrypt(
										value.trim(),
										PEPPER,
									),
								};
							}
							await this.plugin.saveSettings();
						});
				})
				.setClass("ai-setting");
		}

		containerEl.createEl("h2", {
			text: "Cheatsheet",
			cls: "chronos-setting-header",
		});

		const textarea = containerEl.createEl("textarea", {
			cls: "chronos-settings-md-container",
			text: ChronosTimeline.cheatsheet,
		});

		textarea.readOnly = true;

		new Setting(containerEl).addButton((btn) => {
			btn.setButtonText("Copy cheatsheet")
				.setCta()
				.onClick(async () => {
					try {
						await navigator.clipboard.writeText(
							ChronosTimeline.cheatsheet,
						);
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
