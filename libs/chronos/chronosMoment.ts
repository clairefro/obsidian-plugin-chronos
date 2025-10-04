import { ChronosPluginSettings } from "./types";
import { moment } from "vis-timeline/standalone";

const chronosMomentInstance = (moment as any).clone?.() || moment;

export function chronosMoment(date: Date, settings: ChronosPluginSettings) {
	const m = chronosMomentInstance(date).locale(settings.selectedLocale);
	return settings.useUtc ? m.utc() : m;
}
