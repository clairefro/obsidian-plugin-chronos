/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Plugin,
  App,
  Setting,
  PluginSettingTab,
  Notice,
  Editor,
} from "obsidian";

import { ChronosPluginSettings } from "./types";

import { knownLocales } from "./util/knownLocales";
import {
  cheatsheet,
  templateAdvanced,
  templateBasic,
  templateBlank,
} from "./util/snippets";
import { DEFAULT_LOCALE } from "./constants";
import { ChronosTimeline } from "./lib/ChronosTimeline";

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

    containerEl.createEl("h2", { text: "Cheatsheet" });

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
