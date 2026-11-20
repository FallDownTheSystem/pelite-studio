import { toRaw } from 'vue'
import { errorMessage, hex } from '@/lib/format'
import type { FactsDatabase, FactsLayer, FactsRow } from '@/pe/facts'
import { downloadText, factKinds } from '@/pe/facts'
import type { Facts } from '@/pe/pelite'
import { unwrap } from '@/pe/pelite'

export const pageSize = 100

/** RVAs are shown with eight digits everywhere in Facts, so columns line up across layers. */
export function rvaText(rva: number): string {
	return hex(rva, 8)
}

export function kindName(kind: string): string {
	return factKinds.find((item) => item.id === kind)?.name ?? kind
}

const layerIds = new WeakMap<FactsLayer, number>()
let nextLayerId = 1

/**
 * Layers have no identity of their own; this one follows the object through moves, so lists
 * keep their elements in place. Undo restores copies, which get new ids.
 */
export function layerId(layer: FactsLayer): number {
	const raw = toRaw(layer)
	let id = layerIds.get(raw)
	if (id === undefined) {
		id = nextLayerId++
		layerIds.set(raw, id)
	}
	return id
}

export function layerLabel(layer: FactsLayer | undefined): string {
	return layer?.label || 'Unnamed layer'
}

/** Free text from a filter field: up to eight hex digits with an optional 0x. */
export function parseRva(text: string): number {
	if (!/^(?:0x)?[\da-f]{1,8}$/i.test(text.trim())) {
		throw new Error('Enter up to 8 hex digits, like 0x1000.')
	}
	return parseInt(text.trim().replace(/^0x/i, ''), 16)
}

/** Sections can be smaller in memory than on disk; the larger extent counts as theirs. */
export function sectionExtent(section: { VirtualSize: number; SizeOfRawData: number }): number {
	return Math.max(section.VirtualSize, section.SizeOfRawData)
}

export function sectionName(db: FactsDatabase, rva: number): string {
	const section = db.headers.SectionHeaders.find(
		(item) => rva >= item.VirtualAddress && rva < item.VirtualAddress + sectionExtent(item),
	)
	if (section) return section.Name
	return rva < db.headers.NtHeaders.OptionalHeader.SizeOfHeaders ? 'Headers' : ''
}

/** Comments are stored as JSON strings; the table shows the text they hold. */
export function payloadText(row: FactsRow): string {
	if (row.kind === 'C') {
		try {
			const text: unknown = JSON.parse(row.payload)
			if (typeof text === 'string') return text
		} catch {
			// A payload that is not a JSON string is shown as stored.
		}
	}
	return row.payload
}

function scratch(db: FactsDatabase): Facts {
	return db.createScratch()
}

export function isDrafting(db: FactsDatabase): boolean {
	return db.editorLayer >= 0 || db.bulk || db.busy
}

export function newLayer(db: FactsDatabase) {
	db.mutate(() => db.append(`Layer ${db.layers.length + 1}`, '#factmap\n'), 'Layer created.')
}

export function duplicateLayer(db: FactsDatabase) {
	const current = db.current
	if (!current) return
	db.mutate(() => db.append(`${current.label} copy`, current.text), 'Layer duplicated.')
}

export function renameLayer(db: FactsDatabase) {
	db.mutate(() => {
		unwrap(db.native.setLayerLabel(db.selected, db.rename))
		db.current!.label = db.rename
	})
}

export function toggleLayer(db: FactsDatabase, index: number) {
	db.mutate(() => {
		db.layers[index].visible = !db.layers[index].visible
	})
}

export function newFact(db: FactsDatabase, kind = 'C') {
	db.resetEditor()
	db.editorLayer = db.selected
	db.editor = factKinds.find((item) => item.id === kind)?.example ?? ''
	if (kind === 'D' && db.pointerWidth === 32) db.editor = db.editor.replace('x86_64', 'x86')
}

