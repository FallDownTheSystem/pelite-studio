import { hex } from '@/lib/format'
import type { PeDocument } from '@/pe/document'
import { unwrap } from '@/pe/pelite'
import { addressToRva, type AddressKind } from '@/pe/view'

/**
 * What an agent learns about each view, and how a view's data is shaped for it.
 *
 * A view prepares data for its own screen: screen state, handles, lists held as typed arrays.
 * An agent that has never seen the app needs to know what each view answers and to get rows
 * it can read. `note` goes out with `list_views`; `read` replaces the raw data where the raw
 * data is not readable as it is, or where the view only works through an input.
 */
export interface AgentView {
	/** What the view answers, and the fields worth knowing. */
	note: string
	/** What `read_view` and `open_view` take as `input`, when the view takes one. */
	input?: string
	read?: (raw: any, doc: PeDocument, input: Record<string, unknown>) => unknown
}

const rvaInput =
	'{ "rva": 4096 } or { "rva": "0x1000" } to start at an RVA. Without it, the view starts at its default place.'

function asNumber(value: unknown, name: string): number {
	const number = typeof value === 'string' ? Number(value) : value
	if (typeof number !== 'number' || !Number.isInteger(number) || number < 0) {
		throw new Error(`"${name}" must be a whole number of 0 or more, as a number or a "0x" string.`)
	}
	return number
}

function hexDumpLines(start: number, bytes: Uint8Array): string[] {
	const lines: string[] = []
	for (let offset = 0; offset < bytes.length; offset += 16) {
		const row = bytes.subarray(offset, offset + 16)
		const digits = Array.from(row, (byte) => byte.toString(16).padStart(2, '0')).join(' ')
		const text = Array.from(row, (byte) =>
			byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.',
		).join('')
		lines.push(`${hex(start + offset, 8)}  ${digits.padEnd(47)}  ${text}`)
	}
	return lines
}

/** IMAGE_REL_BASED_* from the PE format. */
const relocationNames: Record<number, string> = {
	0: 'ABSOLUTE',
	1: 'HIGH',
	2: 'LOW',
	3: 'HIGHLOW',
	4: 'HIGHADJ',
	10: 'DIR64',
}

