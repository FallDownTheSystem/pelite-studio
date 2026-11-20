/** Names the PE format defines for header enumerations and flag bits. */

const machines: Record<number, string> = {
	0x0: 'Any machine',
	0x14c: 'x86 (Intel 386)',
	0x166: 'MIPS R4000',
	0x169: 'MIPS WCE v2',
	0x184: 'Alpha AXP',
	0x1a2: 'Hitachi SH3',
	0x1a6: 'Hitachi SH4',
	0x1c0: 'ARM',
	0x1c2: 'ARM Thumb',
	0x1c4: 'ARM Thumb-2',
	0x1f0: 'PowerPC',
	0x1f1: 'PowerPC with FPU',
	0x200: 'Intel Itanium',
	0x5032: 'RISC-V 32-bit',
	0x5064: 'RISC-V 64-bit',
	0x5128: 'RISC-V 128-bit',
	0x6232: 'LoongArch 32-bit',
	0x6264: 'LoongArch 64-bit',
	0x8664: 'x64 (AMD64)',
	0xa641: 'ARM64EC',
	0xa64e: 'ARM64X',
	0xaa64: 'ARM64',
	0xebc: 'EFI byte code',
}

export function machineName(machine: number): string | undefined {
	return machines[machine]
}

const subsystems: Record<number, string> = {
	0: 'Unknown',
	1: 'Native (drivers and native processes)',
	2: 'Windows GUI',
	3: 'Windows console',
	5: 'OS/2 console',
	7: 'POSIX console',
	8: 'Native Windows 9x driver',
	9: 'Windows CE GUI',
	10: 'EFI application',
	11: 'EFI boot service driver',
	12: 'EFI runtime driver',
	13: 'EFI ROM',
	14: 'Xbox',
	16: 'Windows boot application',
}

export function subsystemName(subsystem: number): string | undefined {
	return subsystems[subsystem]
}

const optionalMagic: Record<number, string> = {
	0x10b: 'PE32 (32-bit image)',
	0x20b: 'PE32+ (64-bit image)',
	0x107: 'ROM image',
}

export function optionalMagicName(magic: number): string | undefined {
	return optionalMagic[magic]
}

/** Data directory slots in table order. Slot 15 is reserved and must be zero. */
export const directoryNames = [
	'Export',
	'Import',
	'Resource',
	'Exception',
	'Security',
	'Base relocation',
	'Debug',
	'Architecture',
	'Global pointer',
	'TLS',
	'Load config',
	'Bound import',
	'IAT',
	'Delay import',
	'CLR runtime',
	'Reserved',
] as const

/** Workspace views that show the contents of a data directory slot. */
export const directoryViews: Partial<Record<number, string>> = {
	0: 'exports',
	1: 'imports',
	2: 'resources',
	3: 'exceptions',
	4: 'security',
	5: 'relocations',
	6: 'debug',
	9: 'tls',
	10: 'load-config',
}

/** The security directory holds a file offset where every other directory holds an RVA. */
export const securityDirectory = 4

const debugTypes: Record<number, string> = {
	0: 'UNKNOWN',
	1: 'COFF',
	2: 'CODEVIEW',
	3: 'FPO',
	4: 'MISC',
	5: 'EXCEPTION',
	6: 'FIXUP',
	7: 'OMAP_TO_SRC',
	8: 'OMAP_FROM_SRC',
	9: 'BORLAND',
	10: 'RESERVED10',
	11: 'CLSID',
	12: 'VC_FEATURE',
	13: 'POGO',
	14: 'ILTCG',
	15: 'MPX',
	16: 'REPRO',
	17: 'EMBEDDED_PORTABLE_PDB',
	18: 'SPGO',
	19: 'PDBCHECKSUM',
	20: 'EX_DLLCHARACTERISTICS',
}

const debugTypeDescriptions: Record<string, string> = {
	COFF: 'COFF symbol information',
	CODEVIEW: 'CodeView: the PDB file that holds the symbols',
	FPO: 'Frame pointer omission information',
	MISC: 'Location of a DBG file',
	EXCEPTION: 'Copy of the exception directory',
	FIXUP: 'Fixup information',
	OMAP_TO_SRC: 'Address map from the image to the source',
	OMAP_FROM_SRC: 'Address map from the source to the image',
	BORLAND: 'Borland debug information',
	CLSID: 'Class identifier',
	VC_FEATURE: 'Visual C++ feature counts',
	POGO: 'Profile-guided optimization: section contributions',
	ILTCG: 'Incremental link-time code generation',
	MPX: 'Intel MPX',
	REPRO: 'Reproducible build: timestamps hold a content hash',
	EMBEDDED_PORTABLE_PDB: 'Embedded portable PDB',
	SPGO: 'Sample profile-guided optimization',
	PDBCHECKSUM: 'Checksum of the PDB file',
	EX_DLLCHARACTERISTICS: 'Extended DLL characteristics',
}

