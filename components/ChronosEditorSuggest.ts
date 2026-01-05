import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from "obsidian";

export class ChronosEditorSuggest extends EditorSuggest<string> {
    inlineChronos : Set<string>;

    constructor(
        app: App,
        inlineChronos: Set<string>
    ) {
        super(app);
        this.inlineChronos = inlineChronos;
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
        return [...this.inlineChronos];
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.createEl("div").innerHTML = value;
    }

    selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
        if(!this.context) return;

        const editor: Editor = this.context.editor;
        editor.replaceRange(`\`chronos ${value}`, this.context.start, this.context.end)
    }
}
