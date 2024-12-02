// shim
import { DataItem } from "vis-timeline";

export interface Marker {
  start: string;
  content: string;
}

interface ChronosDataItem extends DataItem {
  cDescription?: string; // prefixed c for chronos - special prop for event tooltips
}

export interface ChronosDataSetDataItem {
  content: string;
  start: Date;
  end: Date;
  cDescription?: string; // prefixed c for chronos - special prop for event tooltips
}

export interface ChronosPluginSettings {
  selectedLocale: string;
  key?: string;
}

export type Group = { id: number; content: string };

export interface ParseResult {
  items: ChronosDataItem[];
  markers: Marker[];
  groups: Group[];
}

interface ConstructItemParams {
  content: string;
  start: string;
  separator: string | undefined;
  end: string | undefined;
  groupName: string | undefined;
  color: string | undefined;
  lineNumber: number;
  type: "default" | "background" | "point";
}

interface ChronosTimelineConstructor {
  container: HTMLElement;
  settings: ChronosPluginSettings;
}

declare module "vis-timeline" {
  /** Add method override bc this method exists and is documented, but not registered in type definitions from library */
  interface Timeline {
    setCustomTimeMarker(content: string, id: string, show: boolean): void;
  }
}
