import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from "obsidian";

export class ChronosEditorSuggest extends EditorSuggest<string> {
    inlineChronos : Map<string,Set<string>>;

    constructor(
        app: App,
        inlineChronos: Map<string,Set<string>>
    ) {
        super(app);
        this.inlineChronos = inlineChronos;
    }

    private _getSuggestionSet(): Set<string> {
        return new Set(
        Array.from(this.inlineChronos.values())
            .flatMap(set => Array.from(set))
        )
    }

    onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
        const line = editor.getLine(cursor.line);
		const beforeCursor = line.slice(cursor.ch - 8, cursor.ch);

        
		const match = /`chronos/.exec(beforeCursor);
		if (!match) return null;
        
		return {
			start: {
				line: cursor.line,
				ch: cursor.ch - 8,
			},
			end: cursor,
			query: "`chronos",
		};
    }

    getSuggestions(context: EditorSuggestContext): string[] | Promise<string[]> {
        return [...this._getSuggestionSet()];
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        const type = (value[0] == '*') ? "Point" : (value[0] == '@' ? "Period" : "Event");
        const body = (value[0] == '[' ? value : value.slice(2));

        el.createEl("div").innerHTML = `<div>${body}</br><small>${type}</small></div>`
    }

    selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
        if(!this.context) return;

        const editor: Editor = this.context.editor;
        editor.replaceRange(`\`chronos ${value}`, this.context.start, this.context.end)
    }
}
