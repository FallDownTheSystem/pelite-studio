import type { PeHeaders } from '@/pe/pelite'
import type { PeSectionHeader, SectionEntropy } from '@/vendor/pelite/pelite.js'
import type { PeDocument } from '@/pe/document'
import { unwrap } from '@/pe/pelite'
import { otherSectionFlags, sectionContent, sectionExecute, sectionRead, sectionWrite } from './flags'

export interface SectionRow {
	/** One-based, as tools number sections. */
	number: number
	header: PeSectionHeader
	read: boolean
	write: boolean
	execute: boolean
	content: string[]
	/** Flags other than permissions and content, without their `IMAGE_SCN_` prefix. */
	flags: string[]
	entropy: SectionEntropy | undefined
}

/** Reads the section table. Pass headers that were already read to avoid parsing them twice. */
export function readSections(doc: PeDocument, existing?: PeHeaders): SectionRow[] {
	const headers = existing ?? unwrap(doc.peFile.headers())
	const entropy = unwrap(doc.peFile.sectionEntropy())
	const names = headers.details['SectionHeaders.Characteristics'] as string[][] | undefined
	return headers.SectionHeaders.map((header, index) => {
		const flags = header.Characteristics
		return {
			number: index + 1,
			header,
			read: (flags & sectionRead) !== 0,
			write: (flags & sectionWrite) !== 0,
			execute: (flags & sectionExecute) !== 0,
			content: sectionContent(flags),
			flags: otherSectionFlags(names?.[index] ?? []),
			entropy: entropy[index],
		}
	})
}
