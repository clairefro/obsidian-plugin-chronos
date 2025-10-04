import { isRtl } from "./knownLocales";
import { toUTCDate } from "./utcUtil";

function _formatYearByLocale(date: Date, locale: string) {
	switch (locale) {
		case "en":
			return `${date.getUTCFullYear()}`;
		case "ja":
		case "zh":
		case "zh-cn":
		case "zh-tw":
			return `${date.getUTCFullYear()}年`;
		case "ko":
			return `${date.getUTCFullYear()}년`;
		case "ru":
			return `${date.getUTCDate()} г.`;
		default:
			return `${date.getUTCFullYear()}`;
	}
}

function _justShowYear(date: Date) {
	return (
		date.getUTCMonth() === 0 &&
		date.getUTCDate() === 1 &&
		date.getUTCHours() === 0 &&
		date.getUTCMinutes() === 0 &&
		date.getUTCSeconds() === 0
	);
}

function _rangeJustShowYear(startDate: Date, endDate: Date) {
	return _justShowYear(startDate) && _justShowYear(endDate);
}

export function smartDateRange(
	startStr: string,
	endStr: string | null = null,
	locale: string,
) {
	const start = toUTCDate(startStr);
	const end = endStr ? toUTCDate(endStr) : null;

	const monthOptions = { month: "short", timeZone: "UTC" };
	const fullDateOptions = {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	};

	const localeIsRtl = isRtl(locale);

	const startMonth = start.toLocaleDateString(
		locale,
		monthOptions as Intl.DateTimeFormatOptions,
	);

	if (
		end &&
		start.getUTCFullYear() === end.getUTCFullYear() &&
		start.getUTCMonth() === end.getUTCMonth() &&
		start.getUTCDate() === end.getUTCDate()
	) {
		if (localeIsRtl) {
			return `${start.getUTCDate()} \u200E${startMonth} \u200E${start.getUTCFullYear()}`;
		} else {
			return start.toLocaleDateString(
				locale,
				fullDateOptions as Intl.DateTimeFormatOptions,
			);
		}
	}

	if (
		end &&
		start.getUTCFullYear() === end.getUTCFullYear() &&
		start.getUTCMonth() === end.getUTCMonth()
	) {
		if (localeIsRtl) {
			return `${start.getUTCDate()}-${end.getUTCDate()} \u200E${startMonth} \u200E${start.getUTCFullYear()}`;
		} else {
			switch (locale) {
				case "en":
					return `${startMonth} ${start.getUTCDate()}-${end.getUTCDate()}, ${start.getUTCFullYear()}`;
				case "ja":
				case "zh":
					return `${_formatYearByLocale(start, locale)}${startMonth}${start.getUTCDate()}~${end.getUTCDate()}日`;
				case "ko":
					return `${_formatYearByLocale(start, locale)}년${" "}${startMonth}${start.getUTCDate()}~${end.getUTCDate()}일`;
				case "ru":
					return `${start.getUTCDate()}-${end.getUTCDate()} ${startMonth} ${_formatYearByLocale(start, locale)}`;
				default:
					return `${start.getUTCDate()}-${end.getUTCDate()} ${startMonth} ${start.getUTCFullYear()}`;
			}
		}
	} else if (end) {
		const endMonth = end.toLocaleDateString(
			locale,
			monthOptions as Intl.DateTimeFormatOptions,
		);
		if (localeIsRtl) {
			if (_rangeJustShowYear(start, end)) {
				return `\u200E${start.getUTCFullYear()} - \u200E${end.getUTCFullYear()}`;
			} else {
				return `${start.getUTCDate()} \u200E${startMonth} \u200E${start.getUTCFullYear()} - ${end.getUTCDate()} \u200E${endMonth} \u200E${end.getUTCFullYear()}`;
			}
		} else {
			if (_rangeJustShowYear(start, end)) {
				return `${_formatYearByLocale(start, locale)} - ${_formatYearByLocale(end, locale)}`;
			}
			return `${start.toLocaleDateString(locale, fullDateOptions as Intl.DateTimeFormatOptions)} - ${end.toLocaleDateString(locale, fullDateOptions as Intl.DateTimeFormatOptions)}`;
		}
	} else {
		if (_justShowYear(start)) {
			return _formatYearByLocale(start, locale);
		}
		if (localeIsRtl) {
			return `${start.getUTCDate()} \u200E${startMonth} \u200E${start.getUTCFullYear()}`;
		}
		return start.toLocaleDateString(
			locale,
			fullDateOptions as Intl.DateTimeFormatOptions,
		);
	}
}
