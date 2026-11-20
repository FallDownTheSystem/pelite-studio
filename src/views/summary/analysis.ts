import type { PeDocument } from '@/pe/document'
import type {
	PeHashes,
	PeHeaders,
	PeImportDescriptor,
	PeSectionHeader,
	PeTls,
	Result,
	SectionEntropy,
} from '@/vendor/pelite/pelite.js'
import { unwrap } from '@/pe/pelite'

const sectionExecute = 0x20000000
const sectionRead = 0x40000000
const sectionWrite = 0x80000000

/** Entropy at or above this, in a section of at least `highEntropyMinSize` raw bytes, reads as packed or encrypted. */
export const highEntropy = 7.2
const highEntropyMinSize = 256

/** Imports that hint at capabilities. They suggest where to look; they prove nothing on their own. */
const importCategories: Record<string, string[]> = {
	'Process execution': ['CreateProcessA', 'CreateProcessW', 'ShellExecuteA', 'ShellExecuteW', 'WinExec'],
	'Process access / injection': [
		'VirtualAllocEx',
		'WriteProcessMemory',
		'ReadProcessMemory',
		'CreateRemoteThread',
		'NtMapViewOfSection',
		'NtUnmapViewOfSection',
		'OpenProcess',
	],
	Networking: [
		'InternetOpenA',
		'InternetOpenW',
		'InternetConnectA',
		'InternetConnectW',
		'HttpOpenRequestA',
		'HttpOpenRequestW',
		'HttpSendRequestA',
		'HttpSendRequestW',
		'URLDownloadToFileA',
		'URLDownloadToFileW',
		'WSAStartup',
		'connect',
		'recv',
		'send',
	],
	'Services / registry': [
		'CreateServiceA',
		'CreateServiceW',
		'StartServiceA',
		'StartServiceW',
		'RegSetValueExA',
		'RegSetValueExW',
	],
	Cryptography: [
		'CryptDecrypt',
		'CryptEncrypt',
		'CryptAcquireContextA',
		'CryptAcquireContextW',
		'BCryptDecrypt',
		'BCryptEncrypt',
	],
	'Anti-analysis': [
		'IsDebuggerPresent',
		'CheckRemoteDebuggerPresent',
		'NtQueryInformationProcess',
		'GetTickCount',
		'QueryPerformanceCounter',
	],
	'Dynamic loading': ['LoadLibraryA', 'LoadLibraryW', 'LoadLibraryExA', 'LoadLibraryExW', 'GetProcAddress'],
}

const categoryByName = new Map<string, string>()
for (const [category, names] of Object.entries(importCategories)) {
	for (const name of names) categoryByName.set(name.toLowerCase(), category)
}

export interface SummaryImports {
	libraries: number
	functions: number
	byLibrary: { name: string; functions: number }[]
	/** Category to `library!function` symbols, in import order. */
	notable: { category: string; symbols: string[] }[]
	/** False when some descriptor or thunk could not be parsed. */
	complete: boolean
}

export interface SummaryFinding {
	level: 'warning' | 'note'
	message: string
}

export interface SummarySection {
	index: number
	name: string
	header: PeSectionHeader
	read: boolean
	write: boolean
	execute: boolean
	entropy: number | null
	samples: number[]
	high: boolean
	entry: boolean
}

export interface SummaryOverlay {
	offset: number
	size: number
	/** Overlay bytes that are not the certificate table, which also lives after the last section. */
	outsideCertificate: number
}

export interface SummaryData {
	fileName: string
	fileSize: number
	headers: PeHeaders
	format: string
	machine: string
	type: string
	subsystem: string
	entrySection: PeSectionHeader | undefined
	timestamp: number
	checksum: number
	checksumState: 'Not set' | 'Valid' | 'Does not match'
	computedChecksum: number | undefined
	certificate: boolean
	clr: boolean
	/** `null` when the TLS directory or its callback array could not be read. */
	tlsCallbacks: number | null
	overlay: SummaryOverlay
	/** `undefined` when the file names no PDB, `null` when the name could not be read. */
	pdbPath: string | null | undefined
	hashes: PeHashes
	mitigations: { name: string; flag: string; enabled: boolean }[]
	sections: SummarySection[]
	imports: SummaryImports
	findings: SummaryFinding[]
}

