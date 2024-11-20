import { Modal, App } from "obsidian";

export class TextModal extends Modal {
  text: string;
  constructor(app: App, _text: string) {
    super(app);
    this.text = _text;
  }

  onOpen() {
    this.setText(this.text);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  setText(text: string) {
    const { contentEl } = this;
    this.text = text;
    contentEl.setText(text);
  }
}
