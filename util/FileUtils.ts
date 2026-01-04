import { TFile, TFolder, Editor, MarkdownView } from "obsidian";
import { DETECTION_PATTERN_CODEBLOCK } from "../constants";

export class FileUtils {
	plugin: any;

	constructor(plugin: any) {
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
					setTimeout(() => {
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
				// Assuming Notice is imported or available
				new (window as any).Notice(msg);
			}
		} catch (error) {
			const msg = `Error opening file: ${error.message}`;
			console.error(msg);
			new (window as any).Notice(msg);
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

	async updateWikiLinks(oldPath: string, newPath: string) {
		const files = this.plugin.app.vault.getMarkdownFiles();

		const updatedFiles = [];
		for (const file of files) {
			const content = await this.plugin.app.vault.read(file);
			const hasChronosBlock = /```(?:\s*)chronos/.test(content);
			if (hasChronosBlock) {
				const updatedContent = this.updateLinksInChronosBlocks(
					content,
					oldPath,
					newPath,
				);

				if (updatedContent !== content) {
					console.log("UPDATING ", file.path);
					updatedFiles.push(file.path);

					await this.plugin.app.vault.modify(file, updatedContent);
				}
			}
		}
		if (updatedFiles.length) {
			console.log(
				`Updated links to ${this.normalizePath(newPath)} in ${
					updatedFiles.length
				} files: `,
				updatedFiles,
			);
		}
	}

	updateLinksInChronosBlocks(
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

			const normalizedOldPath = this.normalizePath(oldPath);
			const normalizedNewPath = this.normalizePath(newPath);

			// Replace wiki links inside the code fence
			const updatedFenceContent = fenceContent.replace(
				new RegExp(
					`\\[\\[${this.escapeRegExp(normalizedOldPath)}\\]\\]`,
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

	normalizePath(path: string) {
		// strip aliases and .md extension
		return path.replace(/(\|.+$)|(\.md$)/g, "");
	}

	escapeRegExp(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}
}
