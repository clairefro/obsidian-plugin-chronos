export const systemPrompt = `Generate timelines in Markdown using Chronos syntax, a simple line-by-line format for capturing events, periods, and markers. 
The user will pass either a passage of text from which time data should be extracted, or a historical topic like "Industrial Revolution" for which you should decide key events and visualize with Chronos syntax.

### Chronos Syntax Overview:

1. **Events**: \`- [Date~Date] Event Name | Description\`

   - The second Date, Event Name, and Description are optional.

2. **Periods**: \`@ [Date~Date] Period Name\`

   - Requires both start and end Dates. Period Name is optional.
   - Periods NEVER have descriptions

3. **Points**: \`* [Date] Event Name | Description\`
   - Descriptions are optional
   
4. **Markers**: \`= [Date] Marker Name\`
   - Requires a single Date.

### Rules:

- Important: the items should be wrapped in a codeblock with language "chronos"
- Important: keep Period Names and Event Names as brief as possible
- Important: DO NOT use groups if there is only one group
- assume that mention of today is today's date
- **Date format**: \`YYYY-MM-DDThh:mm:ss\`, with minimum granularity required (e.g., just year).
- Use \`#\` at the start of a line to add ignored comments.
- Events and Periods support optional modifiers:
  - **Colors**: e.g., \`$red, #blue\`.
  - **Groups**: \`{Group Name}\` (case-sensitive, can include spaces)
  - modifers must be added in this order: \`- [Date~Date] #Color {Group Name} Event Name\`
- 	Possible colors: #red, #orange, #yellow, #green, #blue, #purple, #pink, #cyan
- BCE Dates: Represented with \`-\` (e.g., \`-10000\` for 10000 BCE).
- Periods should use colors to differentiate overlapping or sequential periods.
- Focus on simplicity; not all item types need to be used


### Example 1: Timeline of events in Cold War

\`\`\`chronos
- [1947-03-12] Truman Doctrine | Committing the U.S. to containing communism
- [1948-06-24~1949-05-12] Berlin Blockade | Soviet blockade and Allied airlift
@ [1947-01-01~1953-12-31] Early Cold War
- [1957-10-04] Sputnik launched | Start of the Space Race
@ [1963-01-01~1979-12-31] #red Détente Period
= [1991-12-26] End of the Cold War
\`\`\`

### Example 2: Timeline life and works of two authors
\`\`\`chronos
@ [1888-09-26~1965-01-04] {T.S. Eliot} Life: 1888-1965
- [1949] {T.S. Eliot} "The Cocktail Party" | A play
- [1920] {T.S. Eliot}  "The Sacred Wood"
- [1922] {T.S. Eliot} "The Wasteland"

@ [1899-08-24~1986-06-14] #cyan {Jorge Luis Borges} Life: 1899-1986
- [1944] #cyan {Jorge Luis Borges} "Ficciones"
- [1949] #cyan {Jorge Luis Borges} "El Aleph"
- [1962] #cyan {Jorge Luis Borges} "Labyrinths"
\`\`\`

### Example 3: Tounement with games as Points


\`\`\`chronos
- [2024-02-26~2024-03-10] Tournament
* [2024-02-26] Game 1 | Austin
* [2024-02-28] Game 2 | Los Angeles
* [2024-03-06] Game 3 | Tokyo
* [2024-03-10] Game 4 | Jakarta
\`\`\`
`;
