<script lang="ts">
import { markRaw, reactive } from 'vue'
import { hex } from '@/lib/format'
import type { PeDocument } from '@/pe/document'
import { unwrap, type PeHeaders } from '@/pe/pelite'
import type { ViewContent } from '@/pe/view'
import { assertImageRva, inputRva, type RvaInput } from './analysis/rva'

export interface HexDumpWindow {
	requestedRva: number
	start: number
	anchor: number
	bytes: Uint8Array
	/** One bit per byte, LSB first: set for a file-backed byte, clear for zero-fill. */
	mask: Uint8Array
}

export interface HexDumpState {
	window: HexDumpWindow
	/** Offset of the inspected byte inside the window. */
	cursor: number
	address: string
	format: 'decimal' | 'hex'
	error: string | undefined
}

export interface HexDumpData {
	doc: PeDocument
	headers: PeHeaders
	state: HexDumpState
}

/** Reads 4 KiB on each side of the requested row, clamped to the image. */
export function readHexDumpWindow(doc: PeDocument, imageSize: number, rva: number): HexDumpWindow {
	assertImageRva(rva, imageSize)
	const anchor = Math.floor(rva / 16) * 16
	const start = Math.max(0, anchor - 0x1000)
	const end = Math.min(imageSize, anchor + 0x1000)
	const length = end - start
	const bytes = unwrap(doc.peFile.hexDumpBytes(start, length))
	const mask = unwrap(doc.peFile.hexDumpMask(start, length))
	return markRaw({ requestedRva: rva, start, anchor, bytes, mask })
}

export function prepare(doc: PeDocument, input?: RvaInput): ViewContent<HexDumpData> {
	const rva = inputRva(doc, input, 0)
	const headers = unwrap(doc.peFile.headers())
	const window = readHexDumpWindow(doc, headers.NtHeaders.OptionalHeader.SizeOfImage, rva)
	const state = reactive<HexDumpState>({
		window,
		cursor: rva - window.start,
		address: hex(rva),
		format: 'decimal',
		error: undefined,
	})
	return {
		data: { doc, headers, state },
		get titleSuffix() {
			return hex(state.window.requestedRva)
		},
		get duplicateData() {
			return { rva: state.window.requestedRva }
		},
	}
}
</script>

<script setup lang="ts">
import { useWorkspace } from '@/pe/view'
import { Button } from '@ui-sdk/vue/button'
import { byteSize } from '@/lib/format'
import ByteInspector from './analysis/ByteInspector.vue'
import GoToForm from './analysis/GoToForm.vue'
import { createMark, escapeHtml } from './analysis/html'
import { parseRvaText, rvaFormatMessage, sectionAt } from './analysis/rva'

const props = defineProps<{ data: HexDumpData }>()

const state = props.data.state
const dump = useTemplateRef<HTMLElement>('dump')
const inspector = useTemplateRef<InstanceType<typeof ByteInspector>>('inspector')

const imageSize = props.data.headers.NtHeaders.OptionalHeader.SizeOfImage

const columnHeader = '00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F'

const range = computed(() => {
	const { start, bytes } = state.window
	return `${hex(start, 8)} to ${hex(start + bytes.length - 1, 8)} (${byteSize(bytes.length)})`
})

function backed(offset: number): boolean {
	const mask = state.window.mask
	return !!(mask[Math.floor(offset / 8)] & (1 << (offset % 8)))
}

const hexDigits = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0').toUpperCase())

/** Brighter for higher byte values, as pelite's CLI dump does, so runs and padding stand out. */
function tone(byte: number): string {
	return byte === 0 ? 'tone-0' : byte < 0x40 ? 'tone-1' : byte < 0xc0 ? 'tone-2' : 'tone-3'
}

/**
 * The whole window as one HTML string. Built by hand, the 8 KiB window is about 9,000 elements
 * that the browser parses in a few milliseconds, where rendering them as Vue nodes took over
 * a hundred and made every caret move re-render all of them. It depends on the window only:
 * the caret mark and the hover twin are set on the elements directly.
 */
