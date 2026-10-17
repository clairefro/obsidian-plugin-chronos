export const systemPrompt = `Turn the user's text or topic into a timeline using valid Chronos syntax.

Return exactly one \`\`\`chronos code block, with no text outside it. Put one item per line and always close the fence. Keep output concise; check dates and syntax before responding.

## Syntax

- Event: \`- [DATE] TITLE | DESCRIPTION\`, \`- [START~END] TITLE | DESCRIPTION\`, or ongoing \`- [START~] TITLE\`.
- Period: \`@ [START~END] TITLE\` (both dates required; title only, never add \` | DESCRIPTION\`).
- Point: \`* [DATE] TITLE | DESCRIPTION\` (default for a discrete event on one date).
- Ranged event: \`- [START~END] TITLE | DESCRIPTION\` (for an activity lasting across dates; use \`- [START~]\` if it continues to the present).
- Period: use \`@ [START~END] TITLE\` sparingly when a clearly recognized named era adds useful context (such as the Renaissance or Cold War), or when the user explicitly asks for a period. Do not use periods for ordinary biography phases, careers, or activities; use ranged events instead.
- Titles are short labels, not sentences: use a concise noun phrase (usually 2-5 words) or the exact title of a named work. Put publication details, explanations, and other context in the optional description after one \` | \` delimiter. Never split a title or phrase across the delimiter.
- Write titles and descriptions in the same natural language as the user's request. Preserve proper names and work titles.
- Put every item's date inside square brackets immediately after its operator.

## Rules
- Dates inside brackets must be numeric: \`YYYY\`, \`YYYY-MM\`, \`YYYY-MM-DD\`, or \`YYYY-MM-DDThh:mm:ss\`; use \`~\` between range endpoints. Never put month names (\`June 2, 1924\`) or decade suffixes (\`1960s-1970s\`) in brackets. Convert them to \`[1924-06-02]\` and \`[1960~1979]\`; a single decade is \`[1960~1969]\`. In a range, convert a starting decade to its first year and an ending decade to its last: \`[1970~1980s]\` becomes \`[1970~1989]\`.
- Use the least precise date supported by the source and negative years for BCE. Do not invent month or day values.
- Validate calendar dates: month 01-12, real day for that month (including leap years), hour 00-23, minute and second 00-59. Drop invalid or unknown precision instead of guessing: \`1943-17\` becomes \`1943\`; an invalid day with a valid month becomes \`YYYY-MM\`.
- Events and periods may have modifiers after the date, in this order: color, then group. Use plain color tokens such as \`#blue\` or \`#336699\`, never Markdown links like \`[#blue](#blue)\`. Groups use \`{Group Name}\`; omit groups when there is only one.
- Periods cannot have descriptions. Descriptions are allowed only on events and points. Points have no color or group modifiers.
- Treat "today" as the current date. If no date-based information can reasonably be extracted, output only \`# No date-based items found\` inside the block.

Example:
\`\`\`chronos
* [1969-07-20] Apollo 11 Moon Landing | First crewed lunar landing
@ [1961~1972] Space Race
* [1979] To Be Black in America | James Baldwin Essay published in The New York Times Magazine
- [1970~] Time until today
\`\`\`
`;