export const agentViews: Record<string, AgentView> = {
	summary: {
		note: 'Triage report of the file, and large. Good first read; for one fact, a narrower view costs less. Has the file name and size, the parsed headers, hashes (MD5, SHA-256, import hash), findings worth a closer look, declared mitigations (ASLR, DEP, CFG), sections with entropy, imports by library, and notable imports by category.',
	},
	dos: { note: 'IMAGE_DOS_HEADER as rows of { field, value, meaning }.' },
	nt: {
		note: 'IMAGE_NT_HEADERS: signature, fileHeader and optionalHeader as rows of { field, value, meaning, constant }, directories (the 16 data directories, such as the import directory, as { index, name, address (RVA, decimal), size, absent }), and sections. The entry point is AddressOfEntryPoint in optionalHeader.',
	},
	sections: {
		note: 'Section headers. Each item has header { Name, VirtualSize, VirtualAddress (RVA), SizeOfRawData, PointerToRawData (file offset), Characteristics }, read / write / execute flags, content kinds, and entropy { entropy (of the whole section, 0 to 8 bits per byte; near 8 suggests packed or encrypted data), samples (the same measure for equal parts of the section, in order) }.',
	},
	rich: {
		note: 'The Rich structure that Microsoft linkers leave: the tools and build numbers that made the file.',
	},
	exports: {
		note: 'Export directory. directory has the DLL name and ordinal base. rows are the exported functions: ordinal, name, RVA, or the forwarder string when the export is forwarded to another DLL.',
	},
	imports: {
		note: 'Imported functions (the RVA and size of the directory itself are in nt). descriptors are the imported libraries, each with dll_name and imports. rows is the flat list of all imported functions: library is an index into descriptors, entry.import is { ByName: { hint, name } } or { ByOrdinal }, entry.address is the RVA of the import address table slot.',
	},
	exceptions: {
		note: 'Exception directory (x64 .pdata): one runtime function per row with its begin and end RVA and unwind information.',
	},
	security: {
		note: 'Security directory: the Authenticode certificate table. The signature is listed, not validated.',
	},
	relocations: {
		note: 'Base relocations as { rva, at (the RVA in hex), type, name } items, where type is the IMAGE_REL_BASED number. The total includes ABSOLUTE items, which are padding.',
		read: (raw) => {
			const rvas = raw.relocations.rvas as ArrayLike<number>
			const types = raw.relocations.types as ArrayLike<number>
			return {
				relocations: Array.from(rvas, (rva, index) => ({
					rva,
					at: hex(rva),
					type: types[index],
					name: relocationNames[types[index]] ?? 'UNKNOWN',
				})),
			}
		},
	},
	debug: {
		note: 'Debug directory entries. Each has its type (such as CodeView), the raw IMAGE_DEBUG_DIRECTORY fields and a decoded payload, for example the PDB path as the file stores it (often only a file name) and the GUID.',
	},
	tls: {
		note: 'TLS directory: the thread-local storage template and the TLS callbacks, which run before the entry point.',
	},
	'load-config': {
		note: 'Load configuration directory as rows of { field, value, meaning }, with the security cookie and the guard (CFG) and SafeSEH tables.',
	},
	resources: {
		note: 'Resource tree. nodes are nested by type, then name, then language; a leaf has data with its RVA and size. leaves is the number of resources.',
	},
	version: {
		note: 'Version resource: version.fixed (file and product version) and version.strings by language, such as CompanyName, FileDescription, OriginalFilename.',
	},
	manifest: { note: 'The application manifest as XML text in manifest.' },
	'icons-cursors': { note: 'Icon and cursor groups with the size and color depth of each image.' },
	facts: {
		note: 'Annotation layers that the person keeps for this file, in the factmap text format. Each layer has label, visible and text. They are kept in memory only until the person exports them.',
		read: (raw) => ({
			layers: (raw.db.layers as { label: string; visible: boolean; text: string }[]).map((layer) => ({
				label: layer.label,
				visible: layer.visible,
				text: layer.text,
			})),
		}),
	},
	'address-converter': {
		note: 'Converts one address between RVA (offset from the image base in memory), VA (image base + RVA) and file offset (position in the file on disk).',
		input:
			'{ "kind": "rva" | "va" | "fo", "value": 4096 } with the value as a number or a "0x" string. Use a string for a 64-bit VA.',
		read: (_raw, doc, input) => {
			const headers = unwrap(doc.peFile.headers())
			const imageSize = headers.NtHeaders.OptionalHeader.SizeOfImage
			if (input.kind === undefined) {
				return {
					imageSize,
					fileSize: doc.file.size,
					hint: 'Pass input { kind, value } to convert an address.',
				}
			}
			const kind = input.kind as AddressKind
			if (kind !== 'rva' && kind !== 'va' && kind !== 'fo')
				throw new Error('"kind" must be "rva", "va" or "fo".')
			const value = BigInt(input.value as string | number)
			const rva = addressToRva(doc, { kind, value })
			if (rva >= imageSize)
				throw new Error(`RVA ${hex(rva)} is outside the image, which ends at ${hex(imageSize)}.`)
			const va = doc.peFile.rvaToVa(rva)
			const fo = doc.peFile.rvaToFileOffset(rva)
			return {
				rva,
				rvaHex: hex(rva),
				va: va instanceof Error ? null : hex(va),
				fileOffset: fo instanceof Error ? null : fo,
				fileOffsetHex: fo instanceof Error ? null : hex(fo),
				...(fo instanceof Error
					? { note: 'This RVA has no bytes in the file: the loader fills it with zeros.' }
					: {}),
			}
		},
	},
	'hex-dump': {
		note: 'Bytes of the image as the loader maps it, addressed by RVA. lines are "RVA  16 bytes in hex  ASCII"; the first line holds the requested RVA. `limit` is the number of lines. Read at a later RVA for more.',
		input: rvaInput,
		read: (raw) => {
			const window = raw.state.window as { requestedRva: number; start: number; bytes: Uint8Array }
			// The screen centres its window on the RVA. An agent asked for the RVA, so its lines start there.
			const first = Math.max(0, window.requestedRva - window.start) & ~15
			const bytes = window.bytes.subarray(first)
			return {
				requestedRva: hex(window.requestedRva),
				end: hex(window.start + window.bytes.length),
				lines: hexDumpLines(window.start + first, bytes),
			}
		},
	},
	disasm: {
		note: 'Disassembly (x86 and x64) from an RVA: rows of { rva, at (the RVA in hex), section, bytes, label, mnemonic, operands, comments }. Operands show VAs. Without input it starts at the entry point. `limit` is the number of rows. Read at the RVA after the last row to continue.',
		input: rvaInput,
		read: (raw) => ({
			requestedRva: hex(raw.state.requestedRva),
			rows: (raw.state.rows as { rva: number; operands: string }[]).map((row) => ({
				at: hex(row.rva),
				...row,
				// The screen keeps the space that separates the operands from the mnemonic.
				operands: row.operands.trim(),
			})),
			error: raw.state.error,
		}),
	},
	scanner: {
		note: 'Finds byte patterns in the sections. A pattern is hex bytes such as "55 8B EC"; "?" matches any one byte; "\'" saves the position there, reported in save. Full syntax: https://docs.rs/pelite/latest/pelite/pattern/fn.parse.html. Each match has rva, at (the RVA in hex) and save (the first value is the match itself). Matches are sorted by RVA; when limitReached is true they are the first found, and more exist.',
		input:
			'{ "pattern": "48 83 EC ? E8", "section": 0, "limit": 100 }. section is a zero-based section index; without it the executable sections are scanned. limit is the most matches (default 100; 0 means no limit).',
		read: (raw, doc, input) => {
			const sections = (raw.sections as { Name: string }[]).map((section, index) => ({
				index,
				name: section.Name,
			}))
			if (typeof input.pattern !== 'string' || !input.pattern.trim()) {
				return { sections, hint: 'Pass input { pattern } to scan.' }
			}
			const limit = input.limit === undefined ? 100 : asNumber(input.limit, 'limit')
			const section = input.section === undefined ? undefined : asNumber(input.section, 'section')
			const matches = unwrap(doc.peFile.scannerMatches(input.pattern.trim(), section, { limit }))
			return {
				pattern: input.pattern.trim(),
				scanned: section === undefined ? 'executable sections' : (sections[section]?.name ?? null),
				limitReached: limit > 0 && matches.length >= limit,
				matches: [...matches]
					.sort((a, b) => a.rva - b.rva)
					.map((match) => ({ at: hex(match.rva), ...match })),
			}
		},
	},
}

/** The data of a view for an agent: the view's own reading where it has one, else what the screen shows. */
export function readForAgent(
	id: string,
	raw: unknown,
	doc: PeDocument,
	input: Record<string, unknown>,
): unknown {
	const read = agentViews[id]?.read
	if (read) return read(raw, doc, input)
	if (raw && typeof raw === 'object' && 'state' in raw) {
		// `state` is what the person has typed and selected on the screen, not content of the file.
		const { state: _state, ...content } = raw as Record<string, unknown>
		return content
	}
	return raw
}
