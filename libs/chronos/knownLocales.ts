const rtlLocales = ["ar", "fa", "he", "ks", "ku", "ur", "yi"];

export function isRtl(locale: string): boolean {
	return rtlLocales.includes(locale);
}

const ltrLocales = [
	"af",
	"az",
	"be",
	"bg",
	"bn",
	"bs",
	"ca",
	"cs",
	"cy",
	"da",
	"de",
	"el",
	"en",
	"eo",
	"es",
	"et",
	"eu",
	"fi",
	"fr",
	"ga",
	"gl",
	"gu",
	"hi",
	"hr",
	"hu",
	"hy",
	"id",
	"is",
	"it",
	"ja",
	"jv",
	"ka",
	"kk",
	"km",
	"kn",
	"ko",
	"ky",
	"la",
	"lb",
	"lo",
	"lt",
	"lv",
	"mg",
	"mi",
	"mk",
	"ml",
	"mn",
	"mr",
	"ms",
	"mt",
	"my",
	"nb",
	"ne",
	"nl",
	"nn",
	"pl",
	"pt",
	"ro",
	"ru",
	"si",
	"sk",
	"sl",
	"so",
	"sq",
	"sr",
	"su",
	"sv",
	"sw",
	"ta",
	"te",
	"th",
	"tr",
	"uk",
	"vi",
	"xh",
	"zh-cn",
	"zh-tw",
	"zu",
];

const defaultKnownLocales = [...ltrLocales, ...rtlLocales].sort();

// Mutable runtime list so hosts can override available locales.
let currentKnownLocales = [...defaultKnownLocales];

export function getKnownLocales(): string[] {
	return [...currentKnownLocales];
}

export function setKnownLocales(locales: string[]) {
	currentKnownLocales = [...locales];
}

export function resetKnownLocales() {
	currentKnownLocales = [...defaultKnownLocales];
}
