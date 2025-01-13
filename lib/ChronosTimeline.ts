import { setTooltip } from "obsidian";
import moment from "moment";
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
import { orderFunctionBuilder } from "./flags";

const MS_UNTIL_REFIT = 100;

export class ChronosTimeline {
  private container: HTMLElement;
  private settings: ChronosPluginSettings;
  private parser: ChronosMdParser;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private eventHandlers: { [key: string]: (event: any) => void } = {};
  items: ChronosDataItem[] | undefined;
  timeline: Timeline | undefined;

  constructor({ container, settings }: ChronosTimelineConstructor) {
    this.container = container;
    this.settings = settings;
    this.parser = new ChronosMdParser(this.settings.selectedLocale);
  }

  render(source: string) {
    try {
      const { items, markers, groups, flags } = this.parser.parse(source);

      const options = this._getTimelineOptions();

      // Handle flags
      if (flags?.orderBy) {
        options.order = orderFunctionBuilder(flags);
      }

      const hasDefaultViewFlag =
        flags?.defaultView?.start && flags?.defaultView?.end;

      if (hasDefaultViewFlag) {
        options.start = flags?.defaultView?.start;
        options.end = flags?.defaultView?.end;
      }

      const timeline = this._createTimeline(items, groups, options);
      this._addMarkers(timeline, markers);
      this._setupTooltip(timeline, items);
      this._createRefitButton(timeline);
      // for whatever reason, timelines with groups render wonky on first paint and can be remedied by zooming in an out...
      this._handleZoomWorkaround(timeline, groups);

      this.timeline = timeline;

      // Ensure all items are visible by default
      !hasDefaultViewFlag && setTimeout(() => timeline.fit(), MS_UNTIL_REFIT);
    } catch (error) {
      this._handleParseError(error);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(eventType: string, handler: (event: any) => void) {
    this.eventHandlers[eventType] = handler;
    if (this.timeline) {
      this._setupEventHandlers(this.timeline);
    }
  }

  private _setupEventHandlers(timeline: Timeline) {
    // Set up event listeners based on the registered handlers
    Object.keys(this.eventHandlers).forEach((eventType) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      timeline.on(eventType, (event: any) => {
        this.eventHandlers[eventType](event);
      });
    });
  }

  private _getTimelineOptions(): TimelineOptions {
    return {
      zoomable: true,
      selectable: true,
      minHeight: "200px",
      align: this.settings.align,
      locale: this.settings.selectedLocale,
      moment: (date: Date) => moment(date).utc(),
    };
  }

  private _handleParseError(error: Error) {
    const errorMsgContainer = this.container.createEl("div", {
      cls: "chronos-error-message-container",
    });
    errorMsgContainer.innerText = this._formatErrorMessages(error);
  }

  private _formatErrorMessages(error: Error): string {
    return `Error(s) parsing chronos markdown. Hover to edit: \n\n${error.message
      .split(";;")
      .map((msg) => `  - ${msg}`)
      .join("\n\n")}`;
  }

  private _createTimeline(
    items: ChronosDataItem[],
    groups: Group[] = [],
    options: TimelineOptions
  ): Timeline {
    let timeline: Timeline;
    if (groups.length) {
      const { updatedItems, updatedGroups } = this.assignItemsToGroups(
        items,
        groups
      );

      this.items = updatedItems;

      timeline = new Timeline(
        this.container,
        updatedItems,
        this._createDataGroups(updatedGroups),
        options
      );
    } else {
      timeline = new Timeline(this.container, items, options);
      this.items = items;
    }

    setTimeout(() => this._updateTooltipCustomMarkers(), MS_UNTIL_REFIT);
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
      const item = new DataSet(items).get(
        event.item
      ) as unknown as ChronosDataSetDataItem;
      if (item) {
        const text = `${item.content} (${smartDateRange(
          item.start.toISOString(),
          item.end?.toISOString() ?? null,
          this.settings.selectedLocale
        )})${item.cDescription ? " \n " + item.cDescription : ""}`;
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
        let text = titleText;
        if (this.settings.selectedLocale === "en") {
          const enDateISO = enDatestrToISO(titleText);
          text = smartDateRange(enDateISO, null, this.settings.selectedLocale);
        } else {
          text = titleText.replace(", 0:00:00", "").replace(/^.*?:/, "").trim();
        }
        setTooltip(m as HTMLElement, text);

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
    const updatedGroups = groups.length
      ? [...groups, { id: DEFAULT_GROUP_ID, content: " " }]
      : groups;

    updatedItems = items.map((item) => {
      if (groups.length && !item.group) item.group = DEFAULT_GROUP_ID;
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
      setTimeout(() => this._jiggleZoom(timeline), MS_UNTIL_REFIT + 50);
    }
  }

  private _jiggleZoom(timeline: Timeline) {
    const range = timeline.getWindow();
    const zoomFactor = 1.02;
    const newStart = new Date(
      range.start.valueOf() -
        ((range.end.valueOf() - range.start.valueOf()) * (zoomFactor - 1)) / 2
    );
    const newEnd = new Date(
      range.end.valueOf() +
        ((range.end.valueOf() - range.start.valueOf()) * (zoomFactor - 1)) / 2
    );

    // zoom out...
    timeline.setWindow(newStart, newEnd, { animation: true });
    // zoom back in
    setTimeout(() => {
      timeline.setWindow(range.start, range.end, { animation: true });
    }, 200);
  }
}
