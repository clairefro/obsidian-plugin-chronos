import {
  ParseResult,
  Marker,
  ChronosDataItem,
  Group,
  ConstructItemParams,
} from "../types";
import { Color, Opacity } from "../enums";

export class ChronosMdParser {
  private errors: string[] = [];
  private items: ChronosDataItem[] = [];
  private markers: Marker[] = [];
  private groups: Group[] = [];
  private groupMap: { [key: string]: number } = {};

  parse(data: string): ParseResult {
    const lines = data.split("\n");
    this._resetVars();

    lines.forEach((line, i) => {
      line = line.trim();
      const lineNumber = i + 1;

      if (line.startsWith("#")) {
        // Comment (skip)
        return;
      } else if (line.startsWith("-")) {
        // Event
        this._parseEvent(line, lineNumber);
      } else if (line.startsWith("@")) {
        // Period
        this._parsePeriod(line, lineNumber);
      } else if (line.startsWith("=")) {
        // Marker
        this._parseMarker(line, lineNumber);
      } else if (line) {
        this._addParserError(lineNumber, `Unrecognized format: ${line}`);
      }
    });

    if (this.errors.length > 0) {
      throw new Error(this.errors.join(";;"));
    }

    const items = this.items;
    const markers = this.markers;
    const groups = this.groups;

    return { items, markers, groups };
  }

  private _parseTimeItem(line: string, lineNumber: number) {
    const itemTypeP = `[-@=]`;
    const dateP = `(-?\\d{1,}(-?(\\d{2})?-?(\\d{2})?T?(\\d{2})?:?(\\d{2})?:?(\\d{2})?)?)`;
    const optSp = `\\s*`;

    const separatorP = `([^-\\d\\s]*?)?`;
    const colorP = `(#(\\w+))?`;
    const groupP = `(\\{([^}]+)\\})?`;

    const contentP = `([^|]+)`;
    const descriptionP = `(\\|?\\s*(.*))?`;

    const re = new RegExp(
      `${itemTypeP}${optSp}\\[${optSp}${dateP}${optSp}${separatorP}${optSp}${dateP}?${optSp}\\]${optSp}${colorP}${optSp}${groupP}${optSp}${contentP}${optSp}${descriptionP}$`
    );

    const match = line.match(re);

    if (!match) {
      this._addParserError(lineNumber, `Invalid format: ${line}`);
      return null;
    } else {
      const [
        ,
        start,
        ,
        ,
        ,
        ,
        ,
        ,
        separator,
        end,
        ,
        ,
        ,
        ,
        ,
        ,
        ,
        color,
        ,
        groupName,
        content,
        ,
        description,
      ] = match;

      return {
        start,
        separator,
        end,
        color,
        groupName,
        content,
        description,
      };
    }
  }

  // Helper to construct item object with common properties
  private _constructItem({
    content,
    start,
    separator,
    end,
    groupName,
    color,
    lineNumber,
    type = "default",
  }: ConstructItemParams) {
    this._validateDates(start, end, separator, lineNumber);

    const groupId = groupName ? this._getOrCreateGroupId(groupName) : null;
    return {
      content: content || "",
      start: this._parseDate(start),
      end:
        end && new Date(start) !== new Date(end)
          ? this._parseDate(end)
          : undefined,
      group: groupId,
      style: color
        ? `background-color: ${this._mapToObsidianColor(
            color as Color,
            type === "background" ? Opacity.Opaque : Opacity.Solid
          )};`
        : undefined,
      ...(type === "background" ? { type: "background" } : {}),
    };
  }

  // Refactored _parseEvent method
  private _parseEvent(line: string, lineNumber: number) {
    const components = this._parseTimeItem(line, lineNumber);

    if (components) {
      const { start, separator, end, color, groupName, content, description } =
        components;

      this.items.push({
        ...this._constructItem({
          content,
          start,
          separator,
          end,
          groupName,
          color,
          lineNumber,
          type: "default",
        }),
        cDescription: description || undefined,
      });
    }
  }

  private _parsePeriod(line: string, lineNumber: number) {
    const components = this._parseTimeItem(line, lineNumber);

    if (components) {
      const { start, separator, end, color, groupName, content, description } =
        components;
      this.items.push(
        this._constructItem({
          content: description ? content + " | " + description : content,
          start,
          separator,
          end,
          groupName,
          color,
          lineNumber,
          type: "background",
        })
      );
    }
  }

