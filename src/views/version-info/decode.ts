/** Meanings of VS_FIXEDFILEINFO fields and VarFileInfo translations, from the Windows SDK's verrsrc.h. */

const fileFlags: [number, string][] = [
	[0x01, 'VS_FF_DEBUG'],
	[0x02, 'VS_FF_PRERELEASE'],
	[0x04, 'VS_FF_PATCHED'],
	[0x08, 'VS_FF_PRIVATEBUILD'],
	[0x10, 'VS_FF_INFOINFERRED'],
	[0x20, 'VS_FF_SPECIALBUILD'],
]

const osHigh: Record<number, string> = {
	0x0000: 'VOS_UNKNOWN',
	0x0001: 'VOS_DOS',
	0x0002: 'VOS_OS216',
	0x0003: 'VOS_OS232',
	0x0004: 'VOS_NT',
	0x0005: 'VOS_WINCE',
}

const osLow: Record<number, string> = {
	0x0000: 'VOS__BASE',
	0x0001: 'VOS__WINDOWS16',
	0x0002: 'VOS__PM16',
	0x0003: 'VOS__PM32',
	0x0004: 'VOS__WINDOWS32',
}

const fileTypes: Record<number, string> = {
	0: 'VFT_UNKNOWN',
	1: 'VFT_APP (application)',
	2: 'VFT_DLL (dynamic-link library)',
	3: 'VFT_DRV (device driver)',
	4: 'VFT_FONT (font)',
	5: 'VFT_VXD (virtual device)',
	7: 'VFT_STATIC_LIB (static library)',
}

const driverSubtypes: Record<number, string> = {
	0: 'VFT2_UNKNOWN',
	1: 'VFT2_DRV_PRINTER',
	2: 'VFT2_DRV_KEYBOARD',
	3: 'VFT2_DRV_LANGUAGE',
	4: 'VFT2_DRV_DISPLAY',
	5: 'VFT2_DRV_MOUSE',
	6: 'VFT2_DRV_NETWORK',
	7: 'VFT2_DRV_SYSTEM',
	8: 'VFT2_DRV_INSTALLABLE',
	9: 'VFT2_DRV_SOUND',
	10: 'VFT2_DRV_COMM',
	12: 'VFT2_DRV_VERSIONED_PRINTER',
}

const fontSubtypes: Record<number, string> = {
	0: 'VFT2_UNKNOWN',
	1: 'VFT2_FONT_RASTER',
	2: 'VFT2_FONT_VECTOR',
	3: 'VFT2_FONT_TRUETYPE',
}

export function flagNames(value: number): string {
	const names = fileFlags.filter(([bit]) => value & bit).map(([, name]) => name)
	const known = fileFlags.reduce((mask, [bit]) => mask | bit, 0)
	const rest = value & ~known
	if (rest) names.push(`0x${(rest >>> 0).toString(16)}`)
	return names.length ? names.join(', ') : 'None'
}

export function osName(value: number): string {
	const high = osHigh[(value >>> 16) & 0xffff]
	const low = osLow[value & 0xffff]
	if (high === undefined || low === undefined) return 'Unknown operating system'
	if (value === 0) return 'VOS_UNKNOWN'
	if ((value & 0xffff) === 0) return high
	if (value >>> 16 === 0) return low
	return `${high}${low.slice(4)}`
}

export function fileTypeName(value: number): string {
	return fileTypes[value] ?? 'Unknown file type'
}

export function subtypeName(type: number, value: number): string {
	if (type === 3) return driverSubtypes[value] ?? 'Unknown driver type'
	if (type === 4) return fontSubtypes[value] ?? 'Unknown font type'
	if (type === 5) return value === 0 ? 'No virtual device identifier' : `Virtual device identifier ${value}`
	return value === 0 ? 'Not used for this file type' : 'Unexpected for this file type'
}

/** The file date is a FILETIME split into two DWORDs: 100 ns intervals since 1601-01-01 UTC. */
export function fileDate(ms: number, ls: number): string {
	if (ms === 0 && ls === 0) return 'Not set'
	const ticks = (BigInt(ms >>> 0) << 32n) | BigInt(ls >>> 0)
	const milliseconds = Number(ticks / 10000n) - 11644473600000
	const date = new Date(milliseconds)
	if (Number.isNaN(date.getTime())) return 'Not a valid date'
	return `${date.toISOString().replace('T', ' ').slice(0, 19)} UTC`
}

const languages: Record<number, string> = {
	0x0000: 'Language neutral',
	0x0401: 'Arabic (Saudi Arabia)',
	0x0404: 'Chinese (Taiwan)',
	0x0405: 'Czech',
	0x0406: 'Danish',
	0x0407: 'German (Germany)',
	0x0408: 'Greek',
	0x0409: 'English (United States)',
	0x040a: 'Spanish (traditional sort)',
	0x040b: 'Finnish',
	0x040c: 'French (France)',
	0x040d: 'Hebrew',
	0x040e: 'Hungarian',
	0x0410: 'Italian (Italy)',
	0x0411: 'Japanese',
	0x0412: 'Korean',
	0x0413: 'Dutch (Netherlands)',
	0x0414: 'Norwegian (Bokmål)',
	0x0415: 'Polish',
	0x0416: 'Portuguese (Brazil)',
	0x0419: 'Russian',
	0x041d: 'Swedish',
	0x041f: 'Turkish',
	0x0422: 'Ukrainian',
	0x0804: 'Chinese (PRC)',
	0x0809: 'English (United Kingdom)',
	0x0816: 'Portuguese (Portugal)',
	0x0c0a: 'Spanish (Spain)',
}

const codePages: Record<number, string> = {
	0: '7-bit ASCII',
	932: 'Japanese (Shift JIS)',
	936: 'Simplified Chinese (GBK)',
	949: 'Korean',
	950: 'Traditional Chinese (Big5)',
	1200: 'Unicode (UTF-16)',
	1250: 'Windows Latin 2 (Central European)',
	1251: 'Windows Cyrillic',
	1252: 'Windows Latin 1 (Western European)',
	1253: 'Windows Greek',
	1254: 'Windows Turkish',
	1255: 'Windows Hebrew',
	1256: 'Windows Arabic',
	65001: 'UTF-8',
}

/** A translation key is eight hex digits: the language ID, then the code page. */
export interface Translation {
	key: string
	language: number
	codePage: number
	languageHex: string
	languageName: string | undefined
	codePageName: string | undefined
}

export function parseTranslation(key: string): Translation {
	const language = parseInt(key.slice(0, 4), 16)
	const codePage = parseInt(key.slice(4), 16)
	return {
		key,
		language,
		codePage,
		languageHex: `0x${key.slice(0, 4).toLowerCase()}`,
		languageName: languages[language],
		codePageName: codePages[codePage],
	}
}
