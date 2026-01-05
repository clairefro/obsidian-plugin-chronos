import { TFile, TFolder } from "obsidian";
import {
	DETECTION_PATTER_TEXT_FULL,
	DETECTION_PATTERN_CODEBLOCK,
} from "../constants";

export class CacheUtils {
	plugin: any; // Chronos Plugin - avoiding importing type due to circular import
	pluginsDir: string;
	pluginDir: string;
	cachePath: string;
	fileChronosCache = new Map<string, number>();
	folderChronosCache = new Map<string, number>();
	inlineChronosCache = new Set<string>();
	cacheInitialized = false;

	constructor(plugin: any) {
		this.plugin = plugin;
		this.pluginsDir = this.plugin.app.plugins.getPluginFolder(
			this.plugin.manifest.id,
		);
		this.pluginDir = `${this.pluginsDir}/${this.plugin.manifest.id}`;
		this.cachePath = `${this.pluginDir}/cache.json`;
	}

	async loadCache(): Promise<void> {
		console.log("Loading cache...")
		try {
			const cacheData = await this.plugin.app.vault.adapter.read(
				this.cachePath,
			);
			const parsed = JSON.parse(cacheData);
			this.fileChronosCache = new Map(parsed.fileChronosCache || []);
			this.folderChronosCache = new Map(parsed.folderChronosCache || []);
			this.inlineChronosCache = new Set<string>(parsed.inlineChronosCache) || new Set<string>;
			this.cacheInitialized = true;
		} catch (error) {
			await this.initializeFolderCache();
		}
	}

	async saveCache(): Promise<void> {
		console.log("Saving cache...")
		try {
			await this.plugin.app.vault.adapter.mkdir(this.pluginDir, {
				recursive: true,
			});

			const dataToSave = {
				fileChronosCache: Array.from(
					this.fileChronosCache.entries(),
				).filter(([_path, count]) => count > 0), // Only save files with items
				folderChronosCache: Array.from(
					this.folderChronosCache.entries(),
				).filter(([_path, count]) => count > 0), // Only save folders with items
				inlineChronosCache: Array.from(this.inlineChronosCache),
			};
			await this.plugin.app.vault.adapter.write(
				this.cachePath,
				JSON.stringify(dataToSave, null, 2),
			);
		} catch (error) {
			console.error("[ERROR] Failed to save cache:", error);
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
			const inlineMatches = text.match(DETECTION_PATTER_TEXT_FULL);
			if (inlineMatches) {
				count += inlineMatches.length;

				// I use the computation to also store the match found
				inlineMatches.forEach((element: string) => {
					this.inlineChronosCache.add(element.slice(element.indexOf(" "), element.length - 1).trim());
				});
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
				`[ERROR] Failed to read file ${file.path}: ${error.message}`,
			);
		}
		return count;
	}

	async folderContainsChronos(folder: TFolder): Promise<number> {
		let totalCount = 0;
		const children = folder.children.filter(
			(file) => file instanceof TFile,
		) as TFile[];

		for (const file of children) {
			try {
				const count = await this.countChronosInFile(file);
				totalCount += count;
			} catch (error) {
				console.error(
					`[ERROR] Failed to count items in file ${file.path}: ${error.message}`,
				);
			}
		}

		const childFolders = folder.children.filter(
			(child) => child instanceof TFolder,
		) as TFolder[];

		for (const childFolder of childFolders) {
			const childCount = await this.folderContainsChronos(childFolder);
			totalCount += childCount;
		}

		return totalCount;
	}

	invalidateFolderCache(folder: TFolder | null): void {
		if (!folder) return;
		// Use delta-based update instead of full rescan
		this.updateFolderCacheWithDelta(folder);
	}

	async updateFolderCacheWithDelta(folder: TFolder | null): Promise<void> {
		if (!folder) return;

		// Calculate total delta for all files in this folder
		let totalDelta = 0;
		const files = folder.children.filter(
			(child) => child instanceof TFile && child.extension === "md",
		) as TFile[];

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
			(child) => child instanceof TFile && child.extension === "md",
		) as TFile[];

		for (const file of files) {
			const count = await this.countChronosInFile(file);
			this.fileChronosCache.set(file.path, count);
		}

		// Update folder cache recursively
		const childFolders = folder.children.filter(
			(child) => child instanceof TFolder,
		) as TFolder[];

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