/** Reproducible builds store a hash in every TimeDateStamp field instead of a time. */
export const debugTypeRepro = 16

/** The type name without its `IMAGE_DEBUG_TYPE_` prefix, from the parser when it knows it. */
export function debugTypeName(type: number, parsed: string | null): string | undefined {
	return parsed?.replace(/^IMAGE_DEBUG_TYPE_/, '') ?? debugTypes[type]
}

export function debugTypeDescription(name: string | undefined): string | undefined {
	return name === undefined ? undefined : debugTypeDescriptions[name]
}

const guardFlags: [number, string][] = [
	[0x100, 'CF_INSTRUMENTED'],
	[0x200, 'CFW_INSTRUMENTED'],
	[0x400, 'CF_FUNCTION_TABLE_PRESENT'],
	[0x800, 'SECURITY_COOKIE_UNUSED'],
	[0x1000, 'PROTECT_DELAYLOAD_IAT'],
	[0x2000, 'DELAYLOAD_IAT_IN_ITS_OWN_SECTION'],
	[0x4000, 'CF_EXPORT_SUPPRESSION_INFO_PRESENT'],
	[0x8000, 'CF_ENABLE_EXPORT_SUPPRESSION'],
	[0x10000, 'CF_LONGJUMP_TABLE_PRESENT'],
	[0x20000, 'RF_INSTRUMENTED'],
	[0x40000, 'RF_ENABLE'],
	[0x80000, 'RF_STRICT'],
	[0x100000, 'RETPOLINE_PRESENT'],
	[0x400000, 'EH_CONTINUATION_TABLE_PRESENT'],
	[0x800000, 'XFG_ENABLED'],
	[0x1000000, 'CASTGUARD_PRESENT'],
	[0x2000000, 'MEMCPY_PRESENT'],
]

/** `IMAGE_GUARD_*` flag names. The top four bits are not a flag: they hold the CF table stride. */
export function guardFlagNames(flags: number): string[] {
	const names = guardFlags.filter(([bit]) => (flags & bit) !== 0).map(([, name]) => name)
	const known = guardFlags.reduce((mask, [bit]) => mask | bit, 0xf0000000)
	const unknown = (flags & ~known) >>> 0
	if (unknown) names.push(`0x${unknown.toString(16)}`)
	return names
}

/** Extra bytes after each RVA in the guard CF function table (IMAGE_GUARD_CF_FUNCTION_TABLE_SIZE_MASK). */
export function guardTableStride(flags: number): number {
	return (flags >>> 28) & 0xf
}

export const sectionRead = 0x40000000
export const sectionWrite = 0x80000000
export const sectionExecute = 0x20000000

const sectionContents: [number, string][] = [
	[0x20, 'Code'],
	[0x40, 'Initialized data'],
	[0x80, 'Uninitialized data'],
]

export function sectionContent(characteristics: number): string[] {
	return sectionContents.filter(([bit]) => (characteristics & bit) !== 0).map(([, name]) => name)
}

/** Flag names the section table already shows as permissions or content. */
const sectionShown = new Set([
	'IMAGE_SCN_MEM_READ',
	'IMAGE_SCN_MEM_WRITE',
	'IMAGE_SCN_MEM_EXECUTE',
	'IMAGE_SCN_CNT_CODE',
	'IMAGE_SCN_CNT_INITIALIZED_DATA',
	'IMAGE_SCN_CNT_UNINITIALIZED_DATA',
])

export function otherSectionFlags(names: readonly string[]): string[] {
	return names.filter((name) => !sectionShown.has(name)).map((name) => stripFlag(name))
}

/** Bits 20-23 of a section's (or TLS directory's) characteristics encode an alignment of 2^(n-1) bytes. */
export function sectionAlignment(characteristics: number): number | undefined {
	const field = (characteristics >>> 20) & 0xf
	return field === 0 || field > 14 ? undefined : 2 ** (field - 1)
}

const flagPrefixes = /^IMAGE_(?:FILE_|DLLCHARACTERISTICS_|SCN_|SUBSYSTEM_|DIRECTORY_ENTRY_|FILE_MACHINE_)/

/** Flag names read better in a tag without the `IMAGE_…_` prefix they all share. */
export function stripFlag(name: string): string {
	return name.replace(flagPrefixes, '')
}