function summarizeImports(result: Result<PeImportDescriptor[] | null>, present: boolean): SummaryImports {
	const summary: SummaryImports = { libraries: 0, functions: 0, byLibrary: [], notable: [], complete: true }
	if (result === null || result instanceof Error) {
		summary.complete = !present
		return summary
	}
	const notable = new Map<string, string[]>()
	for (const descriptor of result) {
		if (descriptor.dll_name === null || descriptor.imports === null) {
			summary.complete = false
			continue
		}
		let functions = 0
		for (const row of descriptor.imports) {
			if (row.import === null) {
				summary.complete = false
				continue
			}
			functions++
			const name = row.import.ByName?.name
			if (name === undefined) continue
			const category = categoryByName.get(name.toLowerCase())
			if (category === undefined) continue
			let symbols = notable.get(category)
			if (!symbols) notable.set(category, (symbols = []))
			symbols.push(`${descriptor.dll_name}!${name}`)
		}
		summary.byLibrary.push({ name: descriptor.dll_name, functions })
		summary.functions += functions
	}
	summary.libraries = summary.byLibrary.length
	summary.notable = [...notable].map(([category, symbols]) => ({ category, symbols }))
	return summary
}

function countTlsCallbacks(tls: Result<PeTls | null>): number | null {
	if (tls instanceof Error) return null
	if (tls === null || tls.image.AddressOfCallBacks === 0) return 0
	return tls.callbacks === null ? null : tls.callbacks.length
}

function findOverlay(headers: PeHeaders, fileSize: number): SummaryOverlay {
	let offset = headers.NtHeaders.OptionalHeader.SizeOfHeaders
	for (const section of headers.SectionHeaders) {
		offset = Math.max(offset, Math.min(section.PointerToRawData + section.SizeOfRawData, fileSize))
	}
	offset = Math.min(offset, fileSize)
	const size = fileSize - offset
	// The security directory holds a file offset, unlike the other directories' RVAs.
	const certificate = headers.DataDirectory[4]
	const overlap =
		certificate === undefined
			? 0
			: Math.max(
					0,
					Math.min(certificate.VirtualAddress + certificate.Size, fileSize) -
						Math.max(certificate.VirtualAddress, offset),
				)
	return { offset, size, outsideCertificate: size - Math.min(overlap, size) }
}

function stripPrefix(value: unknown, prefix: string, fallback: number): string {
	return typeof value === 'string'
		? value.replace(prefix, '')
		: fallback === 0
			? '0'
			: `0x${fallback.toString(16)}`
}

