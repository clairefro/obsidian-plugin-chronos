import { Timeline, TimelineOptions } from "vis-timeline";
import { DataSet } from "vis-timeline/standalone";
import crosshairsSvg from "./assets/icons/crosshairs.svg";
import {
	Marker,
	Group,
	ChronosPluginSettings,
	ChronosTimelineConstructor,
	ChronosDataItem,
	ChronosDataSetDataItem,
} from "./types";
import { enDateStrToISO } from "./enDateStrToISO";
import { smartDateRange } from "./smartDateRange";
import { ChronosMdParser } from "./ChronosMdParser";
import { orderFunctionBuilder } from "./flags";
import { chronosMoment } from "./chronosMoment";

const MS_UNTIL_REFIT = 100;

function setTooltipFallback(el: Element, text: string) {
	// simple tooltip fallback using title attribute for portability
	(el as HTMLElement).setAttribute("title", text);
}

export class ChronosTimeline {
	private container: HTMLElement;
	private settings: ChronosPluginSettings;
	private parser: ChronosMdParser;
	private callbacks:
		| {
				onItemClick?: (item: any, event: Event) => void;
				onTimelineClick?: (event: Event) => void;
				onItemDoubleClick?: (item: any, event: Event) => void;
		  }
		| undefined;
	private cssRootClass: string | undefined;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private eventHandlers: { [key: string]: (event: any) => void } = {};
	items: ChronosDataItem[] | undefined;
	timeline: Timeline | undefined;

	constructor({
		container,
		settings,
		callbacks,
		cssRootClass,
	}: ChronosTimelineConstructor) {
		this.container = container;
		this.settings = settings;
		this.parser = new ChronosMdParser(this.settings.selectedLocale);
		this.callbacks = callbacks;
		this.cssRootClass = cssRootClass;
		// cssRootClass will be applied after render to the visible container element
	}

	render(source: string) {
		try {
			const { items, markers, groups, flags } = this.parser.parse(
				source,
				this.settings,
			);
			this._renderFromResult({ items, markers, groups, flags });
		} catch (error) {
			this._handleParseError(error as Error);
		}
	}

	renderParsed(result: {
		items: ChronosDataItem[];
		markers: Marker[];
		groups: Group[];
		flags: any;
	}) {
		this._renderFromResult(result);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	on(eventType: string, handler: (event: any) => void) {
		this.eventHandlers[eventType] = handler;
		if (this.timeline) {
			this._setupEventHandlers(this.timeline);
		}
	}

	private _setupEventHandlers(timeline: Timeline) {
		Object.keys(this.eventHandlers).forEach((eventType) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			timeline.on(eventType, (event: any) => {
				this.eventHandlers[eventType](event);
			});
		});
	}

	private _getTimelineOptions(): TimelineOptions {
		return {
			zoomMax: 2.997972e14,
			zoomable: true,
			selectable: true,
			minHeight: "200px",
			align: this.settings.align,
			moment: (date: Date) => chronosMoment(date, this.settings),
		};
	}

	private _renderFromResult({
		items,
		markers,
		groups,
		flags,
	}: {
		items: ChronosDataItem[];
		markers: Marker[];
		groups: Group[];
		flags: any;
	}) {
		const options = this._getTimelineOptions();

		if (flags?.orderBy) {
			options.order = orderFunctionBuilder(flags);
		}

		const hasDefaultViewFlag =
			flags?.defaultView?.start && flags?.defaultView?.end;

		if (hasDefaultViewFlag) {
			options.start = flags?.defaultView?.start;
			options.end = flags?.defaultView?.end;
		}

		if (flags?.noToday) {
			options.showCurrentTime = false;
		}
		if (flags?.height) {
			options.height = `${flags.height}px`;
			options.verticalScroll = true;
		}

		// Apply cssRootClass to the visible container element if provided
		if (this.cssRootClass) {
			const containerEl = this.container.querySelector(
				".chronos-timeline-container",
			) as HTMLElement | null;
			if (containerEl) {
				containerEl.classList.add(this.cssRootClass);
			} else {
				// fallback: add to container itself
				this.container.classList.add(this.cssRootClass);
			}
		}

		const timeline = this._createTimeline(items, groups, options);
		this._addMarkers(timeline, markers);
		this._setupTooltip(timeline, items);
		this._createRefitButton(timeline);
		this._handleZoomWorkaround(timeline, groups);

		// Attach host callbacks if provided
		if (this.callbacks) {
			if (this.callbacks.onTimelineClick) {
				this.container.addEventListener("click", (e) =>
					this.callbacks!.onTimelineClick!(e),
				);
			}
			if (this.callbacks.onItemClick) {
				timeline.on("click", (props: any) => {
					const ds = new DataSet(this.items ?? []);
					const item = ds.get(props.item);
					this.callbacks!.onItemClick!(item, props.event);
				});
			}
			if (this.callbacks.onItemDoubleClick) {
				timeline.on("doubleClick", (props: any) => {
					const ds = new DataSet(this.items ?? []);
					const item = ds.get(props.item);
					this.callbacks!.onItemDoubleClick!(item, props.event);
				});
			}
		}

		this.timeline = timeline;

		!hasDefaultViewFlag && setTimeout(() => timeline.fit(), MS_UNTIL_REFIT);
	}

