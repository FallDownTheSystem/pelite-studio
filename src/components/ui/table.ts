import type { AddressKind } from '@/pe/view'

export interface Column<Row> {
	/** Unique within the table. Names the `#cell-<key>` slot. */
	key: string
	title: string
	/**
	 * CSS width, like `'8rem'` or `'12ch'`. In a `fill` table every column needs one except
	 * the single column that takes the remaining space.
	 */
	width?: string
	/** Floor for the column that takes the remaining space. */
	minWidth?: string
	/** `end` for sizes and counts that are compared by magnitude. Addresses and names stay at `start`. */
	align?: 'start' | 'end'
	/** Monospace, for addresses, bytes, hashes and identifiers. */
	mono?: boolean
	/** De-emphasized text, for descriptions and secondary detail. */
	muted?: boolean
	/** Lets long text wrap. Only in tables that are not `fill`, where rows may differ in height. */
	wrap?: boolean
	/**
	 * Address space of the cell's number. Marks the cell with `data-kind`, which the workspace
	 * address menu reads to offer "Open in Hex Dump" and "Open in Disassembly".
	 */
	kind?: AddressKind | ((row: Row, index: number) => AddressKind | undefined)
	/** The text the cell shows. `null` and `undefined` render as an empty marker. */
	value: (row: Row, index: number) => string | number | bigint | null | undefined
	/** Makes the column sortable by this value. */
	sortValue?: (row: Row) => string | number | bigint | null | undefined
}

export type SortDirection = 'ascending' | 'descending'

export interface SortState {
	key: string
	direction: SortDirection
}

export function defineColumns<Row>(columns: Column<Row>[]): Column<Row>[] {
	return columns
}

/**
 * A width in rem for a monospace column sized to its longest value, so a fill table opens no
 * wide gap inside it. IBM Plex Mono advances 0.6em, which is 0.45rem a character at the 0.75rem
 * data size, plus 1.5rem of cell padding. The result is at most `room` and at least `min`.
 * An outer column at the page edge gets its extra padding from DataTable, so leave it out here.
 */
export function monoWidth(chars: number, room: number, min: number): number {
	return Math.max(min, Math.min(chars * 0.45 + 1.5, room))
}
