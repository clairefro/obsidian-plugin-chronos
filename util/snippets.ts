export const templateBlank = `\`\`\`chronos

\`\`\``;

export const templateBasic = `\`\`\`chronos
- [2020] Event 1

- [2020-01-04~2020-01-14] Event 2

- [2020-01-10] Event 3

@ [2020-01-06~2020-01-10] Period 1
\`\`\``;

export const templateAdvanced = `\`\`\`chronos
@ [1888-09-26~1965-01-04] {T.S. Eliot} Life: 1888-1965
- [1949] {T.S. Eliot} "The Cocktail Party" | A play
- [1920] {T.S. Eliot}  "The Sacred Wood"
- [1922] {T.S. Eliot} "The Wasteland"

@ [1899-08-24~1986-06-14] {Jorge Luis Borges} Life: 1899-1986
- [1944] {Jorge Luis Borges} "Ficciones"
- [1949] #cyan {Jorge Luis Borges} "El Aleph"
- [1962] {Jorge Luis Borges} "Labyrinths"
\`\`\``;

export const cheatsheet = `# Chronos Cheatsheet

After installing the Chronos Timeline plugin for Obsidian, copy and paste this whole markdown file into a file in your vault to play around and learn the syntax.

Hover on a timeline and click the Edit button in the upper right to play with the data.

## Date formats

Chronos can visualize dates from the year down to the second level, using the syntax \`YYYY-MM-DDThh:mm:ss\`.

The only required component of a date is the year (\`YYYY\`). Beyond that, you can specify additional time granularity as needed for your use case.

If not explicitly provided:

- The month and day default to \`01\` (January and the 1st)
- The hour, minute, and second default to \`00\` (top of the hour or minute)

### Examples

\`\`\`chronos
- [2020] A year
- [2020-02] A month
- [2020-02-28] A day
- [2020-02-28T12] An hour
- [2020-02-28T12:30] A minute
- [2020-02-28T12:30:09] A second
\`\`\`

## Events

**Full Syntax**

\`\`\`
- [Date~Date] #Color {Group Name} Event Name | Description
\`\`\`

- The second Date, Color, Group Name, Event Name, and Description are optional
- Description appears when you hover on an event in the timeline

### Examples

#### Single Date

**Syntax**

\`\`\`
- [Date] Event Name
\`\`\`

\`\`\`chronos
- [1879-03-14] Einstein born
\`\`\`

#### Date range

**Syntax**

\`\`\`
- [Date~Date] Event Name
\`\`\`

\`\`\`chronos
- [1991~2001] Time I believed in Santa
\`\`\`

#### Date range with description

**Syntax**

\`\`\`
- [Date~Date] Event Name| Description
\`\`\`

\`\`\`chronos
- [1991~2001] Time I believed in Santa | ended when my brother tried to videotape Santa with a hidden camera
\`\`\`

#### With color

See available [Colors](#colors)

**Syntax**

\`\`\`
- [Date~Date] #Color Event Name| Description
\`\`\`

\`\`\`chronos
- [2001~2009] #red Bush
- [2009~2017] #blue Obama
- [2017~2021] #red Trump
- [2021~2025] #blue Biden
\`\`\`

#### With groups

**Syntax**

\`\`\`
- [Date(~Date)] {Group Name} Event Name| Description
\`\`\`

\`\`\`chronos
@ [1892-10-08~1941-08-31] {Marina Tsvetaeva} 1892-1941
- [1916] {Marina Tsvetaeva} "Подруга"
- [1928] {Marina Tsvetaeva}  "Поэма концов"
- [1941] {Marina Tsvetaeva} "Записки о поэзии"

@ [1899-08-24~1986-06-14] {Jorge Luis Borges} 1899-1986
- [1944] {Jorge Luis Borges} "Ficciones"
- [1949] {Jorge Luis Borges} "El Aleph"
- [1962] {Jorge Luis Borges} "Labyrinths"

\`\`\`

## Periods

**Full Syntax**

\`\`\`
@ [Date~Date] #Color {Group Name} Period Name
\`\`\`

- Color, Group Name, and Period Name are optional

### Examples

#### Basic

\`\`\`chronos
@ [-300~250] Yayoi Period
- [-100] Introduction of rice cultivation
- [-57] Japan’s first recorded contact with China
\`\`\`

#### With color

See available [Colors](#colors)

\`\`\`chronos
@ [-300~250] #red Yayoi Period
- [-100] Introduction of rice cultivation
- [-57] Japan’s first recorded contact with China

@ [250~538] Kofun Period
- [250] Construction of keyhole-shaped kofun burial mounds begins
- [369] Yamato state sends envoys to Korea
\`\`\`


## Points

**Syntax**

\`\`\`
* [Date] Point Name | Description
\`\`\`

\`\`\`chronos
- [2024-02-26~2024-03-10] Tournament
* [2024-02-26] Game 1 | Austin
* [2024-02-28] Game 2 | Los Angeles
* [2024-03-06] Game 3 | Tokyo
* [2024-03-10] Game 4 | Jakarta
\`\`\`

## Markers

**Syntax**

\`\`\`
= [Date] Marker Name
\`\`\`

### Examples

\`\`\`chronos
= [1440] Invention of the Gutenberg Press

- [1455] Gutenberg Bible Printed
@ [1501~1600] The Spread of Printing
- [1517] Martin Luther's 95 Theses
\`\`\`

## Advanced example

\`\`\`chronos
- [1945-07-17] {Europe} Potsdam Conference | where post-WWII Europe is divided
- [1947-03-12] {USA} Truman Doctrine | committing the U.S. to containing communism
- [1948-06-24~1949-05-12] {Europe} Berlin Blockade | and Airlift in response to Soviet actions in Berlin
- [1949-04-04] {Europe} Formation of NATO

# Early Cold War

@ [1957~1969] #cyan {USSR} Space Race
@ [1957~1969] #cyan {USA} Space Race
- [1950-06-25~1953-07-27] {Asia} Korean War | between North and South Korea
- [1955-05-14] {USSR} Warsaw Pact | in response to NATO
- [1957-10-04] #cyan {USSR} Sputnik launched | initiating the Space Race
- [1961-04-17] {Cuba} Bay of Pigs Invasion | in Cuba

# Height of Tensions

- [1962-10-16] {Cuba} Cuban Missile Crisis | a peak confrontation between the U.S. and USSR
- [1963-08-05] {Global} Partial Nuclear Test Ban Treaty signed
- [1969-07-20] #cyan {USA} Apollo 11 Moon landing | U.S. wins the Space Race
- [1972-05-26] {Global} SALT I signed | first Strategic Arms Limitation Treaty

# Détente Period

- [1979-12-24~1989-02-15] {USSR} Soviet-Afghan War | straining Soviet resources
- [1983-03-23] {USA} Reagan announces the Strategic Defense Initiative (SDI)
- [1986-04-26] {USSR} Chernobyl nuclear disaster
- [1987-12-08] {Global} INF Treaty | signed, eliminating intermediate-range nuclear missiles

# Late Cold War

- [1989-11-09] {Europe} Fall of the Berlin Wall | symbolizing the end of Cold War tensions
- [1991-07-31] {Global} START I Treaty signed | further arms reduction
- [1991-12-26] {USSR} Dissolution of the Soviet Union | officially ending the Cold War

= [1991-12-26] End of the Cold War

\`\`\`

## Colors

- \`#red\`
- \`#orange\`
- \`#yellow\`
- \`#green\`
- \`#blue\`
- \`#purple\`
- \`#pink\`
- \`#cyan\`
`;