	private _handleParseError(error: Error) {
		const errorMsgContainer = document.createElement("div");
		errorMsgContainer.className = "chronos-error-message-container";
		errorMsgContainer.innerText = this._formatErrorMessages(error);
		this.container.appendChild(errorMsgContainer);
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
		options: TimelineOptions,
	): Timeline {
		let timeline: Timeline;
		if (groups.length) {
			const { updatedItems, updatedGroups } = this.assignItemsToGroups(
				items,
				groups,
			);
			this.items = updatedItems;
			timeline = new Timeline(
				this.container,
				updatedItems,
				this._createDataGroups(updatedGroups),
				options,
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
			// vis-timeline supports custom marker labels in some builds; fallback to title set later
			try {
				// @ts-ignore
				timeline.setCustomTimeMarker(marker.content, id, true);
			} catch (e) {
				// ignore if method missing in bundled timeline
			}
		});
	}

	private _setupTooltip(timeline: Timeline, items: ChronosDataItem[]) {
		timeline.on("itemover", (event) => {
			const item = new DataSet(items).get(
				event.item,
			) as unknown as ChronosDataSetDataItem;
			if (item) {
				const text = `${item.content} (${smartDateRange(item.start.toISOString(), item.end?.toISOString() ?? null, this.settings.selectedLocale)})${item.cDescription ? " \n " + item.cDescription : ""}`;
				setTooltipFallback(event.event.target, text);
			}
		});
	}

	private _createRefitButton(timeline: Timeline) {
		const refitButton = document.createElement("button");
		refitButton.className = "chronos-timeline-refit-button";

		const parser = new DOMParser();
		const svgDoc = parser.parseFromString(crosshairsSvg, "image/svg+xml");
		const svgElement = svgDoc.documentElement;

		refitButton.appendChild(document.importNode(svgElement, true));
		setTooltipFallback(refitButton, "Fit all");
		refitButton.addEventListener("click", () => timeline.fit());

		this.container.appendChild(refitButton);
	}

	private _updateTooltipCustomMarkers() {
		const customTimeMarkers =
			this.container.querySelectorAll(".vis-custom-time");
		customTimeMarkers.forEach((m) => {
			const titleText = m.getAttribute("title");
			if (titleText) {
				let text = titleText;
				if (this.settings.selectedLocale === "en") {
					const enDateISO = enDateStrToISO(titleText);
					text = smartDateRange(
						enDateISO,
						null,
						this.settings.selectedLocale,
					);
				} else {
					text = titleText
						.replace(", 0:00:00", "")
						.replace(/^.*?:/, "")
						.trim();
				}
				setTooltipFallback(m as HTMLElement, text);

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
			rawGroups.map((g) => ({ id: g.id, content: g.content })),
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
				((range.end.valueOf() - range.start.valueOf()) *
					(zoomFactor - 1)) /
					2,
		);
		const newEnd = new Date(
			range.end.valueOf() +
				((range.end.valueOf() - range.start.valueOf()) *
					(zoomFactor - 1)) /
					2,
		);

		timeline.setWindow(newStart, newEnd, { animation: true });
		setTimeout(() => {
			timeline.setWindow(range.start, range.end, { animation: true });
		}, 200);
	}
}
