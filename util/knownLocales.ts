//TODO: IMPLEMENT RTL SUPPORT
const rtlLocales = [
	"ar", // Arabic
	"fa", // Persian (Farsi)
	"he", // Hebrew
	"ks", // Kashmiri
	"ku", // Kurdish
	"ur", // Urdu
	"yi", // Yiddish
];

// Seaparating RTL and LTR for handling formatting
export function isRtl(locale: string): boolean {
	return rtlLocales.includes(locale);
}

const ltrLocales = [
	"af", // Afrikaans
	"az", // Azerbaijani
	"be", // Belarusian
	"bg", // Bulgarian
	"bn", // Bengali
	"bs", // Bosnian
	"ca", // Catalan
	"cs", // Czech
	"cy", // Welsh
	"da", // Danish
	"de", // German
	"el", // Greek
	"en", // English
	"eo", // Esperanto
	"es", // Spanish
	"et", // Estonian
	"eu", // Basque
	"fi", // Finnish
	"fr", // French
	"ga", // Irish
	"gl", // Galician
	"gu", // Gujarati
	"hi", // Hindi
	"hr", // Croatian
	"hu", // Hungarian
	"hy", // Armenian
	"id", // Indonesian
	"is", // Icelandic
	"it", // Italian
	"ja", // Japanese
	"jv", // Javanese
	"ka", // Georgian
	"kk", // Kazakh
	"km", // Khmer
	"kn", // Kannada
	"ko", // Korean
	"ky", // Kyrgyz
	"la", // Latin
	"lb", // Luxembourgish
	"lo", // Lao
	"lt", // Lithuanian
	"lv", // Latvian
	"mg", // Malagasy
	"mi", // Maori
	"mk", // Macedonian
	"ml", // Malayalam
	"mn", // Mongolian
	"mr", // Marathi
	"ms", // Malay
	"mt", // Maltese
	"my", // Burmese
	"nb", // Norwegian Bokmål
	"ne", // Nepali
	"nl", // Dutch
	"nn", // Norwegian Nynorsk
	"pl", // Polish
	"pt", // Portuguese
	"ro", // Romanian
	"ru", // Russian
	"si", // Sinhala
	"sk", // Slovak
	"sl", // Slovenian
	"so", // Somali
	"sq", // Albanian
	"sr", // Serbian (when written in Latin script)
	"su", // Sundanese
	"sv", // Swedish
	"sw", // Swahili
	"ta", // Tamil
	"te", // Telugu
	"th", // Thai
	"tr", // Turkish
	"uk", // Ukrainian
	"vi", // Vietnamese
	"xh", // Xhosa,
	"zh-cn", // Chinese (Simplified),
	"zh-tw", // Chinese (Traditional),
	"zu", // Zulu
];

export const knownLocales = [...ltrLocales, ...rtlLocales].sort();
