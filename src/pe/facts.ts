import { markRaw } from 'vue'
import type { Facts, PeFile, PeHeaders, Pelite } from './pelite'
import { unwrap } from './pelite'

export interface FactsLayer {
	label: string
	visible: boolean
	text: string
}

export interface FactsSnapshot {
	layers: FactsLayer[]
	selected: number
}

export interface FactsRow {
	index: number
	layer: number
	kind: string
	rva: number
	payload: string
	text: string
}

export const factKinds = [
	{ id: 'S', name: 'Symbol', example: 'Sx1000 code "entry"' },
	{ id: 'C', name: 'Comment', example: 'Cx1000 "Entry point"' },
	{ id: 'R', name: 'Reference', example: 'Rx1000 0x2000' },
	{ id: 'F', name: 'Function', example: 'Fx1000 {"bytes":32}' },
	{ id: 'D', name: 'Decode', example: 'Dx1000 x86_64 32' },
	{ id: 'A', name: 'Alignment', example: 'Ax100e 4' },
] as const

const historyLimit = 40

/** Owns native storage for one open image. UI caches contain canonical native output only. */
export class FactsDatabase {
	private readonly Facts: Pelite['Facts']
	native: Facts
	disposed = false
	busy = false
	readonly headers: PeHeaders
	readonly pointerWidth: 32 | 64
	layers: FactsLayer[] = []
	selected = 0
	past: FactsSnapshot[] = []
	future: FactsSnapshot[] = []
	/**
	 * Layer texts that also exist outside this tab: an empty layer, an exported one, an imported one.
	 * Facts live in memory only, so a layer whose text is not here is lost when the file closes.
	 */
	private readonly kept = new Set<string>()
	error = ''
	notice = ''
	query = ''
	kind = ''
	mode = 'inspect'
	section = ''
	from = ''
	to = ''
	page = 0
	editor = ''
	editIndex = -1
	editorLayer = -1
	bulk = false
	bulkText = ''
	bulkLayer = -1
	rename = ''

	constructor(peFile: PeFile, FactsClass: Pelite['Facts']) {
		this.Facts = markRaw(FactsClass)
		this.headers = unwrap(peFile.headers())
		this.pointerWidth = this.headers.NtHeaders.OptionalHeader.Magic === 0x20b ? 64 : 32
		this.native = markRaw(new this.Facts(this.pointerWidth))
		this.mutate(() => this.append('Notes', '#factmap\n'))
		this.past = []
		for (const layer of this.layers) this.kept.add(layer.text)
	}

	dispose() {
		this.disposed = true
		this.native.dispose()
	}

	/** Records that this layer text is in a file, after an export or an import. */
	markKept(text: string) {
		this.kept.add(text)
	}

	/** True when closing the file would lose facts of this layer. */
	isUnsaved(layer: FactsLayer): boolean {
		return !this.kept.has(layer.text)
	}

	get dirty(): boolean {
		return this.layers.some((layer) => this.isUnsaved(layer)) || this.editorLayer >= 0 || this.bulk
	}

	get current(): FactsLayer | undefined {
		return this.layers[this.selected]
	}

	snapshot(): FactsSnapshot {
		return { selected: this.selected, layers: this.layers.map((layer) => ({ ...layer })) }
	}

	signature(): string {
		return JSON.stringify(this.layers)
	}

	/** An empty handle of the same kind, for checking records without touching the live layers. The caller frees it. */
	createScratch(): Facts {
		return new this.Facts(this.pointerWidth)
	}

	/** Prepare a separate handle so failed imports/restores never partially mutate live data. */
	restore(snapshot: FactsSnapshot) {
		const native = markRaw(new this.Facts(this.pointerWidth))
		try {
			for (const layer of snapshot.layers) {
				const index = unwrap(native.addLayer(layer.text))
				unwrap(native.setLayerLabel(index, layer.label))
			}
		} catch (error) {
			native.dispose()
			throw error
		}
		this.native.dispose()
		this.native = native
		this.layers = snapshot.layers.map((layer, index) => ({
			...layer,
			text: unwrap(native.getLayer(index)),
		}))
		this.selected = Math.max(0, Math.min(snapshot.selected, this.layers.length - 1))
		this.resetEditor()
		this.rename = this.current?.label ?? ''
		this.page = 0
	}

