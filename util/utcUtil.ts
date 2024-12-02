const isoRegex =
  /^(-?\d+)(?:-(\d{2}))?(?:-(\d{2}))?(?:T(\d{2}))?(?::(\d{2}))?(?::(\d{2}))?(?:\.(\d+))?(?:Z)?$/;

export function toPaddedISOZ(partialIsoStr: string): string {
  const defaults = {
    month: "01",
    day: "01",
    hour: "00",
    minute: "00",
    second: "00",
  };

  const match = partialIsoStr.match(isoRegex);

  if (!match) throw new Error("Invalid date format");

  const [
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _,
    year,
    month = defaults.month,
    day = defaults.day,
    hour = defaults.hour,
    minute = defaults.minute,
    second = defaults.second,
  ] = match;
  const adjustedYear =
    parseInt(year) < 0
      ? `-${Math.abs(parseInt(year)).toString().padStart(4, "0")}`
      : year.padStart(4, "0");
  return `${adjustedYear}-${month}-${day}T${hour}:${minute}:${second}Z`;
}

export function validateUTCDate(partialIsoStr: string): void {
  // Regular expression to parse ISO date components (handles BC years, single and two-digit years)
  const regex =
    /^(-?\d{1,})-(\d{2})-(\d{2})(T(\d{2}):(\d{2}):(\d{2})(Z|([+-]\d{2}:\d{2})))?$/;

  // Validate the date string against the regex
  const match = partialIsoStr.match(regex);
  if (!match) {
    throw new Error(`Invalid date format: ${partialIsoStr}`);
  }

  const [
    // eslint-disable-next-line
    _,
    year,
    month,
    day,
    // eslint-disable-next-line
    __,
    hour = "00",
    minute = "00",
    second = "00",
  ] = match;

  // Parse components
  const parsedYear = parseInt(year, 10);
  const parsedMonth = parseInt(month, 10) - 1; // Month is 0-based
  const parsedDay = parseInt(day, 10);
  const parsedHour = parseInt(hour, 10);
  const parsedMinute = parseInt(minute, 10);
  const parsedSecond = parseInt(second, 10);

  // General validation for month, day, hour, minute, second
  if (parsedMonth < 0 || parsedMonth > 11) {
    throw new Error(`Invalid month: ${month}. Must be between 01-12`);
  }

  if (parsedDay < 1 || parsedDay > 31) {
    throw new Error(`Invalid day: ${day}. Must be between 01-31`);
  }

  if (parsedHour < 0 || parsedHour > 23) {
    throw new Error(`Invalid hour: ${hour}. Must be between 00-23`);
  }

  if (parsedMinute < 0 || parsedMinute > 59) {
    throw new Error(`Invalid hour: ${minute}. Must be between 00-59`);
  }

  if (parsedSecond < 0 || parsedSecond > 59) {
    throw new Error(`Invalid second: ${minute}. Must be between 00-59`);
  }

  // Check for valid date by using Date.UTC and verifying the result
  const date = new Date(
    Date.UTC(
      parsedYear,
      parsedMonth,
      parsedDay,
      parsedHour,
      parsedMinute,
      parsedSecond
    )
  );

  // Return false if the date is invalid or doesn't match the components (capture errors like Feb 30)
  const isActualDate =
    // skip year validation
    date.getUTCMonth() === parsedMonth &&
    date.getUTCDate() === parsedDay &&
    date.getUTCHours() === parsedHour &&
    date.getUTCMinutes() === parsedMinute &&
    date.getUTCSeconds() === parsedSecond;

  if (!isActualDate) {
    throw new Error(
      `Invalid date: ${
        partialIsoStr.split("T")[0]
      }. Make sure you have correct month, day, etc.`
    );
  }
}

export function toUTCDate(partialIsoStr: string) {
  const padded = toPaddedISOZ(partialIsoStr);

  const match = padded.match(isoRegex);

  if (!match) throw new Error("Invalid date format");

  const [
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _,
    year,
    month,
    day,
    hour,
    minute,
    second,
  ] = match;

  const utcDate = new Date(
    Date.UTC(
      parseInt(year),
      parseInt(month) - 1, // JS 0-indexes months
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second)
    )
  );
  // stupid, but have to manually set year for years less than 3 digits, otherwise JS assumes 1900's
  // also stupid: JS considers 0 = 1 BC.
  utcDate.setUTCFullYear(parseInt(year));

  if (isNaN(utcDate as unknown as number)) throw new Error("Date is invalid");

  return utcDate;
}
