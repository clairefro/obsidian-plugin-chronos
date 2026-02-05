import {
	Plugin,
	App,
	Setting,
	PluginSettingTab,
	Notice,
	Editor,
	TFile,
	TFolder,
	SecretComponent,
} from "obsidian";

import { ChronosPluginSettings } from "./types";

import { TextModal } from "./components/TextModal";
import { FolderListModal } from "./components/FolderListModal";
import { ChangelogView, CHANGELOG_VIEW_TYPE } from "./views/ChangelogView";
import { knownLocales } from "./util/knownLocales";
import { CacheUtils } from "./util/CacheUtils";
import { FileUtils } from "./util/FileUtils";
import {
	DEFAULT_LOCALE,
	PROVIDER_DEFAULT_MODELS,
	DETECTION_PATTERN_TEXT,
	DETECTION_PATTERN_HTML,
	DETECTION_PATTERN_CODEBLOCK,
} from "./constants";

import { ChronosTimelineBasesView } from "./views/ChronosTimelineBasesView";

// HACKY IMPORT TO ACCOMODATE SYMLINKS IN LOCAL DEV
import * as ChronosLib from "chronos-timeline-md";
const ChronosTimeline: any =
	(ChronosLib as any).ChronosTimeline ??
	(ChronosLib as any).default ??
	(ChronosLib as any);

// Debug: uncomment to inspect what was loaded if needed
// console.debug('Chronos lib exports:', ChronosLib);

const DEFAULT_SETTINGS: ChronosPluginSettings = {
	selectedLocale: DEFAULT_LOCALE,
	align: "left",
	clickToUse: false,
	roundRanges: false,
	useUtc: true,
	useAI: true,
	showChangelogOnUpdate: true,
	enableCaching: false,
};

export default class ChronosPlugin extends Plugin {
	settings: ChronosPluginSettings;
	private observedEditors = new Set<HTMLElement>();
	cacheUtils: CacheUtils;
	private fileUtils: FileUtils;

