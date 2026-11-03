import {
	App,
	TAbstractFile,
	TFile,
	TFolder,
	MarkdownView,
	Notice,
} from "obsidian";

export class FileUtils {
	plugin: { app: App };

	constructor(plugin: { app: App }) {
		this.plugin = plugin;
	}

	getAllFilesInFolder(folder: TFolder): TFile[] {
		const files: TFile[] = [];

		for (const child of folder.children) {
			if (child instanceof TFile) {
				files.push(child);
			} else if (child instanceof TFolder) {
				// Recursively get files from subfolders
				files.push(...this.getAllFilesInFolder(child));
			}
		}

		return files;
	}

	async openFileFromWikiLink(wikiLink: string, openInNewLeaf = false) {
		const cleanedLink = wikiLink.replace(/^\[\[|\]\]$/g, "");

		// Check if the link contains a section/heading
		const [filename, section] = cleanedLink.split("#");
		const [path, alias] = cleanedLink.split("|");

		const pathNoHeader = path.split("#")[0];

		try {
			const file =
				// 1. Try with file finder and match based on full path or alias
				this.plugin.app.vault
					.getFiles()
					.find(
						(file: TFile) =>
							file.path === pathNoHeader + ".md" ||
							file.path === pathNoHeader ||
							file.basename === pathNoHeader,
					) ||
				// 2. Try matching by basename (case-insensitive)
				this.plugin.app.vault
					.getFiles()
					.find(
						(file: TFile) =>
							file.basename.toLowerCase() ===
							alias?.toLowerCase(),
					) ||
				null; // Return null if no match is found
			if (file) {
				let leaf = this.plugin.app.workspace.getLeaf(false); // open in current leaf by default
				if (openInNewLeaf) {
					// apparently getLeaf("tab") opens the link in a new tab
					leaf = this.plugin.app.workspace.getLeaf("tab");
				}
				const line = section
					? await this.findLineForHeading(file, section)
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
					window.setTimeout(() => {
						const editor =
							this.plugin.app.workspace.getActiveViewOfType(
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
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			const msg = `Error opening file: ${errorMessage}`;
			console.error(msg);
			new Notice(msg);
		}
	}

	// Helper method to find the line number for a specific heading
	async findLineForHeading(
		file: TFile,
		heading: string,
	): Promise<number | undefined> {
		const fileContent = await this.plugin.app.vault.read(file);
		const lines = fileContent.split("\n");

		// Find the line number of the heading
		const headingLine = lines.findIndex(
			(line: string) =>
				line.trim().replace("#", "").trim().toLowerCase() ===
				heading.toLowerCase(),
		);

		return headingLine !== -1 ? headingLine : 0;
	}

	/** Handles a vault rename event for a file or a folder (including its contents). */
	async handleRename(file: TAbstractFile, oldPath: string) {
		const pairs: { oldPath: string; newPath: string }[] = [];
		if (file instanceof TFolder) {
			for (const child of this.getAllFilesInFolder(file)) {
				pairs.push({
					oldPath: oldPath + child.path.slice(file.path.length),
					newPath: child.path,
				});
			}
		} else {
			pairs.push({ oldPath, newPath: file.path });
		}
		await this.updateWikiLinks(pairs);
	}

	async updateWikiLinks(pairs: { oldPath: string; newPath: string }[]) {
		if (!pairs.length) return;
		const files = this.plugin.app.vault.getMarkdownFiles();

		// Basename links are only rewritten when the note was renamed and the old name was unambiguous
		const resolved = pairs.map((pair) => {
			const oldBase = this.normalizePath(pair.oldPath).split("/").pop();
			const newBase = this.normalizePath(pair.newPath).split("/").pop();
			const basenameIsUnique =
				oldBase !== newBase &&
				!files.some(
					(f: TFile) =>
						f.path !== pair.newPath && f.basename === oldBase,
				);
			return { ...pair, basenameIsUnique };
		});

		const updatedFiles: string[] = [];
		for (const file of files) {
			const content = await this.plugin.app.vault.read(file);
			if (!/```(?:\s*)chronos/.test(content)) continue;

			let updatedContent = content;
			for (const r of resolved) {
				updatedContent = this.updateLinksInChronosBlocks(
					updatedContent,
					r.oldPath,
					r.newPath,
					r.basenameIsUnique,
				);
			}

			if (updatedContent !== content) {
				updatedFiles.push(file.path);
				await this.plugin.app.vault.modify(file, updatedContent);
			}
		}
		if (updatedFiles.length) {
			new Notice(
				`[Chronos] Updated timeline links in ${updatedFiles.length} ${updatedFiles.length > 1 ? "files" : "file"}`,
			);
		}
	}

	updateLinksInChronosBlocks(
		content: string,
		oldPath: string,
		newPath: string,
		matchByBasename = true,
	): string {
		const oldFull = this.normalizePath(oldPath);
		const newFull = this.normalizePath(newPath);
		const oldBase = oldFull.split("/").pop() as string;
		const newBase = newFull.split("/").pop() as string;

		const linkRegex = /\[\[([^\]|#]+)(#[^\]|]*)?(\|[^\]]*)?\]\]/g;

		return content.replace(/```(?:\s*)chronos[\s\S]*?```/g, (fence) =>
			fence.replace(
				linkRegex,
				(whole, target: string, heading = "", alias = "") => {
					const t = target.trim().replace(/\.md$/, "");
					if (t === oldFull) {
						return `[[${newFull}${heading}${alias}]]`;
					}
					if (matchByBasename && t === oldBase) {
						return `[[${newBase}${heading}${alias}]]`;
					}
					return whole;
				},
			),
		);
	}

	normalizePath(path: string) {
		// strip aliases and .md extension
		return path.replace(/(\|.+$)|(\.md$)/g, "");
	}

	escapeRegExp(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}
}
