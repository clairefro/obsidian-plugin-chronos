import {
	Plugin,
	App,
	PluginSettingTab,
	Notice,
	Editor,
	TFile,
	TFolder,
	SecretComponent,
	DropdownComponent,
	SettingDefinition,
	SettingDefinitionItem,
	requestUrl,
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
	PROVIDER_DEFAULT_BASE_URLS,
	DETECTION_PATTERN_TEXT,
	DETECTION_PATTERN_HTML,
	DETECTION_PATTERN_CODEBLOCK,
	BASES_PROP_NAMES_DEFAULTS,
} from "./constants";

import {
	ChronosTimelineBasesView,
	itemProps,
	itemPropertyNames,
	generateViewOptions,
	getDefaultPropNames,
} from "./views/ChronosTimelineBasesView";
import type { AIProviderConfig } from "./lib/ai/providers/providerFactory";

// HACKY IMPORT TO ACCOMODATE SYMLINKS IN LOCAL DEV
import * as ChronosLib from "chronos-timeline-md";
const ChronosTimeline: any =
	(ChronosLib as any).ChronosTimeline ??
	(ChronosLib as any).default ??
	(ChronosLib as any);

import { wireSharedTimelineInteractions } from "./util/wireSharedTimelineInteractions";
import { createChronosSnippetEditorExtension } from "./util/chronosSnippetEditorExtension";

// Debug: uncomment to inspect what was loaded if needed
// console.debug('Chronos lib exports:', ChronosLib);

interface ObservedEditorEl extends HTMLElement {
	_chronosResizeObserver?: ResizeObserver;
}

interface GitHubRelease {
	tag_name: string;
	body?: string | null;
	published_at: string;
}

const DEFAULT_SETTINGS: ChronosPluginSettings = {
	selectedLocale: DEFAULT_LOCALE,
	align: "left",
	clickToUse: false,
	roundRanges: false,
	useUtc: true,
	useAI: true,
	showChangelogOnUpdate: true,
	enableCaching: false,
	basesPropNames: BASES_PROP_NAMES_DEFAULTS,
};

export default class ChronosPlugin extends Plugin {
	settings!: ChronosPluginSettings;
	private observedEditors = new Set<HTMLElement>();
	cacheUtils!: CacheUtils;
	private fileUtils!: FileUtils;

