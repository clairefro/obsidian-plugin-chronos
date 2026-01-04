import { ItemView, WorkspaceLeaf, MarkdownRenderer } from "obsidian";

export const CHANGELOG_VIEW_TYPE = "chronos-changelog-view";

interface ChangelogEntry {
	version: string;
	date: string;
	content: string;
}

export class ChangelogView extends ItemView {
	private entries: ChangelogEntry[];

	constructor(leaf: WorkspaceLeaf, entries: ChangelogEntry[]) {
		super(leaf);
		this.entries = entries;
	}

	getViewType(): string {
		return CHANGELOG_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "What's New in Chronos Timeline";
	}

	getIcon(): string {
		return "info";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass("chronos-changelog-view");

		// Add title
		container.createEl("h1", {
			text: "What's New in Chronos Timeline?",
			cls: "chronos-changelog-title",
		});

		// Add disclaimer
		const disclaimer = container.createDiv({
			cls: "chronos-changelog-disclaimer",
		});
		disclaimer.setText(
			"You can disable these notifications in your Chronos Timeline settings",
		);

		// Add link to all release notes
		const releaseLink = container.createEl("a", {
			text: "See full release history",
			cls: "chronos-changelog-releases-link",
			href: "https://github.com/clairefro/obsidian-plugin-chronos/releases",
		});
		releaseLink.setAttr("target", "_blank");
		releaseLink.setAttr("rel", "noopener noreferrer");

		// Add separator between header and content
		container.createEl("hr", {
			cls: "chronos-changelog-separator",
		});

		// Render each changelog entry
		for (let index = 0; index < this.entries.length; index++) {
			const entry = this.entries[index];

			// Add separator before entry (except first one)
			if (index > 0) {
				container.createEl("hr", {
					cls: "chronos-changelog-separator",
				});
			}

			const entryContainer = container.createDiv({
				cls: "chronos-changelog-entry",
			});

			// Version header with formatted date
			const headerText = entry.date
				? `Version ${entry.version} — ${this._formatDate(entry.date)}`
				: `Version ${entry.version}`;

			entryContainer.createEl("div", {
				cls: "chronos-changelog-header",
				text: headerText,
			});

			// Markdown content
			const contentDiv = entryContainer.createDiv({
				cls: "chronos-changelog-content",
			});

			await MarkdownRenderer.render(
				this.app,
				entry.content,
				contentDiv,
				"",
				this as any,
			);
		}

		// Add separator before support message
		container.createEl("hr", {
			cls: "chronos-changelog-separator",
		});

		// Add support message at the bottom
		const supportMsg = container.createDiv({
			cls: "chronos-changelog-support",
		});

		// Add text message
		const supportText = supportMsg.createDiv({
			cls: "chronos-changelog-support-text",
			text: "Love Chronos? Your support means a lot!",
		});

		// Create Buy Me a Coffee button
		const bmcLink = supportMsg.createEl("a", {
			href: "https://www.buymeacoffee.com/clairefro",
		});
		bmcLink.setAttr("target", "_blank");
		bmcLink.setAttr("rel", "noopener noreferrer");

		const bmcImg = bmcLink.createEl("img", {
			attr: {
				src: "https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png",
				alt: "Buy Me A Coffee",
			},
		});
		bmcImg.style.height = "60px";
		bmcImg.style.width = "217px";

		// Add hire me message
		const hireMeDiv = supportMsg.createDiv({
			cls: "chronos-changelog-hire-text",
		});
		await MarkdownRenderer.render(
			this.app,
			"Need a custom Obsidian plugin? I'm taking on freelance work during pregnancy. [Reach out!](https://clairefro.dev/)",
			hireMeDiv,
			"",
			this as any,
		);
	}

	async onClose(): Promise<void> {
		// Cleanup if needed
	}

	private _formatDate(dateString: string): string {
		try {
			const date = new Date(dateString);
			return date.toLocaleDateString(undefined, {
				year: "numeric",
				month: "long",
				day: "numeric",
			});
		} catch {
			return "";
		}
	}
}