const listing = computed(() => {
	const { start, bytes, requestedRva } = state.window
	const requested = requestedRva - start
	const headers = props.data.headers
	const parts: string[] = []
	for (let offset = 0; offset < bytes.length; offset += 16) {
		const rva = start + offset
		const section = escapeHtml(sectionAt(headers, rva))
		const last = Math.min(offset + 16, bytes.length) - 1
		let hexPart = ''
		let asciiPart = ''
		for (let index = offset; index <= last; index++) {
			const byte = bytes[index]
			const file = backed(index)
			const marks = `${file ? tone(byte) : 'tone-fill'}${index === requested ? ' requested' : ''}`
			const gap = index === last ? '' : index % 16 === 7 ? '  ' : ' '
			const char = !file ? ' ' : byte >= 32 && byte <= 126 ? escapeHtml(String.fromCharCode(byte)) : '.'
			hexPart += `<span data-offset="${index}" class="byte ${marks}">${file ? hexDigits[byte] : '??'}${gap}</span>`
			asciiPart += `<span data-offset="${index}" class="char ${marks}">${char}</span>`
		}
		parts.push(
			`<div class="hex-row grid grid-cols-[8ch_10ch_48ch_16ch] gap-3 px-3" data-rva="${rva}">` +
				`<span class="truncate text-secondary" contenteditable="false" title="${section}">${section}</span>` +
				`<span class="text-secondary" data-kind="rva" contenteditable="false">${hex(rva, 8)}</span>` +
				`<span class="whitespace-pre" data-col="bytes">${hexPart}</span>` +
				`<span class="whitespace-pre" data-col="ascii">${asciiPart}</span>` +
				'</div>',
		)
	}
	return parts.join('')
})

const markCursor = createMark('cursor')
const markTwin = createMark('twin')

watch(
	() => [state.cursor, listing.value],
	() => markCursor(() => dump.value?.querySelectorAll(`[data-offset="${state.cursor}"]`)),
	{ flush: 'post' },
)

/** Hovering a byte marks its twin in the other column. */
function hoverByte(event: MouseEvent) {
	const byte = (event.target as Element).closest?.('[data-offset]')
	const row = byte?.closest('.hex-row')
	const offset = byte?.getAttribute('data-offset')
	markTwin(() => (row ? row.querySelectorAll(`[data-offset="${offset}"]`) : undefined))
}

function go() {
	const rva = parseRvaText(state.address)
	if (rva === null) {
		state.error = rvaFormatMessage
		return
	}
	if (loadWindow(rva)) void nextTick(() => scrollToCursor())
}

function loadWindow(rva: number): boolean {
	try {
		const window = readHexDumpWindow(props.data.doc, imageSize, rva)
		state.window = window
		state.cursor = rva - window.start
		state.error = undefined
		return true
	} catch (error) {
		state.error = error instanceof Error ? error.message : String(error)
		return false
	}
}

type Column = 'bytes' | 'ascii'
interface CaretPoint {
	rva: number
	column: Column
	/** Characters from the start of the row's column text. */
	position: number
}

function columnOf(node: Node | null): HTMLElement | null {
	const element = node instanceof Element ? node : node?.parentElement
	const column = element?.closest<HTMLElement>('[data-col]')
	return column && dump.value?.contains(column) ? column : null
}

/**
 * Enter moves the window so the caret's byte is in its middle. Vue may replace the byte
 * spans when the window shifts, so the selection is kept as positions in the row text.
 */
