import { ChronosDataItem, Flags } from "types";
import { TimelineOptionsComparisonFunction } from "vis-timeline";
import moment from "moment";

export const orderFunctionBuilder: (flags: Flags) => TimelineOptionsComparisonFunction = (flags: Flags) => {
    return (a: ChronosDataItem, b: ChronosDataItem) => {
            
        if (!flags.orderBy) 
            return 0;

        for (let ordering of orderByFlagParser(flags.orderBy)) {
            let diff = 0

            

            switch(ordering.sortingField) {
                case "start":
                    diff = moment(b.start).diff(a.start);
                    break;
                case "end":
                    diff = moment(b.end).diff(a.end);
                    break;
                case "content":
                    diff = b.content.localeCompare(a.content);
                    break;
                case "style":
                    diff = b.style?.localeCompare(a.style ?? "") ?? 0;
                    break;
                case "description":
                    diff = b.cDescription?.localeCompare(a.cDescription ?? "") ?? 0;
                    break;
            }

            if (diff !== 0) {
                return ordering.sortingOrder * diff;
            }
        }

        return 0
    }
}

export const orderByFlagParser: (orderBy: string[]) => SortingOptions[] = (orderBy: string[]) => {
    return orderBy.map((field) => {
        field = field.trim();
        return {
            sortingField: field.startsWith("-") ? field.substring(1) : field,
            sortingOrder: field.startsWith("-") ? SortingOrder.DESC : SortingOrder.ASC
        }
    })
        
}

export enum SortingOrder {
    DESC = -1,
    ASC = 1,
}

export type SortingOptions = { sortingField: string; sortingOrder: SortingOrder }