export function summarize(doc: PeDocument): SummaryData {
	const pe = doc.peFile
	const hashes = unwrap(pe.hashes())
	const headers = unwrap(pe.headers())
	const sectionEntropy: SectionEntropy[] = unwrap(pe.sectionEntropy())
	const optional = headers.NtHeaders.OptionalHeader
	const file = headers.NtHeaders.FileHeader
	const fileSize = doc.file.size

	const imports = summarizeImports(pe.imports(), !!headers.DataDirectory[1]?.VirtualAddress)
	const tls = pe.tls()
	const tlsCallbacks = countTlsCallbacks(tls)
	const pdb = pe.pdbFileName()

	const entryRva = optional.AddressOfEntryPoint
	const entryIndex = headers.SectionHeaders.findIndex(
		(section) =>
			entryRva >= section.VirtualAddress && entryRva < (section.VirtualAddress + section.VirtualSize) >>> 0,
	)
	const entrySection = headers.SectionHeaders[entryIndex]
	const overlay = findOverlay(headers, fileSize)

	const sections: SummarySection[] = headers.SectionHeaders.map((header, index) => {
		const analysis = sectionEntropy[index] ?? { entropy: null, samples: [] }
		return {
			index,
			name: header.Name,
			header,
			read: !!(header.Characteristics & sectionRead),
			write: !!(header.Characteristics & sectionWrite),
			execute: !!(header.Characteristics & sectionExecute),
			entropy: analysis.entropy,
			samples: analysis.samples,
			high:
				analysis.entropy !== null &&
				analysis.entropy >= highEntropy &&
				header.SizeOfRawData >= highEntropyMinSize,
			entry: index === entryIndex,
		}
	})

	const findings: SummaryFinding[] = []
	if (entryRva !== 0 && entrySection === undefined) {
		findings.push({ level: 'warning', message: 'Entry point is outside the declared sections' })
	} else if (entrySection !== undefined && !(entrySection.Characteristics & sectionExecute)) {
		findings.push({
			level: 'warning',
			message: `Entry point is in non-executable section ${entrySection.Name}`,
		})
	}
	if (overlay.outsideCertificate !== 0) {
		findings.push({
			level: 'note',
			message: `${overlay.outsideCertificate} bytes follow the last section outside the certificate table`,
		})
	}
	if (!imports.complete) {
		findings.push({
			level: 'warning',
			message: 'Some imports could not be parsed; import counts may be incomplete',
		})
	}
	if (imports.notable.length > 0) {
		findings.push({
			level: 'note',
			message: 'Notable imports suggest capabilities worth reviewing; imports alone do not prove behavior',
		})
	}
	for (const section of sections) {
		if (section.execute && section.write) {
			findings.push({ level: 'warning', message: `Section ${section.name} is both writable and executable` })
		}
		if (section.high && section.entropy !== null) {
			findings.push({
				level: 'note',
				message: `Section ${section.name} has high entropy (${section.entropy.toFixed(2)}); it may be compressed or encrypted`,
			})
		}
		if (section.entropy === null && section.header.SizeOfRawData !== 0) {
			findings.push({ level: 'warning', message: `Section ${section.name} has an invalid raw-data range` })
		}
	}
	if (tlsCallbacks === null) {
		findings.push({
			level: 'warning',
			message:
				tls instanceof Error ? 'TLS directory could not be parsed' : 'TLS callbacks could not be parsed',
		})
	} else if (tlsCallbacks !== 0) {
		findings.push({
			level: 'note',
			message: `Contains ${tlsCallbacks} TLS callback(s) that run before the normal entry point`,
		})
	}
	if (pdb instanceof Error) findings.push({ level: 'warning', message: 'PDB file name could not be parsed' })

	const computed = headers.details['OptionalHeader.CheckSum']
	const computedChecksum = typeof computed === 'number' ? computed : undefined
	const checksum = optional.CheckSum
	const certificate = headers.DataDirectory[4]
	const clr = headers.DataDirectory[14]

	return {
		fileName: doc.file.name,
		fileSize,
		headers,
		format: optional.Magic === 0x20b ? 'PE32+' : 'PE32',
		machine: stripPrefix(headers.details['FileHeader.Machine'], 'IMAGE_FILE_MACHINE_', file.Machine),
		// IMAGE_FILE_SYSTEM or IMAGE_DLLCHARACTERISTICS_WDM_DRIVER mark a driver before the DLL bit is considered.
		type:
			file.Characteristics & 0x1000 || optional.DllCharacteristics & 0x2000
				? 'Driver'
				: file.Characteristics & 0x2000
					? 'DLL'
					: 'Executable',
		subsystem: stripPrefix(
			headers.details['OptionalHeader.Subsystem'],
			'IMAGE_SUBSYSTEM_',
			optional.Subsystem,
		).replaceAll('_', ' '),
		entrySection,
		timestamp: file.TimeDateStamp,
		checksum,
		checksumState: checksum === 0 ? 'Not set' : checksum === computed ? 'Valid' : 'Does not match',
		computedChecksum,
		certificate: !!(certificate?.VirtualAddress && certificate.Size),
		clr: !!(clr?.VirtualAddress && clr.Size),
		tlsCallbacks,
		overlay,
		pdbPath: pdb === null ? undefined : pdb instanceof Error ? null : pdb,
		hashes,
		mitigations: [
			{ name: 'ASLR', flag: 'DYNAMIC_BASE', bit: 0x40 },
			{ name: 'DEP / NX', flag: 'NX_COMPAT', bit: 0x100 },
			{ name: 'CFG', flag: 'GUARD_CF', bit: 0x4000 },
			{ name: 'High-entropy VA', flag: 'HIGH_ENTROPY_VA', bit: 0x20 },
		].map(({ name, flag, bit }) => ({ name, flag, enabled: !!(optional.DllCharacteristics & bit) })),
		sections,
		imports,
		findings,
	}
}