function recenter() {
	const selection = document.getSelection()
	if (!selection || !dump.value) return
	const capture = (node: Node | null, offset: number): CaretPoint | undefined => {
		const column = columnOf(node)
		if (!node || !column) return
		const range = document.createRange()
		range.selectNodeContents(column)
		range.setEnd(node, offset)
		const byte = column.querySelector('[data-offset]')
		return {
			rva: state.window.start + Number(byte?.getAttribute('data-offset')),
			column: column.dataset.col as Column,
			position: range.toString().length,
		}
	}
	const anchor = capture(selection.anchorNode, selection.anchorOffset)
	const focus = capture(selection.focusNode, selection.focusOffset)
	if (!focus) return
	selectionChanged()
	const rva = state.window.start + state.cursor
	if (!loadWindow(rva)) return
	state.address = hex(rva)
	void nextTick(() => {
		const restore = (point: CaretPoint | undefined): [Node, number] | undefined => {
			if (!point || !dump.value) return
			const column = dump.value.querySelector(
				`[data-col="${point.column}"] > [data-offset="${point.rva - state.window.start}"]`,
			)?.parentElement
			if (!column) return
			const walker = document.createTreeWalker(column, NodeFilter.SHOW_TEXT)
			let remaining = point.position
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				const length = (node as Text).data.length
				if (remaining <= length) return [node, remaining]
				remaining -= length
			}
		}
		const end = restore(focus)
		const start = restore(anchor) ?? end
		if (start && end) selection.setBaseAndExtent(start[0], start[1], end[0], end[1])
		scrollToCursor(focus.column)
	})
}

function scrollToCursor(column: Column = 'bytes') {
	dump.value
		?.querySelector(`[data-col="${column}"] > [data-offset="${state.cursor}"]`)
		?.scrollIntoView({ block: 'center', inline: 'nearest' })
}

/** Follows the caret without changing the selection. */
function selectionChanged() {
	if (!dump.value?.contains(document.activeElement)) return
	const selection = document.getSelection()
	const node = selection?.focusNode
	if (!node || !selection) return
	const column = columnOf(node)
	if (!column) return
	const range = document.createRange()
	range.selectNodeContents(column)
	range.setEnd(node, selection.focusOffset)
	const position = range.toString().length
	const bytes = column.querySelectorAll('[data-offset]')
	if (column.dataset.col === 'ascii') {
		const byte = bytes[Math.min(position, bytes.length - 1)]
		if (byte) state.cursor = Number(byte.getAttribute('data-offset'))
		return
	}
	let start = 0
	for (const byte of bytes) {
		// The caret at the end of a byte belongs to that byte; after its space, to the next one.
		if (position <= start + 2 || byte === bytes[bytes.length - 1]) {
			state.cursor = Number(byte.getAttribute('data-offset'))
			return
		}
		start += byte.textContent?.length ?? 0
	}
}

function inspectByte() {
	inspector.value?.reveal()
}

const workspace = useWorkspace()

/** The workspace menu leaves editable regions to the browser, so the address cells open it here. */
function openAddressMenu(event: MouseEvent) {
	const cell = (event.target as Element).closest?.('[data-kind="rva"]')
	const row = cell?.closest<HTMLElement>('.hex-row')
	if (event.ctrlKey || !cell || !row) return
	const rva = Number(row.dataset.rva)
	event.preventDefault()
	event.stopPropagation()
	const fromKeyboard = event.clientX === 0 && event.clientY === 0
	workspace.showAddressMenu(fromKeyboard ? cell : { x: event.clientX, y: event.clientY }, {
		kind: 'rva',
		value: rva,
	})
}

useEventListener(document, 'selectionchange', selectionChanged)
onMounted(() => {
	markCursor(() => dump.value?.querySelectorAll(`[data-offset="${state.cursor}"]`))
	scrollToCursor()
})
</script>

