import { AIProviderConfig, getProvider } from "./providers/providerFactory";

const monthNumbers: Record<string, string> = {
	jan: "01",
	january: "01",
	feb: "02",
	february: "02",
	mar: "03",
	march: "03",
	apr: "04",
	april: "04",
	may: "05",
	jun: "06",
	june: "06",
	jul: "07",
	july: "07",
	aug: "08",
	august: "08",
	sep: "09",
	september: "09",
	oct: "10",
	october: "10",
	nov: "11",
	november: "11",
	dec: "12",
	december: "12",
};

function normalizeDateEndpoint(value: string): string {
	const namedDate = value.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(-?\d+)$/);
	if (namedDate && monthNumbers[namedDate[1].toLowerCase()]) {
		value = `${namedDate[3]}-${monthNumbers[namedDate[1].toLowerCase()]}-${namedDate[2].padStart(2, "0")}`;
	}

	const parts = value.match(
		/^(-?\d+)(?:-(\d{1,2})(?:-(\d{1,2})(?:T(\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?)?)?$/,
	);
	if (!parts) return value;

	const [, year, month, day, hour, minute, second] = parts;
	if (!month) return year;
	const monthNumber = Number(month);
	if (monthNumber < 1 || monthNumber > 12) return year;
	let normalized = `${year}-${month.padStart(2, "0")}`;
	if (!day) return normalized;

	const yearNumber = Number(year);
	const isLeapYear =
		yearNumber % 4 === 0 &&
		(yearNumber % 100 !== 0 || yearNumber % 400 === 0);
	const monthLengths = [
		31,
		isLeapYear ? 29 : 28,
		31,
		30,
		31,
		30,
		31,
		31,
		30,
		31,
		30,
		31,
	];
	const dayNumber = Number(day);
	if (dayNumber < 1 || dayNumber > monthLengths[monthNumber - 1])
		return normalized;
	normalized += `-${day.padStart(2, "0")}`;
	if (!hour) return normalized;

	const hourNumber = Number(hour);
	if (hourNumber > 23) return normalized;
	normalized += `T${hour.padStart(2, "0")}`;
	if (!minute) return normalized;

	const minuteNumber = Number(minute);
	if (minuteNumber > 59) return normalized;
	normalized += `:${minute.padStart(2, "0")}`;
	if (!second) return normalized;

	const secondNumber = Number(second);
	if (secondNumber > 59) return normalized;
	return `${normalized}:${second.padStart(2, "0")}`;
}

function normalizeDate(value: string): string {
	const decade = value.match(/^(\d{3,4})s(?:-(\d{3,4})s)?$/);
	if (decade) {
		const start = Number(decade[1]);
		return `${start}~${decade[2] ? Number(decade[2]) + 9 : start + 9}`;
	}

	const yearRange = value.match(/^(-?\d{3,})-(-?\d{3,})$/);
	if (yearRange) value = `${yearRange[1]}~${yearRange[2]}`;

	const range = value.split("~");
	if (range.length === 2) {
		const startDecade = range[0].match(/^(\d{3,4})s$/);
		const endDecade = range[1].match(/^(\d{3,4})s$/);
		const start = startDecade
			? String(Number(startDecade[1]))
			: normalizeDateEndpoint(range[0]);
		const end = endDecade
			? String(Number(endDecade[1]) + 9)
			: normalizeDateEndpoint(range[1]);
		return `${start}~${end}`;
	}
	return normalizeDateEndpoint(value);
}

function normalizeChronosBody(body: string): string {
	return body
		.split(/\r?\n/)
		.map((line) => {
			const item = line.match(/^(\s*[-@*=]\s+)(.*)$/);
			if (!item) return line;

			const bracketed = item[2].match(/^\[([^\]]+)\]([\s\S]*)$/);
			let date: string;
			let content: string;
			if (bracketed) {
				date = normalizeDate(bracketed[1]);
				content = bracketed[2];
			} else {
				const namedDate = item[2].match(
					/^([A-Za-z]+\s+\d{1,2},?\s+-?\d+)([\s\S]*)$/,
				);
				const token = namedDate || item[2].match(/^(\S+)([\s\S]*)$/);
				if (!token) return line;
				const dateToken = token[1];
				const isDate =
					/^-?\d+(?:-\d{1,2}){0,2}(?:T\d{1,2}(?::\d{1,2}(?::\d{1,2})?)?)?(?:~-?\d+(?:-\d{1,2}){0,2}(?:T\d{1,2}(?::\d{1,2}(?::\d{1,2})?)?)?)?$/.test(
						dateToken,
					) ||
					/^-?\d{3,}-\d{3,}$/.test(dateToken) ||
					/^\d{3,4}s(?:-\d{3,4}s)?$/.test(dateToken) ||
					Boolean(namedDate);
				if (!isDate) return line;
				date = normalizeDate(dateToken);
				content = token[2];
			}

			const colorFixed = content.replace(
				/\[#([A-Za-z]+|[0-9A-Fa-f]{3,8})\]\(#\1\)/gi,
				"#$1",
			);
			const itemType = item[1].trimStart()[0];
			const normalizedContent =
				itemType === "@" || itemType === "="
					? colorFixed.replace(/\s*\|[\s\S]*$/, "")
					: colorFixed;
			return `${item[1]}[${date}]${normalizedContent}`;
		})
		.join("\n");
}

function ensureChronosFence(output: string): string {
	const trimmed = output.trim();
	const fencedBlock = trimmed.match(
		/```(?:chronos)?[ \t]*(?:\r?\n|$)([\s\S]*?)(?:```|$)/i,
	);
	const body = normalizeChronosBody((fencedBlock?.[1] ?? trimmed).trim());
	return `\`\`\`chronos\n${body}\n\`\`\``;
}

/**
 * High-level GenAi facade. Accepts either (apiKey) or (provider, apiKey).
 * Keeps the old shape (new GenAi(apiKey)) working, but allows selecting a
 * provider by name when desired.
 */
export class GenAi {
	private config: AIProviderConfig;

	constructor(config: AIProviderConfig);
	constructor(apiKey: string);
	constructor(provider: string, apiKey: string, model?: string);
	constructor(arg1: AIProviderConfig | string, arg2?: string, arg3?: string) {
		if (typeof arg1 !== "string") {
			this.config = arg1;
		} else if (arg2 === undefined) {
			this.config = { provider: "openai", apiKey: arg1 };
		} else {
			this.config = {
				provider: arg1 as AIProviderConfig["provider"],
				apiKey: arg2,
				model: arg3,
			};
		}
	}

	async toChronos(content: string): Promise<string> {
		const provider = getProvider(this.config);
		return ensureChronosFence(await provider.toChronos(content));
	}
}
