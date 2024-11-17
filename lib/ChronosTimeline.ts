import { setTooltip } from "obsidian";
import { Timeline, TimelineOptions } from "vis-timeline";
import { DataSet } from "vis-timeline/standalone";
import crosshairsSvg from "../assets/icons/crosshairs.svg";
import {
  Marker,
  Group,
  ChronosPluginSettings,
  ChronosTimelineConstructor,
  ChronosDataItem,
  ChronosDataSetDataItem,
} from "../types";
import { enDatestrToISO } from "../util/enDateStrToISO";
import { smartDateRange } from "../util/smartDateRange";
import { ChronosMdParser } from "./ChronosMdParser";

const MS_UNTIL_REFIT = 100;

export class ChronosTimeline {
  private container: HTMLElement;
  private settings: ChronosPluginSettings;
  private parser: ChronosMdParser;

  constructor({ container, settings }: ChronosTimelineConstructor) {
    this.container = container;
    this.settings = settings;

    this.parser = new ChronosMdParser(this.settings.selectedLocale);
  }

  render(source: string) {
    try {
      const { items, markers, groups } = this.parser.parse(source);

      const options = this._getTimelineOptions();
      const timeline = this._createTimeline(items, groups, options);

      this._addMarkers(timeline, markers);
      this._setupTooltip(timeline, items);
      this._createRefitButton(timeline);
      this._handleZoomWorkaround(timeline, groups);

      // make sure all items in view by default
      setTimeout(() => timeline.fit(), MS_UNTIL_REFIT);
    } catch (error) {
      this._handleParseError(error, this.container);
    }
  }

  private _getTimelineOptions() {
    return {
      zoomable: true,
      selectable: true,
      minHeight: "200px",
    };
  }

  private _handleParseError(error: Error, container: HTMLElement) {
    const errorMsgContainer = container.createEl("div", {
      cls: "chronos-error-message-container",
    });

    errorMsgContainer.innerText = this._formatErrorMessages(error);
  }

  private _formatErrorMessages(error: Error): string {
    let text = "Error(s) parsing chronos markdown. Hover to edit: \n\n";
    text += error.message
      .split(";;")
      .map((msg) => `  - ${msg}`)
      .join("\n\n");

    return text;
  }

  private _createTimeline(
    items: ChronosDataItem[],
    groups: Group[] = [],
    options: TimelineOptions
  ) {
    let timeline: Timeline;
    if (groups.length) {
      const { updatedItems, updatedGroups } = this.assignItemsToGroups(
        items,
        groups
      );
      timeline = new Timeline(
        this.container,
        updatedItems,
        this._createDataGroups(updatedGroups),
        options
      );
    } else {
      timeline = new Timeline(this.container, items, options);
    }
    setTimeout(() => this._updateTooltipCustomMarkers(), 100);
    return timeline;
  }

  private _addMarkers(timeline: Timeline, markers: Marker[]) {
    markers.forEach((marker, index) => {
      const id = `marker_${index}`;
      timeline.addCustomTime(new Date(marker.start), id);
      timeline.setCustomTimeMarker(marker.content, id, true);
    });
  }

  private _setupTooltip(timeline: Timeline, items: ChronosDataItem[]) {
    timeline.on("itemover", (event) => {
      const itemId = event.item;
      const item = new DataSet(items).get(
        itemId
      ) as unknown as ChronosDataSetDataItem;
      if (item) {
        const text = `${item.content} (${smartDateRange(
          item.start.toISOString().split("T")[0],
          item.end?.toISOString().split("T")[0],
          this.settings.selectedLocale
        )})${item?.cDescription ? " \n " + item.cDescription : ""}`;
        setTooltip(event.event.target, text);
      }
    });
  }

  private _createRefitButton(timeline: Timeline) {
    const refitButton = this.container.createEl("button", {
      cls: "chronos-timeline-refit-button",
    });

    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(crosshairsSvg, "image/svg+xml");
    const svgElement = svgDoc.documentElement;

    refitButton.appendChild(document.importNode(svgElement, true));
    setTooltip(refitButton, "Fit all");
    refitButton.addEventListener("click", () => timeline.fit());
  }

  private _updateTooltipCustomMarkers() {
    const customTimeMarkers =
      this.container.querySelectorAll(".vis-custom-time");
    customTimeMarkers.forEach((m) => {
      const titleText = m.getAttribute("title");

      if (titleText) {
        const date = smartDateRange(
          enDatestrToISO(titleText),
          null,
          this.settings.selectedLocale
        );
        setTooltip(m as HTMLElement, date);
        const observer = new MutationObserver((mutationsList) => {
          for (const mutation of mutationsList) {
            if (
              mutation.type === "attributes" &&
              mutation.attributeName === "title"
            ) {
              m.removeAttribute("title");
            }
          }
        });
        observer.observe(m, { attributes: true });
      }
    });
  }

  private assignItemsToGroups(items: ChronosDataItem[], groups: Group[]) {
    const DEFAULT_GROUP_ID = 0;
    let updatedItems = [...items];
    const updatedGroups = [...groups];

    if (
      groups.length > 0 &&
      groups.some((group) => group.id === DEFAULT_GROUP_ID)
    ) {
      updatedGroups.push({ id: DEFAULT_GROUP_ID, content: " " });
    }

    updatedItems = items.map((item) => {
      if (!item.group) item.group = DEFAULT_GROUP_ID;
      return item;
    });

    return { updatedItems, updatedGroups };
  }

  private _createDataGroups(rawGroups: Group[]) {
    return new DataSet<Group>(
      rawGroups.map((g) => ({ id: g.id, content: g.content }))
    );
  }

  private _handleZoomWorkaround(timeline: Timeline, groups: Group[]) {
    if (groups.length) {
      setTimeout(
        () => this._zoomOutMinimally(timeline),
        MS_UNTIL_REFIT + 50 /* must come after*/
      );
    }
  }

  private _zoomOutMinimally(timeline: Timeline) {
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
}
