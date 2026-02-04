import {
	BasesView,
	BasesQueryResult,
	QueryController,
	BasesEntry,
} from "obsidian";

export class ChronosTimelineBasesView extends BasesView {
	// This unique ID is what appears in the "Add View" menu
	static VIEW_TYPE = "chronos-timeline-bases-view";
	type: string = ChronosTimelineBasesView.VIEW_TYPE;
	private containerEl: HTMLElement;

	constructor(controller: QueryController, parentEl: HTMLElement) {
		super(controller);
		this.containerEl = parentEl.createDiv("bases-example-view-container");
	}

	public onDataUpdated(): void {
		console.log("[CHRONOS BASES] updated");

		const order = this.config.getOrder();

		const result: BasesQueryResult = this.data;
		if (!result || !result.data) return;

		// 1. Get the list of property IDs the user has configured for this Base
		const propertyIds = result.properties;
		console.log({ propertyIds });
		console.log(this.data.groupedData);

		// the Base filters. For list view, each entry is a separate line.

		// // 2. Map the data
		// const timelineEvents = result.data.map((entry: BasesEntry) => {
		// 	// entry.file contains the TFile info
		// 	// entry.values is a Record<BasesPropertyId, any>

		// 	return {
		// 		title: entry.file.name,
		// 		// We search the values object for keys that match our target names
		// 		start: this.data.getValueByPropertyName(entry, "startDate"),
		// 		end: this.getValueByPropertyName(entry, "endDate"),
		// 		path: entry.file.path,
		// 	};
		// });

		this.containerEl.empty();
		this.containerEl.createDiv({ text: "Hello World" });
	}

	// // Optionally, keep the async version for custom usage
	// async onDataUpdatedAsync(data: BasesQueryResult) {
	// 	this.renderTimeline(data);
	// }
	// renderTimeline(data: BasesQueryResult) {
	// 	// Use the correct container for BasesView
	// 	const container =
	// 		(this as any).container ??
	// 		(this as any).containerEl ??
	// 		(this as any).contentEl;
	// 	if (!container) {
	// 		console.warn(
	// 			"No container element found for ChronosTimelineBasesView",
	// 		);
	// 		return;
	// 	}
	// 	container.empty();

	// 	// Use the correct data array from BasesQueryResult
	// 	const entries: any[] = (data as any).data ?? [];
	// 	console.log({ data });
	// 	console.log({ entries });

	// 	// Map the Base rows to your Chronos format
	// 	// const events = data.rows.map((row) => ({
	// 	// 	title: row.file.name,
	// 	// 	date: row.values["date-property-id"], // Access the specific column
	// 	// 	link: row.file.path,
	// 	// }));

	// 	// Call your existing Chronos rendering logic here
	// 	// new ChronosRenderer(container, events).init();
	// }
}