<template>
	<ViewPage
		title="Hex dump"
		fill
		description="The virtual image byte by byte. Put the caret on a byte to inspect it; press Enter to center the dump on it. ?? marks zero-fill: bytes the image has but the file does not store."
	>
		<template #toolbar>
			<GoToForm v-model="state.address" :error="state.error" @submit="go">
				<Button type="button" class="@5xl:hidden" @click="inspectByte">Inspect byte</Button>
				<p class="text-caption text-secondary">
					Showing <span class="num font-mono text-data text-primary" translate="no">{{ range }}</span>
				</p>
			</GoToForm>
		</template>
		<div class="scroll-thin min-h-0 flex-1 overflow-auto">
			<div
				class="grid w-max min-w-full content-start items-start gap-x-8 gap-y-6 p-4 @2xl:px-6 @5xl:grid-cols-[max-content_minmax(14rem,18rem)]"
			>
				<ByteInspector
					ref="inspector"
					:doc="data.doc"
					:state="state"
					:backed="backed"
					class="max-w-[calc(100cqi-2rem)] @5xl:sticky @5xl:top-0 @5xl:col-start-2 @5xl:row-start-1 @5xl:max-w-none"
				/>
				<div class="num font-mono text-data @5xl:col-start-1 @5xl:row-start-1" translate="no">
					<div
						class="sticky top-0 z-10 grid h-8 grid-cols-[8ch_10ch_48ch_16ch] items-center gap-3 border-b border-default bg-surface px-3 font-sans text-caption font-medium text-secondary"
						aria-hidden="true"
					>
						<span>Section</span>
						<span>RVA</span>
						<span class="font-mono text-data whitespace-pre">{{ columnHeader }}</span>
						<span>ASCII</span>
					</div>
					<!-- The rows come from `listing`, built from parser bytes with every text escaped. -->
					<div
						ref="dump"
						class="hex-dump cursor-text py-1 whitespace-nowrap focus-visible:-outline-offset-2"
						contenteditable="true"
						role="textbox"
						aria-label="Hex dump"
						aria-readonly="true"
						aria-multiline="true"
						spellcheck="false"
						@keydown.enter.prevent="recenter"
						@beforeinput.prevent
						@paste.prevent
						@drop.prevent
						@contextmenu="openAddressMenu"
						@mouseover="hoverByte"
						@mouseleave="markTwin(() => undefined)"
						v-html="listing"
					></div>
				</div>
			</div>
		</div>
	</ViewPage>
</template>

<style scoped>
/*
 * A tab that is leaving is made inert before it is hidden, and inert makes the browser restyle
 * every element under it: thousands here, close to a hundred milliseconds on each switch.
 * Skipping the listing's contents while its own tab panel is inert keeps the switch cheap. Only
 * the panel's own inert counts, so the listing stays drawn behind a modal dialog.
 */
.hex-dump {
	/* Keeps its size while skipped, so the scroll position survives the switch. */
	contain-intrinsic-size: auto none;
}

[data-slot='tabs-panel'][inert] .hex-dump {
	content-visibility: hidden;
}

/*
 * The rows come from v-html, so they carry no scope attribute: every rule reaches them
 * through :deep() under the dump.
 *
 * Rows have one fixed height, so the browser can skip style, layout and paint for every row
 * off screen and keep its place. Selection, find and the caret still reach those rows.
 */
.hex-dump :deep(.hex-row) {
	content-visibility: auto;
	contain-intrinsic-size: auto 1.25rem;
}

.hex-dump :deep(:is(.byte, .char)) {
	--mark: transparent;
	scroll-margin-block: 2.5rem;
}

/* Only the two digits get the mark, not the spaces after them. */
.hex-dump :deep(.byte) {
	background: linear-gradient(var(--mark), var(--mark)) 0 0 / 2ch 100% no-repeat;
}

.hex-dump :deep(.char) {
	background: var(--mark);
}

.hex-dump :deep(.tone-0) {
	color: var(--text-color-secondary);
}

.hex-dump :deep(.tone-1) {
	color: color-mix(in oklab, var(--text-color-primary) 40%, var(--text-color-secondary));
}

.hex-dump :deep(.tone-2) {
	color: color-mix(in oklab, var(--text-color-primary) 70%, var(--text-color-secondary));
}

.hex-dump :deep(.tone-3) {
	color: var(--text-color-primary);
}

.hex-dump :deep(.tone-fill) {
	color: var(--text-color-disabled);
}

.hex-dump :deep(.requested) {
	--mark: var(--color-accent-subtle);
}

.hex-dump :deep(.cursor) {
	position: relative;
}

.hex-dump :deep(.cursor)::before {
	content: '';
	position: absolute;
	inset-inline-start: -2px;
	inset-block: 3px;
	width: 1px;
	background: var(--color-accent);
	pointer-events: none;
}

.hex-dump :deep(.twin) {
	--mark: var(--background-color-pressed);
}
</style>