  private _parseMarker(line: string, lineNumber: number) {
    const markerMatch = line.match(/^=\s*\[(.*?)]\s*(.*)?$/);

    if (markerMatch) {
      const [, start, content] = markerMatch;

      this.markers.push({
        start: this._parseDate(start).toISOString(),
        content: content || "",
      });
    } else {
      this._addParserError(lineNumber, `Invalid marker format: ${line}`);
    }
  }

  private _getOrCreateGroupId(groupName: string): number {
    if (this.groupMap[groupName] !== undefined) {
      return this.groupMap[groupName];
    } else {
      const groupId = this.groups.length + 1;
      this.groups.push({ id: groupId, content: groupName });
      this.groupMap[groupName] = groupId;
      return groupId;
    }
  }

  private _mapToObsidianColor(color: Color, opacity: Opacity) {
    const colorMap = {
      red: "red",
      green: "green",
      blue: "blue",
      yellow: "yellow",
      orange: "orange",
      purple: "purple",
      pink: "pink",
      cyan: "cyan",
    };

    if (!colorMap[color]) {
      console.warn(`Color "${color}" not recognized.`);
      return undefined;
    }

    return opacity === "solid"
      ? `var(--color-${colorMap[color]})`
      : `rgba(var(--color-${colorMap[color]}-rgb), var(--chronos-opacity))`;
  }

  private _parseDate(dateString: string): Date {
    // Handle "lazy dates" and BCE
    const isBCE = dateString.startsWith("-");

    const parts = dateString.replace(/^-/, "").split(/[-T: ]/);

    const [
      year,
      month = "01",
      day = "01",
      hour = "00",
      minute = "00",
      second = "00",
    ] = parts;

    if (!year) {
      throw new Error(`Invalid date format: ${dateString}`);
    }
    // TODO : add detailed error messages for other date components

    const formattedYear = isBCE ? -parseInt(year, 10) : parseInt(year, 10);

    // Return a Date object based on the parsed components
    return new Date(
      formattedYear,
      parseInt(month, 10) - 1, // month is 0-based in JS
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
      parseInt(second, 10)
    );
  }

  private _ensureChronologicalDates(
    start: string,
    end: string | undefined,
    lineNumber: number
  ) {
    if (start && end) {
      const startDate = this._parseDate(start);
      const endDate = this._parseDate(end);
      if (startDate > endDate) {
        this._addParserError(
          lineNumber,
          `Start date (${start}) is after end date (${end}).`
        );
      }
    }
  }

  private _ensureValidDates(
    start: string,
    end: string | undefined,
    lineNumber: number
  ) {
    if (!this._isValidDate(start)) {
      const msg = `Invalid date: ${start}. To specify a date range, separate dates with a tilde (~)`;
      this._addParserError(lineNumber, msg);
    }
    if (end && !this._isValidDate(end)) {
      const msg = `Invalid date: ${end}`;
      this._addParserError(lineNumber, msg);
    }
  }

  private _ensureCorrectDateSeparator(
    separator: string,
    lineNumber: number
  ): void {
    if (separator !== "~") {
      const msg = `Invalid date separator "${separator}". Dates in a range must be separated by a tilde (~).`;
      this._addParserError(lineNumber, msg);
    }
  }

  private _isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    try {
      return !isNaN(date.getTime());
    } catch (e) {
      return false;
    }
  }

  private _validateDates(
    start: string,
    end: string | undefined,
    separator: string | undefined,
    lineNumber: number
  ) {
    this._ensureValidDates(start, end, lineNumber);
    separator && this._ensureCorrectDateSeparator(separator, lineNumber);
    this._ensureChronologicalDates(start, end, lineNumber);
  }

  private _addParserError(lineNumber: number, message: string) {
    this.errors.push(`Line ${lineNumber + 1}: ${message}`);
  }

  private _clearErrors() {
    this.errors = [];
  }

  private _clearItems() {
    this.items = [];
  }

  private _clearMarkers() {
    this.markers = [];
  }

  private _clearGroups() {
    this.groups = [];
  }

  private _resetVars() {
    this._clearErrors();
    this._clearItems();
    this._clearMarkers();
    this._clearGroups();
  }
}
