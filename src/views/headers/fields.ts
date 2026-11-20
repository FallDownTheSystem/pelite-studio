import { hexOrZero } from '@/lib/format'
import type { AddressKind } from '@/pe/view'

/** One structure member: its name, the raw value, and what the format says the value means. */
export interface FieldRow {
	field: string
	value: string
	kind?: AddressKind
	/** Decoded meaning in words. */
	meaning?: string
	/** The format's constant name for an enumeration value, shown beside the meaning. */
	constant?: string
	/** Flag names set in a bit field. */
	flags?: string[]
	/** A verdict worth scanning for, like a checksum that does not match. */
	status?: { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
}

/** Header numbers read as hex; zero stays a plain `0`. Strings (versions, GUIDs) pass through. */
export function formatFieldValue(value: unknown): string {
	if (value == null) return ''
	if (typeof value === 'number' || typeof value === 'bigint') return hexOrZero(value)
	if (Array.isArray(value)) return value.map(formatFieldValue).join(' ')
	if (typeof value === 'object') return JSON.stringify(value)
	return String(value)
}

export type Describe<T> = (value: T, field: string) => Omit<FieldRow, 'field' | 'value'> | undefined

/** Turns a parsed structure into rows in member order. `describe` adds the kind and meaning per member. */
export function fieldRows<T extends object>(structure: T, describe?: Describe<T[keyof T]>): FieldRow[] {
	return Object.entries(structure).map(([field, value]) => ({
		field,
		value: formatFieldValue(value),
		...describe?.(value as T[keyof T], field),
	}))
}

/** Address fields that hold zero point nowhere, so they get no address menu. */
export function addressKind(kind: AddressKind, value: unknown): AddressKind | undefined {
	return typeof value === 'number' && value !== 0 ? kind : undefined
}

/** The ASCII text of a little-endian signature, like `MZ` for 0x5a4d. */
export function signatureText(value: number, bytes: number): string {
	let text = ''
	for (let index = 0; index < bytes; index++) text += String.fromCharCode((value >>> (index * 8)) & 0xff)
	return text.replace(/\0+$/, '')
}