	mutate(operation: () => void, message = '') {
		const before = this.snapshot()
		try {
			operation()
			if (JSON.stringify(before.layers) !== this.signature()) {
				this.past.push(before)
				if (this.past.length > historyLimit) this.past.shift()
				this.future = []
			}
			this.error = ''
			this.notice = message
			this.page = 0
			this.rename = this.current?.label ?? ''
		} catch (error) {
			this.error = error instanceof Error ? error.message : String(error)
		}
	}

	undo(redo = false) {
		const source = redo ? this.future : this.past
		const target = redo ? this.past : this.future
		const snapshot = source.at(-1)
		if (!snapshot) return
		const current = this.snapshot()
		try {
			this.restore(snapshot)
			source.pop()
			target.push(current)
			this.error = ''
			this.notice = redo ? 'Redone.' : 'Undone.'
		} catch (error) {
			this.error = String(error)
		}
	}

	append(label: string, text: string) {
		const index = unwrap(this.native.addLayer(text))
		unwrap(this.native.setLayerLabel(index, label))
		this.layers.push({ label, visible: true, text: unwrap(this.native.getLayer(index)) })
		this.selected = index
	}

	/** Stage a validated layer before replacing the original at the same index. */
	replace(index: number, text: string) {
		const layer = this.layers[index]
		if (!Number.isInteger(index) || !layer) throw new Error('Layer index out of bounds.')
		const label = unwrap(this.native.getLayerLabel(index))
		const replacement = unwrap(this.native.addLayer(text))
		let moved = false
		let canonical: string
		try {
			unwrap(this.native.setLayerLabel(replacement, label))
			canonical = unwrap(this.native.getLayer(replacement))
			unwrap(this.native.shiftLayer(replacement, index))
			moved = true
			// Moving the replacement before the original shifts the original by one.
			unwrap(this.native.deleteLayer(index + 1))
		} catch (error) {
			// Remove the staged layer if preparation or the swap fails.
			unwrap(this.native.deleteLayer(moved ? index : replacement))
			throw error
		}
		layer.text = canonical
	}

	/**
	 * Canonical records have one line each, even with escaped newlines inside strings.
	 * Parsing here is presentation only; WASM validates all incoming data.
	 */
	rows(layer: number): FactsRow[] {
		const lines = this.layers[layer]?.text.split('\n').slice(1).filter(Boolean) ?? []
		return lines.map((text, index) => {
			const match = /^([SCFRDA])x([\da-f]+)\s+(.*)$/i.exec(text)
			if (!match) throw new Error('Unsupported canonical fact record.')
			return { index, layer, kind: match[1], rva: parseInt(match[2], 16), payload: match[3], text }
		})
	}

	resetEditor() {
		this.editor = ''
		this.editIndex = -1
		this.editorLayer = -1
		this.bulk = false
		this.bulkText = ''
		this.bulkLayer = -1
	}

	select(index: number) {
		this.selected = index
		this.rename = this.current?.label ?? ''
		this.page = 0
	}

	move(delta: number) {
		this.mutate(() => {
			const from = this.selected
			const to = from + delta
			unwrap(this.native.shiftLayer(from, to))
			const [layer] = this.layers.splice(from, 1)
			this.layers.splice(to, 0, layer)
			this.selected = to
		}, 'Layer moved.')
	}

	removeLayer(index: number) {
		this.mutate(() => {
			unwrap(this.native.deleteLayer(index))
			this.layers.splice(index, 1)
			this.selected = Math.max(0, Math.min(index, this.layers.length - 1))
		}, 'Layer deleted. Undo to restore it.')
	}

	mergeDown() {
		this.mutate(() => {
			const source = this.selected
			const base = source - 1
			unwrap(this.native.mergeLayer(base, source))
			this.layers[base].text = unwrap(this.native.getLayer(base))
			this.layers.splice(source, 1)
			this.selected = base
		}, 'Records appended to the preceding layer.')
	}
}

export function downloadText(name: string, text: string, type: string) {
	const url = URL.createObjectURL(new Blob([text], { type }))
	const link = document.createElement('a')
	link.href = url
	link.download = name
	link.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}
