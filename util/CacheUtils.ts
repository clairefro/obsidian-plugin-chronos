import { Plugin, TFile, TFolder } from "obsidian";
import {
	DETECTION_PATTERN_TEXT,
	DETECTION_PATTERN_CODEBLOCK,
} from "../constants";

interface PluginManager {
	getPluginFolder(id: string): string;
}

export class CacheUtils {
	plugin: Plugin; // avoiding importing the Chronos plugin type due to circular import
	pluginsDir: string;
	pluginDir: string;
	cachePath: string;
	fileChronosCache = new Map<string, number>();
	folderChronosCache = new Map<string, number>();
	cacheInitialized = false;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
		const plugins = (
			this.plugin.app as unknown as { plugins: PluginManager }
		).plugins;
		this.pluginsDir = plugins.getPluginFolder(this.plugin.manifest.id);
		this.pluginDir = `${this.pluginsDir}/${this.plugin.manifest.id}`;
		this.cachePath = `${this.pluginDir}/cache.json`;
	}

	async loadCache(): Promise<void> {
		try {
			const cacheData = await this.plugin.app.vault.adapter.read(
				this.cachePath,
			);
			const parsed = JSON.parse(cacheData);
			this.fileChronosCache = new Map(parsed.fileChronosCache || []);
			this.folderChronosCache = new Map(parsed.folderChronosCache || []);
			this.cacheInitialized = true;
		} catch {
			await this.initializeFolderCache();
		}
	}

	async saveCache(): Promise<void> {
		try {
			// Obsidian's typings only declare one argument; keep the original recursive call
			const adapter = this.plugin.app.vault.adapter as unknown as {
				mkdir(
					path: string,
					options?: { recursive: boolean },
				): Promise<void>;
			};
			await adapter.mkdir(this.pluginDir, { recursive: true });

			const dataToSave = {
				fileChronosCache: Array.from(
					this.fileChronosCache.entries(),
				).filter(([_path, count]) => count > 0), // Only save files with items
				folderChronosCache: Array.from(
					this.folderChronosCache.entries(),
				).filter(([_path, count]) => count > 0), // Only save folders with items
			};
			await this.plugin.app.vault.adapter.write(
				this.cachePath,
				JSON.stringify(dataToSave, null, 2),
			);
		} catch (error) {
			console.error("[ERROR] Failed to save cache:", error);
		}
	}

	async deleteCache(): Promise<void> {
		try {
			await this.plugin.app.vault.adapter.remove(this.cachePath);
		} catch {
			// Silently fail if file doesn't exist
		}
	}

	async initializeFolderCache(): Promise<void> {
		if (this.cacheInitialized) return;

		// Cache individual file counts
		const allFiles = this.plugin.app.vault
			.getMarkdownFiles()
			.filter((file: TFile) => this.shouldIndexFile(file));

		for (const file of allFiles) {
			const count = await this.countChronosInFile(file);
			this.fileChronosCache.set(file.path, count);
		}

		// Cache folder counts (recursive)
		const allFolders = this.plugin.app.vault.getAllFolders();
		for (const folder of allFolders) {
			const count = await this.folderContainsChronos(folder);
			this.folderChronosCache.set(folder.path, count);
		}

		this.cacheInitialized = true;
		await this.saveCache(); // Save cache after initialization
	}

	async countChronosInFile(file: TFile): Promise<number> {
		if (!this.shouldIndexFile(file)) return 0; // Skip excluded files

		let count = 0;
		try {
			const text = await this.plugin.app.vault.cachedRead(file);

			// Count inline chronos blocks
			const inlineMatches = text.match(DETECTION_PATTERN_TEXT);
			if (inlineMatches) {
				count += inlineMatches.length;
			}

			// Count items in chronos code blocks
			const codeBlockMatches = text.matchAll(DETECTION_PATTERN_CODEBLOCK);
			for (const match of codeBlockMatches) {
				const blockContent = match[1];
				const lines = blockContent.split("\n");
				const itemCount = lines.filter((line: string) => {
					const trimmed = line.trim();
					return (
						trimmed &&
						!trimmed.startsWith("#") &&
						!trimmed.startsWith(">")
					);
				}).length;
				count += itemCount;
			}
		} catch (error) {
			console.error(
				`[ERROR] Failed to read file ${file.path}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		return count;
	}

	async folderContainsChronos(folder: TFolder): Promise<number> {
		let totalCount = 0;
		const children = folder.children.filter(
			(file): file is TFile => file instanceof TFile,
		);

		for (const file of children) {
			try {
				const count = await this.countChronosInFile(file);
				totalCount += count;
			} catch (error) {
				console.error(
					`[ERROR] Failed to count items in file ${file.path}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		const childFolders = folder.children.filter(
			(child): child is TFolder => child instanceof TFolder,
		);

		for (const childFolder of childFolders) {
			const childCount = await this.folderContainsChronos(childFolder);
			totalCount += childCount;
		}

		return totalCount;
	}

	invalidateFolderCache(folder: TFolder | null): void {
		if (!folder) return;
		// Use delta-based update instead of full rescan
		void this.updateFolderCacheWithDelta(folder);
	}

	async updateFolderCacheWithDelta(folder: TFolder | null): Promise<void> {
		if (!folder) return;

		// Calculate total delta for all files in this folder
		let totalDelta = 0;
		const files = folder.children.filter(
			(child): child is TFile =>
				child instanceof TFile && child.extension === "md",
		);

		for (const file of files) {
			const oldCount = this.fileChronosCache.get(file.path) || 0;
			const newCount = await this.countChronosInFile(file);
			const delta = newCount - oldCount;

			if (delta !== 0) {
				// Update file cache
				this.fileChronosCache.set(file.path, newCount);
				totalDelta += delta;
			}
		}

		// Propagate delta to this folder and all ancestors
		if (totalDelta !== 0) {
			let current: TFolder | null = folder;
			while (current) {
				const currentCount =
					this.folderChronosCache.get(current.path) || 0;
				const newCount = Math.max(0, currentCount + totalDelta);
				this.folderChronosCache.set(current.path, newCount);
				current = current.parent;
			}
		}
	}

	// Update only the necessary part of the cache (selected folder and recursive children)
	async updateFolderCache(folder: TFolder): Promise<void> {
		// Update file cache for all files in the folder
		const files = folder.children.filter(
			(child): child is TFile =>
				child instanceof TFile && child.extension === "md",
		);

		for (const file of files) {
			const count = await this.countChronosInFile(file);
			this.fileChronosCache.set(file.path, count);
		}

		// Update folder cache recursively
		const childFolders = folder.children.filter(
			(child): child is TFolder => child instanceof TFolder,
		);

		let totalCount = 0;
		for (const childFolder of childFolders) {
			await this.updateFolderCache(childFolder);
			totalCount += this.folderChronosCache.get(childFolder.path) || 0;
		}

		// Add counts from files in the current folder
		totalCount += files.reduce((sum, file) => {
			return sum + (this.fileChronosCache.get(file.path) || 0);
		}, 0);

		this.folderChronosCache.set(folder.path, totalCount);
	}

	shouldIndexFile(file: TFile): boolean {
		// Ignore hidden files and folders at root (starting with .), like .git and .obsidian
		if (file.path.startsWith(".")) return false;

		// Ignore files in node_modules at vault root (if they exist for some catastrophic reason)
		if (file.path.startsWith("node_modules/")) return false;

		// Only index markdown files
		return file.extension === "md";
	}
}
