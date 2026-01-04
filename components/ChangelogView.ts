import { ItemView, WorkspaceLeaf, MarkdownRenderer } from "obsidian";

export const CHANGELOG_VIEW_TYPE = "chronos-changelog-view";

interface ChangelogEntry {
	version: string;
	date: string;
	content: string;
}

export class ChangelogView extends ItemView {
	private entries: ChangelogEntry[];
	private settings: {
		showChangelogOnUpdate: boolean;
		onToggleNotification: (newValue: boolean) => Promise<void>;
	};

	constructor(
		leaf: WorkspaceLeaf,
		entries: ChangelogEntry[],
		settings: {
			showChangelogOnUpdate: boolean;
			onToggleNotification: (newValue: boolean) => Promise<void>;
		},
	) {
		super(leaf);
		this.entries = entries;
		this.settings = settings;
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

		// Add link to all release notes
		const releaseLink = container.createEl("a", {
			text: "See full release history",
			cls: "chronos-changelog-releases-link",
			href: "https://github.com/clairefro/obsidian-plugin-chronos/releases",
		});
		releaseLink.setAttr("target", "_blank");
		releaseLink.setAttr("rel", "noopener noreferrer");

		// Add a checkbox to toggle notifications
		const checkboxContainer = container.createDiv({
			cls: "chronos-changelog-checkbox-container",
		});

		const checkbox = checkboxContainer.createEl("input", {
			type: "checkbox",
			cls: "chronos-changelog-checkbox",
		});
		checkbox.checked = this.settings.showChangelogOnUpdate;

		const label = checkboxContainer.createEl("label", {
			text: "Show notable new features on updates (you can also change this in settings)",
			cls: "chronos-changelog-checkbox-label",
		});
		label.setAttr("for", "chronos-changelog-checkbox");

		checkbox.addEventListener("change", () => {
			const newValue = checkbox.checked;
			this.settings.showChangelogOnUpdate = newValue;
			if (this.settings.onToggleNotification) {
				this.settings.onToggleNotification(newValue);
			}
		});

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
		const bmcStyledLink = document.createElement("a");
		bmcStyledLink.href = "https://www.buymeacoffee.com/clairefro";
		bmcStyledLink.target = "_blank";
		bmcStyledLink.rel = "noopener noreferrer";
		bmcStyledLink.textContent = "🍠 Buy me a potato";
		bmcStyledLink.className = "bmc-styled-link";
		bmcStyledLink.tabIndex = 0;

		supportMsg.appendChild(bmcStyledLink);

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
