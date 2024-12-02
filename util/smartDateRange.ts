import { isRtl } from "./knownLocales";
import { toUTCDate } from "./utcUtil";

function _formatYearByLocale(date: Date, locale: string) {
  switch (locale) {
    case "en":
      return `${date.getUTCFullYear()}`;
    case "ja":
    case "zh":
      // Japanese and Chinese: YYYY年
      return `${date.getUTCFullYear()}年`;
    case "ko":
      // Korean: YYYY년
      return `${date.getUTCFullYear()}년`;
    case "ru":
      // Russian: YYYY г.
      return `${date.getUTCDate()} г.`;
    default:
      // Rest of the LTR world: YYYY
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
  locale: string
) {
  const start = toUTCDate(startStr);
  const end = endStr ? toUTCDate(endStr) : null;

  // Options to format month and day as per locale
  const monthOptions = { month: "short", timeZone: "UTC" };
  const fullDateOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  };

  // RTL strings need special hanlding in interpolation - check in order to manually override
  const localeIsRtl = isRtl(locale);

  const startMonth = start.toLocaleDateString(
    locale,
    monthOptions as Intl.DateTimeFormatOptions
  );

  // Check if start and end dates are the same day
  if (
    end &&
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCDate() === end.getUTCDate()
  ) {
    // Format as "Feb 2, 2024" (single date)
    if (localeIsRtl) {
      // LTR overrides to force interpolated order
      return `${start.getUTCDate()} \u200E${startMonth} \u200E${start.getUTCFullYear()}`;
    } else {
      return start.toLocaleDateString(
        locale,
        fullDateOptions as Intl.DateTimeFormatOptions
      );
    }
  }

  if (
    end &&
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth()
  ) {
    // Start and end dates are within the same month and year
    // Format as concisely as possible, exL "Feb 2 - 3, 2024", in the specified locale
    // Handle specially by locale for date ranges within same month
    if (localeIsRtl) {
      // DD-DD MMM YYYY
      // LTR overrides to force interpolated order for RTL strings
      return `${start.getUTCDate()}-${end.getUTCDate()} \u200E${startMonth} \u200E${start.getUTCFullYear()}`;
    } else {
      switch (locale) {
        case "en":
          return `${startMonth} ${start.getUTCDate()}-${end.getUTCDate()}, ${start.getUTCFullYear()}`;
        case "ja":
        case "zh":
          // Japanese and Chinese: YYYY年MM月DD~DD日
          return `${_formatYearByLocale(
            start,
            locale
          )}${startMonth}${start.getUTCDate()}~${end.getUTCDate()}日`;
        case "ko":
          // Korean: YYYY년 MM월 DD~DD일
          return `${_formatYearByLocale(
            start,
            locale
          )}년${" "}${startMonth}${start.getUTCDate()}~${end.getUTCDate()}일`;
        case "ru":
          return `${start.getUTCDate()}-${end.getUTCDate()} ${startMonth} ${_formatYearByLocale(
            start,
            locale
          )}`;
        default:
          // Rest of the LTR world: DD-DD MMM YYYY
          return `${start.getUTCDate()}-${end.getUTCDate()} ${startMonth} ${start.getUTCFullYear()}`;
      }
    }
  } else if (end) {
    const endMonth = end.toLocaleDateString(
      locale,
      monthOptions as Intl.DateTimeFormatOptions
    );
    // Different month and year case
    if (localeIsRtl) {
      // RTL: LTR overrides to force interpolated order for RTL strings
      if (_rangeJustShowYear(start, end)) {
        return `\u200E${start.getUTCFullYear()} - \u200E${end.getUTCFullYear()}`;
      } else {
        return `${start.getUTCDate()} \u200E${startMonth} \u200E${start.getUTCFullYear()} - ${end.getUTCDate()} \u200E${endMonth} \u200E${end.getUTCFullYear()}`;
      }
    } else {
      // LTR
      if (_rangeJustShowYear(start, end)) {
        return `${_formatYearByLocale(start, locale)} - ${_formatYearByLocale(
          end,
          locale
        )}`;
      }
      return `${start.toLocaleDateString(
        locale,
        fullDateOptions as Intl.DateTimeFormatOptions
      )} - ${end.toLocaleDateString(
        locale,
        fullDateOptions as Intl.DateTimeFormatOptions
      )}`;
    }
  } else {
    // If it's Jan 1st without time, just return the year
    if (_justShowYear(start)) {
      return _formatYearByLocale(start, locale);
    }
    // Single date without an end date
    if (localeIsRtl) {
      // LTR overrides to force interpolated order for RTL strings
      return `${start.getUTCDate()} \u200E${startMonth} \u200E${start.getUTCFullYear()}`;
    }
    return start.toLocaleDateString(
      locale,
      fullDateOptions as Intl.DateTimeFormatOptions
    );
  }
}
