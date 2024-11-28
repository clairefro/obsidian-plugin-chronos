import {
  Plugin,
  App,
  Setting,
  PluginSettingTab,
  Notice,
  Editor,
} from "obsidian";

import { ChronosPluginSettings } from "./types";

import { TextModal } from "./components/TextModal";
import { knownLocales } from "./util/knownLocales";
import {
  cheatsheet,
  templateAdvanced,
  templateBasic,
  templateBlank,
} from "./util/snippets";
import { DEFAULT_LOCALE, PEPPER } from "./constants";
import { ChronosTimeline } from "./lib/ChronosTimeline";
import { decrypt, encrypt } from "./util/vanillaEncrypt";
import { GenAi } from "./lib/ai/GenAi";

const DEFAULT_SETTINGS: ChronosPluginSettings = {
  selectedLocale: DEFAULT_LOCALE,
};

export default class ChronosPlugin extends Plugin {
  settings: ChronosPluginSettings;

  async onload() {
    console.log("Loading Chronos Timeline Plugin...");

    this.settings = (await this.loadData()) || DEFAULT_SETTINGS;
    this.addSettingTab(new ChronosPluginSettingTab(this.app, this));

    this.registerMarkdownCodeBlockProcessor(
      "chronos",
      this._renderChronosBlock.bind(this)
    );

    this.addCommand({
      id: "insert-timeline-blank",
      name: "Insert timeline (blank)",
      editorCallback: (editor, _view) => {
        this._insertSnippet(editor, templateBlank);
      },
    });

    this.addCommand({
      id: "insert-timeline-basic",
      name: "Insert timeline example (basic)",
      editorCallback: (editor, _view) => {
        this._insertSnippet(editor, templateBasic);
      },
    });

    this.addCommand({
      id: "insert-timeline-advanced",
      name: "Insert timeline example (advanced)",
      editorCallback: (editor, _view) => {
        this._insertSnippet(editor, templateAdvanced);
      },
    });
    this.addCommand({
      id: "generate-timeline-ai",
      name: "Generate timeline with AI",
      editorCallback: (editor, _view) => {
        this._generateTimelineWithAi(editor);
      },
    });
  }

  onunload() {}

  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
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

  private _renderChronosBlock(source: string, el: HTMLElement) {
    const container = el.createEl("div", { cls: "chronos-timeline-container" });
    const timeline = new ChronosTimeline({
      container,
      settings: this.settings,
    });

    try {
      timeline.render(source);
    } catch (error) {
      console.log(error);
    }
  }

  private async _generateTimelineWithAi(editor: Editor) {
    if (!editor) {
      new Notice(
        "Make sure you are highlighting text in your note to generate a timeline from"
      );
    }

    const selection = this._getCurrentSelectedText(editor);
    if (!selection) {
      new Notice(
        "Highlight some text you'd like to convert into a timeline, then run the generate command again"
      );
      return;
    }
    // open loading modal
    const loadingModal = new TextModal(this.app, `Working on it....`);
    loadingModal.open();
    try {
      const chronos = await this._textToChronos(selection);
      chronos && this._insertTextAfterSelection(editor, chronos);
    } catch (e) {
      console.error(e);

      loadingModal.setText(e.message);
      return;
    }
    loadingModal.close();
  }

  private async _textToChronos(selection: string): Promise<string | void> {
    if (!this.settings.key) {
      new Notice(
        "No API Key found. Please add an OpenAI API key in Chronos Timeline Plugin Settings"
      );
      return;
    }
    const res = await new GenAi(this._getApiKey()).toChronos(selection);
    return res;
  }

  private _getCurrentSelectedText(editor: Editor): string {
    return editor ? editor.getSelection() : "";
  }

  private _getApiKey() {
    return decrypt(this.settings.key || "", PEPPER);
  }
}

class ChronosPluginSettingTab extends PluginSettingTab {
  plugin: ChronosPlugin;

  constructor(app: App, plugin: ChronosPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    const supportedLocales: string[] = [];
    const supportedLocalesNativeDisplayNames: Intl.DisplayNames[] = [];

    // get locales SUPPORTED by the user's environment, based off list of possible locales
    knownLocales.forEach((locale) => {
      if (Intl.DateTimeFormat.supportedLocalesOf(locale).length) {
        supportedLocales.push(locale);
      }
    });

    // get native display names of each locale
    supportedLocales.forEach((locale) => {
      const nativeDisplayNames = new Intl.DisplayNames([locale], {
        type: "language",
      });
      supportedLocalesNativeDisplayNames.push(
        nativeDisplayNames.of(locale) as unknown as Intl.DisplayNames
      );
    });

    new Setting(containerEl)
      .setName("Select locale")
      .setDesc("Choose a locale for displaying dates")
      .addDropdown((dropdown) => {
        supportedLocales.forEach((locale, i) => {
          const localeDisplayName = supportedLocalesNativeDisplayNames[i];
          const label = `${localeDisplayName} (${locale})`;
          dropdown.addOption(locale, label);
        });

        const savedLocale =
          this.plugin.settings.selectedLocale || DEFAULT_LOCALE;

        dropdown.setValue(savedLocale);

        dropdown.onChange((value) => {
          this.plugin.settings.selectedLocale = value;
          this.plugin.saveData(this.plugin.settings);
        });
      });

    new Setting(containerEl)
      .setName("OpenAI API key")
      .setDesc("(optional) For generating timelines with AI")
      .addText((text) =>
        text
          .setPlaceholder("Enter your OpenAI API Key")
          .setValue(
            this.plugin.settings.key
              ? decrypt(this.plugin.settings.key, PEPPER)
              : ""
          )
          .onChange(async (value) => {
            if (!value.trim()) {
              this.plugin.settings.key = "";
            } else {
              this.plugin.settings.key = encrypt(value.trim(), PEPPER);
            }
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setName("Cheatsheet").setHeading();

    const textarea = containerEl.createEl("textarea", {
      cls: "chronos-settings-md-container",
      text: cheatsheet,
    });

    textarea.readOnly = true;

    new Setting(containerEl).addButton((btn) => {
      btn
        .setButtonText("Copy cheatsheet")
        .setCta()
        .onClick(async () => {
          try {
            await navigator.clipboard.writeText(cheatsheet);
            new Notice(
              "Cheatsheet copied to clipboard!\nPaste it in a new Obsidian note to learn Chronos syntax"
            );
          } catch (err) {
            console.error("Failed to copy cheatsheet:", err);
            new Notice("Failed to copy cheatsheet");
          }
        });
    });

    const link = document.createElement("a");
    link.textContent = "Learn more";
    link.href = "https://github.com/clairefro/obsidian-plugin-chronos";
    link.target = "_blank";
    link.style.textDecoration = "underline";

    containerEl.appendChild(link);
  }
}
