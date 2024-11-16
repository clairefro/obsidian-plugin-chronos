/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Plugin,
  App,
  Setting,
  setTooltip,
  PluginSettingTab,
  Notice,
} from "obsidian";
import { DataSet, Timeline } from "vis-timeline/standalone";

import { ChronosMdParser } from "./lib/ChronosMdParser";
import { Marker, Group, ChronosPluginSettings } from "./types";

import crosshairsSvg from "./assets/icons/crosshairs.svg";
import { smartDateRange } from "./util/smartDateRange";
import { knownLocales } from "./util/knownLocales";
import { enDatestrToISO } from "./util/enDateStrToISO";
import { cheatsheet } from "./util/cheatsheet";

const DEFAULT_SETTINGS: ChronosPluginSettings = {
  selectedLocale: "en",
};

export default class ChronosPlugin extends Plugin {
  settings: ChronosPluginSettings;

  async onload() {
    console.log("Loading Chronos Timeline Plugin...");

    // load settings
    this.settings = (await this.loadData()) || DEFAULT_SETTINGS;
    this.addSettingTab(new ChronosPluginSettingTab(this.app, this));

    // register markdown processor
    this.registerMarkdownCodeBlockProcessor(
      "chronos",
      this.renderChronosBlock.bind(this)
    );
  }

  onunload() {
    // Uncomment for debugging in development
    // console.log("Unloading Chronos Timeline Plugin...");
  }

  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private renderChronosBlock(source: string, el: HTMLElement) {
    const parser = new ChronosMdParser();
    const container = el.createEl("div", { cls: "chronos-timeline-container" });

    try {
      const { items, markers, groups } = parser.parse(source);

      if (!el.dataset.initialized) {
        this.initializeTimeline(container, items, markers, groups);
        el.dataset.initialized = "true";
      }
    } catch (error) {
      this.handleParseError(error, container);
    }
  }

  private initializeTimeline(
    container: HTMLElement,
    items: any[],
    markers: Marker[],
    groups: Group[]
  ) {
    const options = this.getTimelineOptions();
    const timeline = this.createTimeline(container, items, groups, options);

    this.addMarkers(timeline, markers);
    this.setupTooltip(timeline, items);
    this.createRefitButton(container, timeline);
    if (groups.length) {
      // weird workaround for properly renering timelines with groups
      setTimeout(() => this.zoomOutMinimally(timeline), 150);
    }
    // make sure all items in view by default
    setTimeout(() => timeline.fit(), 100);
    return timeline;
  }

  private getTimelineOptions() {
    return {
      zoomable: true,
      selectable: true,
      minHeight: "200px",
    };
  }

  private createTimeline(
    container: HTMLElement,
    items: any[],
    groups: Group[],
    options: any
  ) {
    let timeline: Timeline;
    if (groups.length) {
      const { updatedItems, updatedGroups } = this.assignItemsToGroups(
        items,
        groups
      );
      timeline = new Timeline(
        container,
        updatedItems,
        this.createDataGroups(updatedGroups),
        options
      );
    } else {
      timeline = new Timeline(container, items, options);
    }
    // workaround for overriding native titles in custom markers
    setTimeout(() => this._updateTooltipCustomMarkers(container), 100);

    return timeline;
  }

  private addMarkers(timeline: Timeline, markers: Marker[]) {
    markers.forEach((marker, index) => {
      const id = `marker_${index}`;
      timeline.addCustomTime(new Date(marker.start), id);
      timeline.setCustomTimeMarker(marker.content, id, true);
    });
  }

  private _updateTooltipCustomMarkers(timelineContainer: HTMLElement) {
    const customTimeMarkers =
      timelineContainer.querySelectorAll(".vis-custom-time");
    customTimeMarkers.forEach((m) => {
      const titleText = m.getAttribute("title");

      if (titleText) {
        const date = smartDateRange(
          enDatestrToISO(titleText),
          null,
          this.settings.selectedLocale
        );
        setTooltip(m as HTMLElement, date);
        // custom markers have some kind of hammer function going that updates the tick. I want to listen for and kill native title change every tick
        const observer = new MutationObserver((mutationsList, observer) => {
          for (const mutation of mutationsList) {
            // Check if the 'title' attribute was changed
            if (
              mutation.type === "attributes" &&
              mutation.attributeName === "title"
            ) {
              // Remove the 'title' attribute
              m.removeAttribute("title");
            }
          }
        });

        observer.observe(m, {
          attributes: true,
        });
      }
    });
  }

