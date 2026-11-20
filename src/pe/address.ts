import { hex } from '@/lib/format'
import { canDisassemble } from './describe'
import type { PeDocument } from './document'
import { addressToRva, type AddressKind } from './view'

export const addressKindNames: Record<AddressKind, string> = {
	rva: 'RVA',
	va: 'VA',
	fo: 'file offset',
}

export interface AddressTarget {
	/** How the number was read to reach this place in the image. */
	kind: AddressKind
	rva: number
	/** Registry id of the view that can show it. */
	viewer: 'hex-dump' | 'disasm'
	viewerTitle: string
}

/** Parses `0x1f40` as hex and `8000` as decimal. Anything else is not a number. */
export function parseAddress(text: string): bigint | null {
	const trimmed = text.trim().replaceAll('_', '')
	if (!/^(?:0x[\da-f]+|\d+)$/i.test(trimmed)) return null
	try {
		return BigInt(trimmed)
	} catch {
		return null
	}
}

/**
 * Every place in the image a number can point to. With `kinds` left out the number is tried
 * as an RVA, a VA and a file offset, because a bare number does not say which it is.
 */
export function addressTargets(
	doc: PeDocument,
	value: bigint,
	kinds: readonly AddressKind[] = ['rva', 'va', 'fo'],
): AddressTarget[] {
	const headers = doc.peFile.headers()
	if (headers instanceof Error) return []
	const imageSize = headers.NtHeaders.OptionalHeader.SizeOfImage
	const disassembles = canDisassemble(headers)
	const targets: AddressTarget[] = []
	for (const kind of kinds) {
		// The parser takes a u64 for a VA; an RVA or a file offset must fit in 32 bits.
		if (value < 0n || value > (kind === 'va' ? 0xffffffffffffffffn : 0xffffffffn)) continue
		let rva: number
		try {
			rva = addressToRva(doc, { kind, value })
		} catch {
			// This reading does not land in the virtual image.
			continue
		}
		if (rva < 0 || rva >= imageSize) continue
		targets.push({ kind, rva, viewer: 'hex-dump', viewerTitle: 'Hex dump' })
		if (disassembles) targets.push({ kind, rva, viewer: 'disasm', viewerTitle: 'Disassembly' })
	}
	return targets
}

/** "RVA 0x1000", or "VA 0x140001000 (RVA 0x1000)" when the reading needed a conversion. */
export function describeTarget(target: AddressTarget, value: bigint): string {
	const read = `${addressKindNames[target.kind]} ${hex(value)}`
	return target.kind === 'rva' ? read : `${read} (RVA ${hex(target.rva)})`
}
