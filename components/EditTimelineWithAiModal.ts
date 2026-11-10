import { App, Modal, Notice, Setting } from "obsidian";
import { TimelineEditSnapshot } from "../util/inlineTimelineEditing";
import { createEditableDiff } from "../util/editableTimelineDiff";
import type { AIProviderConfig } from "../lib/ai/providers/providerFactory";
import { renderHighlightedChronos } from "../util/chronosHighlight";

let nextRequestLabelId = 0;

function renderDiff(container: HTMLElement, text: string): void {
	container.empty();
	for (const line of text.split("\n")) {
		const kind = line.startsWith("+ ")
			? "added"
			: line.startsWith("- ")
				? "removed"
				: "unchanged";
		container.createDiv({
			cls: `chronos-ai-edit-diff-${kind}`,
			text: line,
		});
	}
}

export class EditTimelineWithAiModal extends Modal {
	private closed = false;
	private destroyPreview?: () => void;

	constructor(
		app: App,
		private capture: () => TimelineEditSnapshot,
		private generate: (
			markdown: string,
			request: string,
		) => Promise<string>,
		private apply: (
			snapshot: TimelineEditSnapshot,
			markdown: string,
		) => void,
		private renderPreview: (
			container: HTMLElement,
			markdown: string,
		) => () => void,
		private getProviderConfig: () => AIProviderConfig,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle("Edit timeline markdown with AI");
		this.titleEl.addClass("chronos-ai-edit-title");
		this.contentEl.addClass("chronos-ai-edit-content");
		const requestLabelId = `chronos-ai-edit-request-label-${++nextRequestLabelId}`;
		const input = this.contentEl.createEl("textarea", {
			cls: "chronos-ai-edit-textarea chronos-ai-edit-request",
			attr: {
				placeholder: "Describe the changes you want",
				"aria-labelledby": requestLabelId,
				rows: "4",
			},
		});
		const originalDetails = this.contentEl.createEl("details", {
			cls: "chronos-ai-edit-details",
		});
		originalDetails.createEl("summary", { text: "Current markdown" });
		const original = originalDetails.createEl("pre", {
			cls: "chronos-ai-edit-original",
			attr: { "aria-label": "Current timeline markdown", tabindex: "0" },
		});
		const status = this.contentEl.createEl("p");
		const review = this.contentEl.createDiv({
			cls: "chronos-ai-edit-review",
		});
		review.hidden = true;
		const proposedDetails = review.createEl("details", {
			cls: "chronos-ai-edit-details",
		});
		proposedDetails.createEl("summary", { text: "Proposed changes" });
		const diff = proposedDetails.createDiv({
			cls: "chronos-ai-edit-diff",
			attr: { "aria-label": "Proposed markdown changes", role: "region" },
		});
		review.createEl("h3", { text: "Timeline preview" });
		const preview = review.createDiv({ cls: "chronos-ai-preview" });
		let snapshot: TimelineEditSnapshot | undefined;
		let result: string | undefined;
		let requestVersion = 0;
		try {
			renderHighlightedChronos(original, this.capture().markdown);
		} catch (error) {
			console.error("[Chronos] Could not load timeline markdown:", error);
			status.setText(
				error instanceof Error ? error.message : String(error),
			);
		}
		input.addEventListener("input", () => {
			requestVersion++;
			status.setText("");
		});
		const controls = new Setting(this.contentEl);
		const getProviderLabel = () => {
			const config = this.getProviderConfig();
			return `Provider: ${config.provider} · Model: ${config.model || "not set"}`;
		};
		const providerLabel = this.contentEl.createDiv({
			cls: "chronos-ai-edit-provider",
			text: getProviderLabel(),
		});
		controls.addButton((button) => {
			input.addEventListener("keydown", (event) => {
				if (
					event.key !== "Enter" ||
					event.shiftKey ||
					event.ctrlKey ||
					event.metaKey ||
					event.altKey ||
					event.isComposing
				) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				if (!event.repeat && !button.buttonEl.disabled) {
					button.buttonEl.click();
				}
			});
			button
				.setButtonText("Generate changes")
				.setCta()
				.onClick(async () => {
					const request = input.value.trim();
					if (!request) {
						new Notice("Describe the changes you want first.");
						return;
					}
					const version = requestVersion;
					providerLabel.setText(getProviderLabel());
					button.setDisabled(true);
					applyButton.setDisabled(true);
					try {
						const current = this.capture();
						if (
							snapshot &&
							(current.editor !== snapshot.editor ||
								current.path !== snapshot.path ||
								current.document !== snapshot.document)
						) {
							throw new Error(
								"The note changed. Close this dialog and try again.",
							);
						}
						if (!snapshot) {
							snapshot = current;
							renderHighlightedChronos(
								original,
								current.markdown,
							);
						}
						status.setText("Generating changes...");
						const generated = await this.generate(
							result ?? snapshot.markdown,
							request,
						);
						if (this.closed) return;
						if (version !== requestVersion) {
							status.setText(
								"The request changed. Generate changes again.",
							);
							return;
						}
						const wasHidden = review.hidden;
						review.hidden = false;
						const candidate = preview.createDiv({
							cls: "chronos-timeline-container chronos-ai-preview-timeline",
						});
						let destroy: () => void;
						try {
							destroy = this.renderPreview(candidate, generated);
						} catch (error) {
							candidate.remove();
							review.hidden = wasHidden;
							throw error;
						}
						this.destroyPreview?.();
						this.destroyPreview = () => {
							destroy();
							candidate.remove();
						};
						result = generated;
						renderDiff(
							diff,
							createEditableDiff(snapshot.markdown, generated),
						);
						input.value = "";
						input.setAttribute(
							"placeholder",
							"Describe further changes",
						);
						button.setButtonText("Refine with AI");
						status.setText("");
					} catch (error) {
						if (this.closed) return;
						console.error(
							"[Chronos] AI timeline edit failed:",
							error,
						);
						status.setText(
							error instanceof Error
								? error.message
								: String(error),
						);
					} finally {
						if (!this.closed) {
							button.setDisabled(false);
							applyButton.setDisabled(result === undefined);
						}
					}
				});
		});
		let applyButton: import("obsidian").ButtonComponent;
		controls.addButton((button) => {
			applyButton = button;
			button
				.setButtonText("Apply changes")
				.setDisabled(true)
				.onClick(() => {
					if (!snapshot || result === undefined) return;
					try {
						this.apply(snapshot, result);
						this.close();
						new Notice("Timeline markdown updated.");
					} catch (error) {
						console.error(
							"[Chronos] Could not apply AI timeline edit:",
							error,
						);
						status.setText(
							error instanceof Error
								? error.message
								: String(error),
						);
						button.setDisabled(true);
					}
				});
		});
		controls.addButton((button) =>
			button.setButtonText("Cancel").onClick(() => this.close()),
		);
		this.contentEl.createSpan({
			cls: "chronos-ai-edit-accessible-label",
			text: "Requested changes",
			attr: { id: requestLabelId },
		});
	}

	onClose(): void {
		this.closed = true;
		this.destroyPreview?.();
		this.destroyPreview = undefined;
		this.contentEl.empty();
	}
}
