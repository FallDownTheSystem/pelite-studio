import { hex } from '@/lib/format'
import type { PeDocument } from '@/pe/document'
import type { PeHeaders } from '@/pe/pelite'
import { addressToRva, type AddressValue } from '@/pe/view'

/** What the address menu and duplicated tabs pass to Hex Dump and Disassembly. */
export interface RvaInput {
	rva?: number
	address?: AddressValue
}

export function inputRva(doc: PeDocument, input: RvaInput | undefined, fallback: number): number {
	if (input?.address) return addressToRva(doc, input.address)
	return input?.rva ?? fallback
}

export const rvaFormatMessage = 'Enter an RVA in decimal or as hex with 0x, such as 0x1000.'

/** Reads the "Go to" field: plain decimal or `0x` hex, nothing else. */
export function parseRvaText(text: string): number | null {
	const trimmed = text.trim()
	if (!/^(?:0x[\da-f]+|\d+)$/i.test(trimmed)) return null
	return Number(trimmed)
}

/** Both viewers read the virtual image, so an RVA at or past SizeOfImage has nothing to show. */
export function assertImageRva(rva: number, imageSize: number) {
	if (Number.isInteger(rva) && rva >= 0 && rva < imageSize) return
	const shown = Number.isInteger(rva) && rva >= 0 ? `RVA ${hex(rva)}` : 'This RVA'
	throw new Error(`${shown} is outside the image. Enter an RVA below ${hex(imageSize)} (SizeOfImage).`)
}

/** The section that holds an RVA, "Headers" before the first one, or "-" in a gap. */
export function sectionAt(headers: PeHeaders, rva: number): string {
	const section = headers.SectionHeaders.find(
		(header) => rva >= header.VirtualAddress && rva < header.VirtualAddress + header.VirtualSize,
	)
	if (section) return section.Name
	return rva < headers.NtHeaders.OptionalHeader.SizeOfHeaders ? 'Headers' : '-'
}
