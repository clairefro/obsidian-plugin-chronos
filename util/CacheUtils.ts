import { TFile, TFolder } from "obsidian";
import {
	DETECTION_PATTERN_TEXT,
	DETECTION_PATTERN_CODEBLOCK,
} from "../constants";

export class CacheUtils {
	plugin: any; // ChronosPlugin

	constructor(plugin: any) {
		this.plugin = plugin;
	}

	async loadCache(): Promise<void> {
		if (!this.plugin.settings.usePersistentCache) {
			this.plugin.cacheInitialized = true;
			console.log("[INFO] Persistent cache disabled. Skipping load.");
			return;
		}

		try {
			const cachedData = await this.plugin.loadData();
			if (cachedData && cachedData.fileChronosCache) {
				this.plugin.fileChronosCache = new Map(
					cachedData.fileChronosCache,
				);
				this.plugin.folderChronosCache = new Map(
					cachedData.folderChronosCache,
				);
				this.plugin.cacheInitialized = true;
				console.log("[INFO] Cache loaded successfully.");
			} else {
				console.log("[INFO] No cache found. Initializing new cache.");
				await this.initializeFolderCache();
			}
		} catch (error) {
			console.error("[ERROR] Failed to load cache:", error);
			console.log("[INFO] Initializing new cache due to error.");
			await this.initializeFolderCache();
		}
	}

	async saveCache(): Promise<void> {
		if (!this.plugin.settings.usePersistentCache) {
			console.log("[INFO] Persistent cache disabled. Skipping save.");
			return;
		}

		try {
			const currentData = (await this.plugin.loadData()) || {};
			const dataToSave = {
				...currentData,
				fileChronosCache: Array.from(
					this.plugin.fileChronosCache.entries(),
				),
				folderChronosCache: Array.from(
					this.plugin.folderChronosCache.entries(),
				),
			};
			await this.plugin.saveData(dataToSave);
			console.log("[INFO] Cache saved successfully.");
		} catch (error) {
			console.error("[ERROR] Failed to save cache:", error);
		}
	}

	async initializeFolderCache(): Promise<void> {
		if (this.plugin.cacheInitialized) return;

		console.log("[INFO] Initializing cache...");

		// Cache individual file counts
		const allFiles = this.plugin.app.vault
			.getMarkdownFiles()
			.filter((file: TFile) => this.shouldIndexFile(file));
		for (const file of allFiles) {
			const count = await this.countChronosInFile(file);
			this.plugin.fileChronosCache.set(file.path, count);
		}

		// Cache folder counts (recursive)
		const allFolders = this.plugin.app.vault.getAllFolders();
		for (const folder of allFolders) {
			const count = await this.folderContainsChronos(folder);
			this.plugin.folderChronosCache.set(folder.path, count);
		}

		this.plugin.cacheInitialized = true;
		await this.saveCache(); // Save cache after initialization
		console.log("[INFO] Cache initialization complete.");
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
			const oldCount = this.plugin.fileChronosCache.get(file.path) || 0;
			const newCount = await this.countChronosInFile(file);
			const delta = newCount - oldCount;

			if (delta !== 0) {
				// Update file cache
				this.plugin.fileChronosCache.set(file.path, newCount);
				totalDelta += delta;
			}
		}

		// Propagate delta to this folder and all ancestors
		if (totalDelta !== 0) {
			let current: TFolder | null = folder;
			while (current) {
				const currentCount =
					this.plugin.folderChronosCache.get(current.path) || 0;
				const newCount = Math.max(0, currentCount + totalDelta);
				this.plugin.folderChronosCache.set(current.path, newCount);
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
			this.plugin.fileChronosCache.set(file.path, count);
		}

		// Update folder cache recursively
		const childFolders = folder.children.filter(
			(child) => child instanceof TFolder,
		) as TFolder[];

		let totalCount = 0;
		for (const childFolder of childFolders) {
			await this.updateFolderCache(childFolder);
			totalCount +=
				this.plugin.folderChronosCache.get(childFolder.path) || 0;
		}

		// Add counts from files in the current folder
		totalCount += files.reduce((sum, file) => {
			return sum + (this.plugin.fileChronosCache.get(file.path) || 0);
		}, 0);

		this.plugin.folderChronosCache.set(folder.path, totalCount);
	}

	shouldIndexFile(file: TFile): boolean {
		// Ignore hidden files and folders at root (starting with .), like .git and .obsidian
		if (file.path.startsWith(".")) return false;

		// Ignore files in node_modules at vault root
		if (file.path.startsWith("node_modules/")) return false;

		// Only index markdown files
		return file.extension === "md";
	}
}