  private createDataGroups(rawGroups: Group[]) {
    return new DataSet<Group>(
      rawGroups.map((g) => ({ id: g.id, content: g.content }))
    );
  }

  private setupTooltip(timeline: Timeline, items: any[]) {
    timeline.on("itemover", (event) => {
      const itemId = event.item;
      const item = new DataSet(items).get(itemId) as any;
      if (itemId) {
        const text = `${item?.content} (${smartDateRange(
          item.start,
          item.end,
          this.settings.selectedLocale
        )})${item?.cDescription ? " \n " + item?.cDescription : ""}`;
        setTooltip(event.event.target, text);
      }
    });
  }

  private createRefitButton(container: HTMLElement, timeline: Timeline) {
    const refitButton = container.createEl("button", {
      cls: "chronos-timeline-refit-button",
    });
    // normally would use .innerHTL for simple setting, but Obsidian plugin governance disallows use of inner/outerHTML
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(crosshairsSvg, "image/svg+xml");
    const svgElement = svgDoc.documentElement;

    refitButton.appendChild(document.importNode(svgElement, true));

    setTooltip(refitButton, "Fit all");
    refitButton.addEventListener("click", () => timeline.fit());
  }

  private assignItemsToGroups(items: any[], groups: Group[]) {
    let updatedItems = [...items];
    let updatedGroups = [...groups];

    // only add group properties if there are groups
    const DEFAULT_GROUP_ID = 0;
    if (groups.length > 0) {
      if (!groups.some((group) => group.id === DEFAULT_GROUP_ID)) {
        groups.push({ id: DEFAULT_GROUP_ID, content: " " });
      }

      // assign ungrouped items to the default group
      updatedItems = items.map((item) => {
        if (!item.group) {
          item.group = DEFAULT_GROUP_ID;
        }
        return item;
      });

      updatedGroups = groups;
    }

    return { updatedItems, updatedGroups };
  }

  private zoomOutMinimally(timeline: Timeline) {
    const range = timeline.getWindow();
    const zoomFactor = 1.02; // SLIGHT zoom out
    const newStart = new Date(
      range.start.valueOf() -
        ((range.end.valueOf() - range.start.valueOf()) * (zoomFactor - 1)) / 2
    );
    const newEnd = new Date(
      range.end.valueOf() +
        ((range.end.valueOf() - range.start.valueOf()) * (zoomFactor - 1)) / 2
    );

    timeline.setWindow(newStart, newEnd, { animation: true });
  }

  private handleParseError(error: Error, container: HTMLElement) {
    const errorMsgContainer = container.createEl("div", {
      cls: "chronos-error-message-container",
    });

    errorMsgContainer.innerText = this.formatErrorMessages(error);
  }

  private formatErrorMessages(error: Error): string {
    let text = "Error(s) parsing chronos markdown. Hover to edit: \n\n";
    text += error.message
      .split(";;")
      .map((msg) => `  - ${msg}`)
      .join("\n\n");

    return text;
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

    containerEl.createEl("h2", { text: "Preferred Locale" });

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
      .setName("Select Locale")
      .setDesc("Choose a locale for date formatting when hovering on events")
      .addDropdown((dropdown) => {
        supportedLocales.forEach((locale, i) => {
          const localeDisplayName = supportedLocalesNativeDisplayNames[i];
          const label = `${localeDisplayName} (${locale})`;
          dropdown.addOption(locale, label);
        });

        const savedLocale =
          this.plugin.settings.selectedLocale || supportedLocales[0];
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
    textarea.style.width = "100%";
    textarea.style.height = "200px";
    textarea.style.overflow = "auto";

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
  }
}