export function editFact(db: FactsDatabase, row: FactsRow) {
	db.resetEditor()
	db.editorLayer = row.layer
	db.editIndex = row.index
	db.editor = row.text
}

export function saveFact(db: FactsDatabase) {
	db.mutate(() => {
		const index = db.editorLayer
		if (db.editIndex < 0) {
			unwrap(db.native.addFact(index, db.editor))
			db.layers[index].text = unwrap(db.native.getLayer(index))
		} else {
			// Validate a single record before placing it back in the complete map.
			const check = scratch(db)
			let record: string
			try {
				unwrap(check.addLayer())
				unwrap(check.addFact(0, db.editor))
				record = unwrap(check.getLayer(0)).split('\n')[1]
			} finally {
				check.dispose()
			}
			const records = db.rows(index).map((row) => row.text)
			records[db.editIndex] = record
			db.replace(index, '#factmap\n' + records.join('\n') + '\n')
		}
		db.resetEditor()
	}, 'Fact saved.')
}

export function removeFact(db: FactsDatabase, row: FactsRow) {
	db.mutate(
		() =>
			db.replace(
				row.layer,
				'#factmap\n' +
					db
						.rows(row.layer)
						.filter((item) => item.index !== row.index)
						.map((item) => item.text)
						.join('\n') +
					'\n',
			),
		'Fact removed. Undo to restore it.',
	)
}

export function editLayerText(db: FactsDatabase) {
	db.resetEditor()
	db.bulk = true
	db.bulkLayer = db.selected
	db.bulkText = db.current?.text ?? ''
}

export function saveLayerText(db: FactsDatabase) {
	db.mutate(() => {
		db.replace(db.bulkLayer, db.bulkText)
		db.resetEditor()
	}, 'Layer updated.')
}

export function zoom(db: FactsDatabase, start: number, end: number) {
	db.from = rvaText(start)
	db.to = rvaText(end)
	db.page = 0
}

export function hasFilters(db: FactsDatabase): boolean {
	return !!(db.query || db.kind || db.section || db.from || db.to)
}

export function resetFilters(db: FactsDatabase) {
	db.query = ''
	db.kind = ''
	db.section = ''
	db.from = ''
	db.to = ''
	db.page = 0
}

export function exportFileName(layer: FactsLayer): string {
	return `${layer.label.replace(/[^\w.-]/g, '_') || 'layer'}.factmap`
}

/** Returns the file name it saved, or nothing when it failed (the error is on the database). */
export function exportLayer(db: FactsDatabase): string | undefined {
	const current = db.current
	if (!current) return
	try {
		const name = exportFileName(current)
		downloadText(name, current.text, 'text/plain')
		db.markKept(current.text)
		return name
	} catch (error) {
		db.error = errorMessage(error)
	}
}

export async function importFiles(db: FactsDatabase, files: readonly File[]) {
	if (!files.length || isDrafting(db)) return
	db.busy = true
	try {
		const loaded = await Promise.all(
			files.map(async (file) => ({ file, text: (await file.text()).replace(/^﻿/, '') })),
		)
		if (db.disposed) return
		// Validate the entire batch before adding any layers.
		const check = scratch(db)
		try {
			for (const item of loaded) {
				const result = check.addLayer(item.text)
				if (result instanceof Error) throw new Error(`${item.file.name}: ${result.message}`)
			}
		} finally {
			check.dispose()
		}
		db.mutate(
			() => {
				for (const item of loaded)
					db.append(item.file.name.replace(/\.(?:factmap|symtext|txt)$/i, ''), item.text)
			},
			`${loaded.length} factmap ${loaded.length === 1 ? 'layer' : 'layers'} imported.`,
		)
		// An imported layer is still in the file it came from.
		if (!db.error) for (const layer of db.layers.slice(-loaded.length)) db.markKept(layer.text)
	} catch (error) {
		db.error = errorMessage(error)
	} finally {
		db.busy = false
	}
}