	async onload() {
		console.debug("[Chronos] Loading Plugin....");

		this.settings = {
			...DEFAULT_SETTINGS,
			...(await this.loadData()),
		};

		// Check if we've saved the old, <=4.1.2 property names for base view
		// migration purposes. If not, save a copy.
		if (!this.settings.legacyBasesPropNames) {
			this.settings.legacyBasesPropNames = getDefaultPropNames(
				this.settings.basesPropNames,
			);
			await this.saveSettings();
		}

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
		this.registerBasesView(ChronosTimelineBasesView.VIEW_TYPE, {
			name: "Chronos Timeline",
			icon: "chart-no-axes-gantt",
			factory: (controller, containerEl) =>
				new ChronosTimelineBasesView(
					controller,
					containerEl,
					this.settings,
				),
			options: (config) => generateViewOptions(this.settings, config),
		});

		// Remove old insecure aiKeys property (LEGACY)
		const legacySettings = this.settings as unknown as Record<
			string,
			unknown
		>;
		if (legacySettings.aiKeys) {
			delete legacySettings.aiKeys;
			await this.saveSettings();
		}

		// Remove legacy key property (LEGACY LEGACY)
		if (legacySettings.key) {
			delete legacySettings.key;
			await this.saveSettings();
		}

		this.cacheUtils = new CacheUtils(this);
		this.fileUtils = new FileUtils(this);

		// Load persistent cache or initialize if it doesn't exist (only if caching is enabled)
		if (this.settings.enableCaching) {
			await this.cacheUtils.loadCache();
		}

		this.addSettingTab(new ChronosPluginSettingTab(this.app, this));
		this.registerEditorExtension(
			createChronosSnippetEditorExtension(this.app),
		);

		// Initialize folder cache in background to track which folders contain chronos blocks (only if caching is enabled)
		if (this.settings.enableCaching) {
			void this.cacheUtils.initializeFolderCache();
		}

		this.registerEvent(
			this.app.vault.on("rename", async (file, oldPath) => {
				await this.fileUtils.handleRename(file, oldPath);
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
				void this._generateTimelineFromFolder(editor);
			},
		});

		this.addCommand({
			id: "generate-timeline-ai",
			name: "Generate timeline with AI",
			editorCheckCallback: (checking, editor, _view) => {
				if (checking) {
					return this.settings.useAI;
				} else {
					void this._generateTimelineWithAi(editor);
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
			const observer = (editorEl as ObservedEditorEl)
				._chronosResizeObserver;

			if (observer) {
				observer.disconnect();
				delete (editorEl as ObservedEditorEl)._chronosResizeObserver;
			}
		});
		this.observedEditors.clear();
		console.debug("[Chronos] Plugin unloaded, all observers cleaned up");
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
				window.setTimeout(
					() => attemptSetup(attempt + 1),
					attempt * 100,
				);
				return;
			}

			if (!editorEl) {
				container.querySelector(".chronos-width-toggle")?.remove();
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
				console.error(
					"[Chronos] Failed to observe editor element:",
					error,
				);
			}

			this.observedEditors.add(editorEl);

			// Store the observer so we can remove it later
			(editorEl as ObservedEditorEl)._chronosResizeObserver =
				resizeObserver;
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

		const icon = button.createSpan({ text: "⟷" });

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
	private _refitTimeline(timeline: ChronosLib.ChronosTimeline): void {
		window.setTimeout(() => {
			if (timeline?.timeline) {
				timeline.timeline.redraw();
				timeline.timeline.fit();
			}
		}, 300);
	}

	private _renderChronosBlock(source: string, el: HTMLElement) {
		const container = el.createDiv({
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

		const timeline = new ChronosTimeline({
			container,
			settings: this.settings,
		});

		try {
			timeline.render(source);
			// DRY: wire up note linking and hover preview
			wireSharedTimelineInteractions(
				timeline,
				this.fileUtils,
				this.app,
				container,
				this.settings,
			);
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
		const config = this._getAiProviderConfig();
		const { provider } = config;
		const model = config.model || "model not set";

		const loadingModal = new TextModal(
			this.app,
			`Generating Chronos Timeline.... (Provider: ${provider}, Model: ${model})`,
		);
		loadingModal.open();
		try {
			const chronos = await this._textToChronos(selection);
			chronos && this._insertTextAfterSelection(editor, chronos);
		} catch (e) {
			console.error(e);

			loadingModal.setText(e instanceof Error ? e.message : String(e));
			return;
		}
		loadingModal.close();
	}

	private async _textToChronos(selection: string): Promise<string | void> {
		const config = this._getAiProviderConfig();
		const { GenAi } = await import("./lib/ai/GenAi.js");
		const res = await new GenAi(config).toChronos(selection);
		return res;
	}

	private _getAiProviderConfig(): AIProviderConfig {
		const provider = (this.settings.aiProvider ||
			"openai") as AIProviderConfig["provider"];
		return {
			provider,
			apiKey: this._getApiKey(provider) || undefined,
			model:
				this.settings.aiModels?.[provider] ||
				PROVIDER_DEFAULT_MODELS[provider],
			baseUrl: this.settings.aiBaseUrls?.[provider],
		};
	}

	private _getApiKey(provider: string = "openai"): string | null {
		const secretName = (this.settings as unknown as SecretNames)[
			`${provider}SecretName`
		];
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
						.map(async (file: TFile): Promise<string[]> => {
							try {
								const text =
									await this.app.vault.cachedRead(file);
								const rex_match: string[] = [];
								let current_match;

								// Extract inline chronos blocks (check for indicators)
								const inlineMatches = [];
								while (
									(current_match =
										DETECTION_PATTERN_TEXT.exec(text)) !==
									null
								) {
									const content = current_match[1];
									const trimmed = content.trim();
									const hasIndicator = /^[-@*~]/.test(
										trimmed,
									);
									inlineMatches.push(
										hasIndicator ? trimmed : `- ${trimmed}`,
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
											const hasIndicator = /^[-@*~]/.test(
												trimmed,
											);
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
							} catch {
								new Notice(
									`Error while processing ${file.name}`,
								);
								return [];
							}
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
			new Notice("Error scanning for Chronos items");
			console.error(
				"[Chronos] Error in _generateTimelineFromFolder:",
				error,
			);
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
			(view as unknown as { entries: typeof entries }).entries = entries;
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

	private async _fetchGitHubReleases(): Promise<GitHubRelease[]> {
		const url =
			"https://api.github.com/repos/clairefro/obsidian-plugin-chronos/releases";

		try {
			const response = await requestUrl({
				url,
				headers: {
					Accept: "application/vnd.github.v3+json",
				},
			});

			return response.json as GitHubRelease[];
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

type SecretNames = Record<string, string | undefined>;

class ChronosPluginSettingTab extends PluginSettingTab {
	plugin: ChronosPlugin;

	constructor(app: App, plugin: ChronosPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.containerEl.addClass("chronos-settings");
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const settings = this.plugin.settings;
		const providerNames: Record<string, string> = {
			openai: "OpenAI",
			gemini: "Gemini",
			anthropic: "Claude",
			openrouter: "OpenRouter",
			ollama: "Ollama",
			lmstudio: "LM Studio",
		};
		const providerName = (provider: string) =>
			providerNames[provider] || provider;
		const currentProvider = () => settings.aiProvider || "openai";
		const aiEnabled = () => settings.useAI;
		const providerIs = (provider: string) => () =>
			aiEnabled() && currentProvider() === provider;
		const group = (
			heading: string,
			items: SettingDefinition[],
		): SettingDefinitionItem => ({
			type: "group" as const,
			heading,
			items,
		});
		const saveModel = async (provider: string, model: string) => {
			settings.aiModels = {
				...settings.aiModels,
				[provider]: model,
			};
			await this.plugin.saveSettings();
		};
		const modelDefinition = (provider: string): SettingDefinition => ({
			name: `${providerName(provider)} model`,
			desc: "Model used for the selected provider",
			visible: providerIs(provider),
			render: (setting) => {
				const defaultModel = PROVIDER_DEFAULT_MODELS[provider] || "";
				const configuredModel =
					settings.aiModels?.[provider] || defaultModel;
				let modelInput: HTMLInputElement | undefined;
				if (configuredModel !== defaultModel) {
					setting
						.addButton((button) =>
							button
								.setButtonText(
									`Use ${defaultModel} (recommended)`,
								)
								.setTooltip(
									`Replace with recommended model: ${defaultModel}`,
								)
								.setCta()
								.onClick(async () => {
									await saveModel(provider, defaultModel);
									if (modelInput) {
										modelInput.value = defaultModel;
									}
									button.buttonEl.hide();
								}),
						)
						.setClass("chronos-model-default-button");
				}
				setting.addText((text) => {
					modelInput = text.inputEl;
					text.setValue(configuredModel).onChange(async (value) => {
						await saveModel(provider, value.trim());
					});
				});
			},
		});
		const localModelDefinition = (
			provider: "ollama" | "lmstudio",
		): SettingDefinition => ({
			name: `${providerName(provider)} model`,
			desc: "Select a model available from the configured local server",
			visible: providerIs(provider),
			render: (setting) => {
				let active = true;
				let requestId = 0;
				const configuredModel =
					settings.aiModels?.[provider] ||
					PROVIDER_DEFAULT_MODELS[provider] ||
					"";
				let dropdown: DropdownComponent | undefined;
				const loadModels = async () => {
					if (!dropdown) return;
					const currentRequestId = ++requestId;
					dropdown.selectEl.replaceChildren();
					dropdown.addOption("", "Loading models...");
					try {
						const models = await this._fetchLocalModels(provider);
						if (!active || currentRequestId !== requestId) return;
						dropdown.selectEl.replaceChildren();
						const selectedModel =
							settings.aiModels?.[provider] || configuredModel;
						dropdown.addOption(
							"",
							models.length
								? "Select a model"
								: "No models found",
						);
						if (selectedModel && !models.includes(selectedModel)) {
							dropdown.addOption(
								selectedModel,
								`${selectedModel} (saved; not reported)`,
							);
						}
						for (const model of models) {
							dropdown.addOption(model, model);
						}
						dropdown.setValue(selectedModel || "");
						if (!models.length) {
							setting.setDesc(
								"No models found. Check the server and refresh.",
							);
						}
					} catch {
						if (!active || currentRequestId !== requestId) return;
						dropdown.selectEl.replaceChildren();
						dropdown.addOption("", "Unable to load models");
						const selectedModel =
							settings.aiModels?.[provider] || configuredModel;
						if (selectedModel) {
							dropdown.addOption(
								selectedModel,
								`${selectedModel} (saved)`,
							);
						}
						dropdown.setValue(selectedModel || "");
						setting.setDesc(
							"Could not reach the local server. Check the base URL, then refresh.",
						);
					}
				};

				setting.addDropdown((control) => {
					dropdown = control;
					control.onChange(async (value) => {
						if (value) await saveModel(provider, value);
					});
				});
				setting.addButton((button) =>
					button
						.setButtonText("Refresh models")
						.onClick(() => void loadModels()),
				);
				void loadModels();
				return () => {
					active = false;
					requestId++;
				};
			},
		});
		const baseUrlDefinition = (
			provider: "openrouter" | "ollama" | "lmstudio",
		): SettingDefinition => ({
			name: `${providerName(provider)} API base URL`,
			desc: "OpenAI-compatible API endpoint",
			visible: providerIs(provider),
			render: (setting) => {
				setting.addText((text) =>
					text
						.setPlaceholder(PROVIDER_DEFAULT_BASE_URLS[provider])
						.setValue(
							settings.aiBaseUrls?.[provider] ||
								PROVIDER_DEFAULT_BASE_URLS[provider],
						)
						.onChange(async (value) => {
							settings.aiBaseUrls = {
								...settings.aiBaseUrls,
								[provider]: value.trim(),
							};
							await this.plugin.saveSettings();
						}),
				);
			},
		});
		const secretDefinition = (provider: string): SettingDefinition => ({
			name: `${providerName(provider)} API key`,
			desc:
				provider === "ollama" || provider === "lmstudio"
					? "Select a SecretStorage key (optional for local providers)."
					: "Select a SecretStorage key for this provider.",
			visible: providerIs(provider),
			render: (setting) => {
				new SecretComponent(this.app, setting.controlEl)
					.setValue(
						(settings as unknown as SecretNames)[
							`${provider}SecretName`
						] || "",
					)
					.onChange(async (value) => {
						(settings as unknown as SecretNames)[
							`${provider}SecretName`
						] = value || "";
						await this.plugin.saveSettings();
					});
			},
		});
		const noticeToggle = (
			name: string,
			desc: string,
			key: "clickToUse" | "roundRanges" | "useUtc",
		): SettingDefinition => ({
			name,
			desc,
			render: (setting) => {
				setting.addToggle((toggle) =>
					toggle.setValue(settings[key]).onChange(async (value) => {
						settings[key] = value;
						new Notice(
							"Refresh rendering of timelines for this change to take effect.",
						);
						await this.plugin.saveSettings();
					}),
				);
			},
		});

		const supportedLocales = knownLocales.filter(
			(locale) =>
				Intl.DateTimeFormat.supportedLocalesOf(locale).length > 0,
		);
		const localeOptions: Record<string, string> = {};
		for (const locale of supportedLocales) {
			const name = new Intl.DisplayNames([locale], {
				type: "language",
			}).of(locale);
			localeOptions[locale] = `${name} (${locale})`;
		}

		const basesProperties = itemPropertyNames.map(
			(property): SettingDefinition => ({
				name: itemProps[property].displayName,
				render: (setting) => {
					setting.addText((text) =>
						text
							.setValue(
								settings.basesPropNames[property] ??
									BASES_PROP_NAMES_DEFAULTS[property],
							)
							.setPlaceholder(BASES_PROP_NAMES_DEFAULTS[property])
							.onChange(async (value) => {
								const defaultValue =
									BASES_PROP_NAMES_DEFAULTS[property];
								settings.basesPropNames[property] =
									value.trim() || defaultValue;
								await this.plugin.saveSettings();
							}),
					);
				},
			}),
		);

		return [
			{
				name: "Create and share Chronos timelines",
				searchable: false,
				render: (setting) => {
					setting.controlEl.createEl("a", {
						text: "Create and share Chronos timelines outside Obsidian ↗",
						attr: {
							href: "https://clairefro.github.io/chronos-timeline-md/",
							target: "_blank",
							rel: "noopener noreferrer",
						},
						cls: "chronos-announcement-link",
					});
				},
			},
			group("Display", [
				{
					name: "Select locale",
					desc: "Choose a locale for displaying dates",
					control: {
						type: "dropdown",
						key: "selectedLocale",
						defaultValue: DEFAULT_LOCALE,
						options: localeOptions,
					},
				},
				noticeToggle(
					"Require click to use",
					"Require clicking on a timeline to activate features like zoom and scroll.",
					"clickToUse",
				),
				noticeToggle(
					"Round endcaps on ranges",
					"Adds rounding to ranged events to make start and end clear.",
					"roundRanges",
				),
				noticeToggle(
					"Use UTC time (recommended)",
					"If disabled, Chronos uses system time; local time may shift historical events by a day.",
					"useUtc",
				),
				{
					name: "Item alignment",
					desc: "Alignment of event boxes and item text.",
					control: {
						type: "dropdown",
						key: "align",
						defaultValue: "left",
						options: {
							left: "Left",
							center: "Center",
							right: "Right",
						},
					},
				},
			]),
			group("Bases view", [
				{
					name: "Property names",
					desc:
						"Customize the default property names used for new Chronos Timeline " +
						"Bases Views. If empty, a default property name will be used. " +
						"Changes to these settings apply only to Views created after the " +
						"settings are changed. Existing Views are not changed.",
				},
				...basesProperties,
			]),
			group("Performance", [
				{
					name: "Enhance features with caching",
					desc: "Improves folder timeline generation by listing only folders with Chronos items; not recommended for massive vaults.",
					render: (setting) => {
						setting.addToggle((toggle) =>
							toggle
								.setValue(settings.enableCaching ?? false)
								.onChange(async (value) => {
									settings.enableCaching = value;
									await this.plugin.saveSettings();
									if (value) {
										new Notice("Initializing cache...");
										this.plugin.cacheUtils.fileChronosCache.clear();
										this.plugin.cacheUtils.folderChronosCache.clear();
										this.plugin.cacheUtils.cacheInitialized = false;
										await this.plugin.cacheUtils.initializeFolderCache();
										new Notice(
											"Cache initialized successfully",
										);
									} else {
										this.plugin.cacheUtils.fileChronosCache.clear();
										this.plugin.cacheUtils.folderChronosCache.clear();
										this.plugin.cacheUtils.cacheInitialized = false;
										await this.plugin.cacheUtils.deleteCache();
										new Notice("Caching disabled");
									}
								}),
						);
					},
				},
			]),
			group("Updates", [
				{
					name: "Show changelog on update",
					desc: "Display the What's New modal when the plugin updates.",
					control: {
						type: "toggle",
						key: "showChangelogOnUpdate",
						defaultValue: true,
					},
				},
				{
					name: "View full release history",
					searchable: false,
					render: (setting) => {
						setting.controlEl.createEl("a", {
							text: "View full release history",
							href: "https://github.com/clairefro/obsidian-plugin-chronos/releases",
							attr: {
								target: "_blank",
								rel: "noopener noreferrer",
							},
						});
					},
				},
			]),
			group("AI", [
				{
					name: "Use AI features",
					desc: "Toggle AI timeline generation commands and settings.",
					control: { type: "toggle", key: "useAI" },
				},
				{
					name: "AI provider",
					desc: "Choose the provider for timeline generation.",
					visible: aiEnabled,
					control: {
						type: "dropdown",
						key: "aiProvider",
						defaultValue: "openai",
						options: {
							openai: "OpenAI",
							gemini: "Gemini (Google)",
							anthropic: "Claude (Anthropic)",
							openrouter: "OpenRouter",
							ollama: "Ollama (local)",
							lmstudio: "LM Studio (local)",
						},
					},
				},
				modelDefinition("openai"),
				modelDefinition("gemini"),
				modelDefinition("anthropic"),
				modelDefinition("openrouter"),
				localModelDefinition("ollama"),
				localModelDefinition("lmstudio"),
				baseUrlDefinition("openrouter"),
				baseUrlDefinition("ollama"),
				baseUrlDefinition("lmstudio"),
				secretDefinition("openai"),
				secretDefinition("gemini"),
				secretDefinition("anthropic"),
				secretDefinition("openrouter"),
				secretDefinition("ollama"),
				secretDefinition("lmstudio"),
			]),
			group("Cheatsheet", [
				{
					name: "Chronos syntax",
					desc: "Read-only syntax reference.",
					searchable: false,
					render: (setting) => {
						const textarea = setting.controlEl.createEl(
							"textarea",
							{
								cls: "chronos-settings-md-container",
								text: ChronosTimeline.cheatsheet,
							},
						);
						textarea.readOnly = true;
					},
				},
				{
					name: "Copy cheatsheet",
					searchable: false,
					render: (setting) => {
						setting.addButton((button) =>
							button
								.setButtonText("Copy cheatsheet")
								.setCta()
								.onClick(async () => {
									try {
										await navigator.clipboard.writeText(
											ChronosTimeline.cheatsheet,
										);
										new Notice(
											"Cheatsheet copied to clipboard!",
										);
									} catch (error) {
										console.error(
											"[Chronos] Failed to copy cheatsheet:",
											error,
										);
										new Notice("Failed to copy cheatsheet");
									}
								}),
						);
					},
				},
				{
					name: "Learn more",
					searchable: false,
					render: (setting) => {
						setting.controlEl.createEl("a", {
							text: "Learn more",
							href: "https://github.com/clairefro/obsidian-plugin-chronos",
							attr: { target: "_blank" },
						});
					},
				},
			]),
		];
	}

	private async _fetchLocalModels(provider: string): Promise<string[]> {
		const baseUrl =
			this.plugin.settings.aiBaseUrls?.[provider] ||
			PROVIDER_DEFAULT_BASE_URLS[provider];
		const secretName = (this.plugin.settings as unknown as SecretNames)[
			`${provider}SecretName`
		];
		const apiKey = secretName
			? this.app.secretStorage.getSecret(secretName)
			: null;
		const headers: Record<string, string> = {};
		if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

		const response = await requestUrl({
			url: `${baseUrl.replace(/\/+$/, "")}/models`,
			method: "GET",
			headers,
		});
		const models = response.json?.data;
		if (!Array.isArray(models)) return [];
		return Array.from(
			new Set(
				models
					.map((model: { id?: unknown } | null) => model?.id)
					.filter(
						(modelId: unknown): modelId is string =>
							typeof modelId === "string" && modelId.length > 0,
					),
			),
		);
	}
}