	async onload() {
		console.debug("Loading Chronos Timeline Plugin....");

		this.settings = {
			...DEFAULT_SETTINGS,
			...(await this.loadData()),
		};

		// Register the changelog view
		// Pass settings and callback to ChangelogView
		this.registerView(
			CHANGELOG_VIEW_TYPE,
			(leaf) =>
				new ChangelogView(leaf, [], {
					showChangelogOnUpdate:
						this.settings.showChangelogOnUpdate ?? true,
					onToggleNotification: async (newValue: boolean) => {
						this.settings.showChangelogOnUpdate = newValue;
						await this.saveSettings();
					},
				}),
		);
		// register bases view
		this.registerBasesView("chronos-timeline-view", {
			name: "Chronos Timeline",
			icon: "chart-no-axes-gantt",
			factory: (controller, containerEl) =>
				new ChronosTimelineBasesView(
					controller,
					containerEl,
					this.settings,
				),
			// options: () => [
			// 	{
			// 		type: "property",
			// 		key: "start",
			// 		displayName: "Start Date",
			// 		default: "note.start",
			// 	},
			// 	{
			// 		type: "property",
			// 		key: "end",
			// 		displayName: "End Date",
			// 		default: "note.end",
			// 	},
			// ],
		});

		// Remove old insecure aiKeys property (LEGACY)
		if ((this.settings as any).aiKeys) {
			delete (this.settings as any).aiKeys;
			await this.saveSettings();
		}

		// Remove legacy key property (LEGACY LEGACY)
		if ((this.settings as any).key) {
			delete (this.settings as any).key;
			await this.saveSettings();
		}

		this.cacheUtils = new CacheUtils(this);
		this.fileUtils = new FileUtils(this);

		// Load persistent cache or initialize if it doesn't exist (only if caching is enabled)
		if (this.settings.enableCaching) {
			await this.cacheUtils.loadCache();
		}

		this.addSettingTab(new ChronosPluginSettingTab(this.app, this));

		// Initialize folder cache in background to track which folders contain chronos blocks (only if caching is enabled)
		if (this.settings.enableCaching) {
			this.cacheUtils.initializeFolderCache();
		}

		this.registerEvent(
			this.app.vault.on("rename", async (file, oldPath) => {
				await this.fileUtils.updateWikiLinks(oldPath, file.path);
			}),
		);

		// Invalidate cache when files are modified, created, or deleted (check if caching is enabled)
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (
					this.settings.enableCaching &&
					file instanceof TFile &&
					file.extension === "md"
				) {
					this.cacheUtils.invalidateFolderCache(file.parent);
				}
			}),
		);

		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (
					this.settings.enableCaching &&
					file instanceof TFile &&
					file.extension === "md"
				) {
					this.cacheUtils.invalidateFolderCache(file.parent);
				}
			}),
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (
					this.settings.enableCaching &&
					file instanceof TFile &&
					file.extension === "md"
				) {
					this.cacheUtils.invalidateFolderCache(file.parent);
				}
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

		// Check for new versions and show changelog
		this.app.workspace.onLayoutReady(async () => {
			await this._checkAndShowChangelog();
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
		console.debug("Chronos plugin unloaded, all observers cleaned up");
	}

	async loadSettings() {
		this.settings = {
			...DEFAULT_SETTINGS,
			...(await this.loadData()),
		};
	}

	async saveSettings() {
		const currentData = (await this.loadData()) || {};
		const dataToSave = { ...currentData, ...this.settings };
		await this.saveData(dataToSave);
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

	/* Utility method to get current editor width */
	private _getCurrentEditorWidth(container: HTMLElement): number {
		const editorEl = container.closest(
			".markdown-source-view",
		) as HTMLElement;
		if (editorEl) {
			return editorEl.offsetWidth;
		}

		return 0;
	}

	/* Utility method to update width */
	private _updateChronosWidth(container: HTMLElement, newWidth: number) {
		const editorEl = container.closest(
			".markdown-source-view",
		) as HTMLElement;
		if (editorEl) {
			editorEl.style.setProperty(
				"--chronos-editor-width",
				`${newWidth}px`,
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
				console.debug(
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

		widthToggleBtn.addEventListener(
			"click",
			(e) => {
				e.stopPropagation();
				e.stopImmediatePropagation();
				e.preventDefault();
				toggleWidth();
			},
			true,
		);

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
					event.event.stopImmediatePropagation();
					event.event.preventDefault();

					const itemId = event.item;
					if (!itemId) return;

					const item = timeline.items?.find(
						(i: any) => i.id === itemId,
					);
					if (!item?.cLink) return;

					// Check for middle click or CMD+click (Mac)
					const isMiddleClick = event.event.button === 1;
					const isCmdClick =
						event.event.metaKey && event.event.button === 0;
					const isShiftClick = event.event.shiftKey;

					const shouldOpenInNewLeaf =
						isMiddleClick || isCmdClick || isShiftClick;
					this.fileUtils.openFileFromWikiLink(
						item.cLink,
						shouldOpenInNewLeaf,
					);
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
						// Tooltip removed due to deprecation
					} else {
						// Tooltip removed due to deprecation
					}
				});
			}
		} catch (error) {
			console.debug(error);
		}
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
				`No API Key found for ${provider}. Please add an API key in Chronos Timeline Plugin Settings`,
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
				`No API Key found for ${provider}. Please add an API key in Chronos Timeline Plugin Settings`,
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

	private _getApiKey(provider: string = "openai"): string | null {
		const secretName = (this.settings as any)[`${provider}SecretName`];
		if (!secretName) return null;
		return this.app.secretStorage.getSecret(secretName);
	}

	private _getCurrentSelectedText(editor: Editor): string {
		return editor ? editor.getSelection() : "";
	}

	// Ensure latest data is fetched before inserting combined timeline
	private async _generateTimelineFromFolder(editor: Editor) {
		try {
			const allFolders = this.app.vault.getAllFolders();

			// If caching is enabled, filter to folders with chronos items
			// If caching is disabled, show all folders
			const foldersToShow = this.settings.enableCaching
				? allFolders.filter((folder) => {
						const cached = this.cacheUtils.folderChronosCache.get(
							folder.path,
						);
						return (cached ?? 0) > 0;
					})
				: allFolders;

			if (foldersToShow.length === 0) {
				new Notice(
					this.settings.enableCaching
						? "No folders contain chronos items (yet!)"
						: "No folders found in vault",
				);
				return;
			}

			new FolderListModal(
				this.app,
				foldersToShow,
				async (f: TFolder) => {
					const folderPath = f.path;

					// Update cache for the selected folder and its children (only if caching is enabled)
					if (this.settings.enableCaching) {
						await this.cacheUtils.updateFolderCache(f);
					}

					// Recursively get all files in this folder and subfolders
					const allFiles = this.fileUtils.getAllFilesInFolder(f);
					let extracted: string[] = []; // Keep the name as `extracted`

					const tasks: Promise<string[]>[] = allFiles
						.filter((file: TFile) => file.extension === "md")
						.map((file: TFile) => {
							return this.app.vault
								.cachedRead(file as TFile)
								.then((text) => {
									const rex_match: string[] = [];
									let current_match;

									// Extract inline chronos blocks (check for indicators)
									const inlineMatches = [];
									while (
										(current_match =
											DETECTION_PATTERN_TEXT.exec(
												text,
											)) !== null
									) {
										const content =
											current_match[1] as string;
										const trimmed = content.trim();
										const hasIndicator = /^[-@*~]/.test(
											trimmed,
										);
										inlineMatches.push(
											hasIndicator
												? trimmed
												: `- ${trimmed}`,
										);
									}

									// Extract full chronos code blocks (check for indicators)
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
											// Include any line that isn't blank, doesn't start with #, and doesn't start with > (flags)
											if (
												trimmed &&
												!trimmed.startsWith("#") &&
												!trimmed.startsWith(">")
											) {
												// Check if line already has an indicator (-, @, *, etc)
												const hasIndicator =
													/^[-@*~]/.test(trimmed);
												rex_match.push(
													hasIndicator
														? trimmed
														: `- ${trimmed}`,
												);
											}
										});
									}

									// Combine all matches (already have prefixes applied)
									return [...inlineMatches, ...rex_match];
								})
								.catch((_error) => {
									new Notice(
										`Error while processing ${file.name}`,
									);
									return [];
								});
						});

					await Promise.allSettled(tasks).then((results) => {
						results.forEach((result) => {
							if (result.status === "fulfilled") {
								extracted = extracted.concat(result.value);
							}
						});
						if (extracted.length === 0) {
							new Notice(
								`No chronos items found in ${folderPath}`,
							);
							return;
						}

						const heightFlag =
							extracted.length > 26 ? "> HEIGHT 300\n" : "";

						this._insertSnippet(
							editor,
							ChronosTimeline.templates.blank.replace(
								/^\s*$/m,
								heightFlag + extracted.join("\n"),
							),
						);

						new Notice(
							`Combined ${extracted.length} Chronos item${extracted.length !== 1 ? "s" : ""} found in ${folderPath}`,
						);
					});
				},
				this.settings.enableCaching
					? this.cacheUtils.folderChronosCache
					: undefined,
				() => this.settings.enableCaching ?? false,
			).open();
		} catch (error) {
			new Notice("Error scanning for chronos items");
			console.error("Error in _generateTimelineFromFolder:", error);
		}
	}

	// Changelog methods
	private async _checkAndShowChangelog(): Promise<void> {
		// Skip if user disabled changelog notifications
		if (this.settings.showChangelogOnUpdate === false) {
			return;
		}

		const currentVersion = this.manifest.version;
		const lastSeenVersion = this.settings.lastSeenVersion;

		// If no lastSeenVersion, show the current version's changelog (first install)
		if (!lastSeenVersion) {
			const unseenChangelogs = await this._getUnseenChangelogs(
				"0.0.0", // Get all changelogs up to current version
				currentVersion,
			);

			if (unseenChangelogs.length > 0) {
				await this._showChangelogNote(unseenChangelogs);
				// Set lastSeenVersion to current after successfully showing
				this.settings.lastSeenVersion = currentVersion;
				await this.saveSettings();
			}
			return;
		}

		// If same version, skip
		if (lastSeenVersion === currentVersion) {
			return;
		}

		// Get unseen changelogs
		const unseenChangelogs = await this._getUnseenChangelogs(
			lastSeenVersion,
			currentVersion,
		);

		if (unseenChangelogs.length > 0) {
			// Show changelog modal
			await this._showChangelogNote(unseenChangelogs);
			// Update last seen version after successfully showing
			this.settings.lastSeenVersion = currentVersion;
			await this.saveSettings();
		}
	}

	private async _showChangelogNote(
		entries: { version: string; date: string; content: string }[],
	): Promise<void> {
		// Don't create view if no entries
		if (!entries || entries.length === 0) {
			return;
		}

		// Check if a changelog view is already open
		const existingLeaves =
			this.app.workspace.getLeavesOfType(CHANGELOG_VIEW_TYPE);

		if (existingLeaves.length > 0) {
			// Close existing views first
			for (const leaf of existingLeaves) {
				leaf.detach();
			}
		}

		// Create a new leaf and open the changelog view
		const leaf = this.app.workspace.getLeaf("tab");

		await leaf.setViewState({
			type: CHANGELOG_VIEW_TYPE,
			active: true,
		});

		// Update the view with the new entries
		const view = leaf.view as ChangelogView;
		if (view) {
			(view as any).entries = entries;
			await view.onOpen();
		}
	}

	private async _getUnseenChangelogs(
		lastSeenVersion: string,
		currentVersion: string,
	): Promise<{ version: string; date: string; content: string }[]> {
		try {
			const releases = await this._fetchGitHubReleases();

			const unseenEntries: {
				version: string;
				date: string;
				content: string;
			}[] = [];

			for (const release of releases) {
				// Extract version from tag (e.g., "v3.0.0" or "3.0.0")
				const version = release.tag_name.replace(/^v/, "");

				// Include if version is greater than lastSeenVersion and <= currentVersion
				const comparisonToLast = this._compareVersions(
					version,
					lastSeenVersion,
				);
				const comparisonToCurrent = this._compareVersions(
					version,
					currentVersion,
				);

				if (comparisonToLast > 0 && comparisonToCurrent <= 0) {
					// Check if this is a patch release (x.x.non-zero)
					const isPatchRelease = this._isPatchRelease(version);
					const hasIncludeComment = release.body
						?.trim()
						.toLowerCase()
						.replace(/\s+/g, "")
						.startsWith("<!--include-->");

					// Skip patch releases unless they have the <!-- include --> comment
					if (isPatchRelease && !hasIncludeComment) {
						continue;
					}

					unseenEntries.push({
						version,
						date: release.published_at,
						content: release.body || "No release notes available.",
					});
				}
			}

			// Sort by published date descending (newest first)
			unseenEntries.sort((a, b) => {
				return new Date(b.date).getTime() - new Date(a.date).getTime();
			});

			// Limit to 4 most recent releases
			return unseenEntries.slice(0, 4);
		} catch (error) {
			console.error(
				"[Chronos] Error fetching changelogs from GitHub:",
				error,
			);
			// Silently fail - don't show notice to user
			return [];
		}
	}

	private async _fetchGitHubReleases(): Promise<any[]> {
		const url =
			"https://api.github.com/repos/clairefro/obsidian-plugin-chronos/releases";

		try {
			const response = await fetch(url, {
				headers: {
					Accept: "application/vnd.github.v3+json",
				},
			});

			if (!response.ok) {
				throw new Error(
					`GitHub API returned ${response.status}: ${response.statusText}`,
				);
			}

			const releases = await response.json();
			return releases;
		} catch (error) {
			console.error("[Chronos] Failed to fetch GitHub releases:", error);
			throw error;
		}
	}

	private _compareVersions(v1: string, v2: string): number {
		const parts1 = v1.split(".").map(Number);
		const parts2 = v2.split(".").map(Number);

		for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
			const part1 = parts1[i] || 0;
			const part2 = parts2[i] || 0;

			if (part1 > part2) return 1;
			if (part1 < part2) return -1;
		}

		return 0;
	}

	private _isPatchRelease(version: string): boolean {
		// Parse version as x.x.x
		const parts = version.split(".").map(Number);
		// It's a patch release if the third number (patch) is non-zero
		return parts.length >= 3 && parts[2] > 0;
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
		containerEl.addClass("chronos-settings");

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

		containerEl.createEl("br");
		containerEl.createEl("br");

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
			text: "Performance",
			cls: "chronos-setting-header",
		});

		new Setting(containerEl)
			.setName("Enhance features with caching")
			.setDesc(
				"(Not recommended for massive vaults) Improves 'Generate timeline from folder' feature by showing only folders with chronos items and their counts. Off by default.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableCaching ?? false)
					.onChange(async (value) => {
						this.plugin.settings.enableCaching = value;
						await this.plugin.saveSettings();

						if (value) {
							// Initialize cache when enabling - force fresh scan
							new Notice("Initializing cache...");
							this.plugin.cacheUtils.fileChronosCache.clear();
							this.plugin.cacheUtils.folderChronosCache.clear();
							this.plugin.cacheUtils.cacheInitialized = false;
							await this.plugin.cacheUtils.initializeFolderCache();
							new Notice("Cache initialized successfully");
						} else {
							// Clear cache when disabling
							console.debug("[Chronos] Clearing cache...");
							this.plugin.cacheUtils.fileChronosCache.clear();
							this.plugin.cacheUtils.folderChronosCache.clear();
							this.plugin.cacheUtils.cacheInitialized = false;
							await this.plugin.cacheUtils.deleteCache();
							new Notice("Caching disabled");
						}
					}),
			);

		containerEl.createEl("h2", {
			text: "Updates & Notifications",
			cls: "chronos-setting-header",
		});

		new Setting(containerEl)
			.setName("Show changelog on update")
			.setDesc(
				'Display "What\'s New" modal when the plugin is updated to a new version',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.showChangelogOnUpdate ?? true,
					)
					.onChange(async (value) => {
						this.plugin.settings.showChangelogOnUpdate = value;
						await this.plugin.saveSettings();
					}),
			);

		// Add link to GitHub releases
		const releasesLinkDiv = containerEl.createDiv({
			cls: "chronos-releases-link",
		});

		const releasesLink = releasesLinkDiv.createEl("a", {
			text: "View full release history",
			href: "https://github.com/clairefro/obsidian-plugin-chronos/releases",
		});
		releasesLink.setAttr("target", "_blank");
		releasesLink.setAttr("rel", "noopener noreferrer");

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
			const updateApiKeyVisibility = () => {
				const currentProvider =
					(this.plugin.settings as any).aiProvider || "openai";
				const openaiSetting = containerEl.querySelector(
					".ai-setting-openai",
				) as HTMLElement;
				const geminiSetting = containerEl.querySelector(
					".ai-setting-gemini",
				) as HTMLElement;

				if (openaiSetting) {
					openaiSetting.style.display =
						currentProvider === "openai" ? "block" : "none";
				}
				if (geminiSetting) {
					geminiSetting.style.display =
						currentProvider === "gemini" ? "block" : "none";
				}
			};

			// Call updateApiKeyVisibility whenever the provider dropdown changes
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
						updateApiKeyVisibility();
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
				.setName("API Key for OpenAI")
				.setDesc("Select a secret from SecretStorage")
				.addComponent((el) =>
					new SecretComponent(this.app, el)
						.setValue(
							(this.plugin.settings as any).openaiSecretName ||
								"",
						)
						.onChange(async (value) => {
							(this.plugin.settings as any).openaiSecretName =
								value;
							await this.plugin.saveSettings();
						}),
				);

			new Setting(containerEl)
				.setName("API Key for Gemini")
				.setDesc("Select a secret from SecretStorage")
				.addComponent((el) =>
					new SecretComponent(this.app, el)
						.setValue(
							(this.plugin.settings as any).geminiSecretName ||
								"",
						)
						.onChange(async (value) => {
							(this.plugin.settings as any).geminiSecretName =
								value;
							await this.plugin.saveSettings();
						}),
				);

			// Initial visibility update
			updateApiKeyVisibility();
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

		containerEl.createEl("br");

		const copyButton = containerEl.createEl("button", {
			text: "Copy cheatsheet",
		});
		copyButton.classList.add("mod-cta");
		copyButton.addEventListener("click", async () => {
			try {
				await navigator.clipboard.writeText(ChronosTimeline.cheatsheet);
				new Notice(
					"Cheatsheet copied to clipboard!\nPaste it in a new Obsidian note to learn Chronos syntax",
				);
			} catch (err) {
				console.error("Failed to copy cheatsheet:", err);
				new Notice("Failed to copy cheatsheet");
			}
		});

		containerEl.createEl("br");
		containerEl.createEl("br");

		const link = document.createElement("a");
		link.textContent = "Learn more";
		link.href = "https://github.com/clairefro/obsidian-plugin-chronos";
		link.target = "_blank";
		link.style.textDecoration = "underline";

		containerEl.appendChild(link);
	}
}
