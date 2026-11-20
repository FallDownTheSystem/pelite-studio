<script lang="ts">
import { reactive } from 'vue'
import { hex } from '@/lib/format'
import type { PeDocument } from '@/pe/document'
import { unwrap, type PeHeaders } from '@/pe/pelite'
import type { ViewContent } from '@/pe/view'
import { assertImageRva, inputRva, sectionAt, type RvaInput } from './analysis/rva'

export interface DisasmRow {
	rva: number
	section: string
	bytes: string
	label: string | null
	mnemonic: string
	/** The rest of the parser's instruction text, including the space after the mnemonic. */
	operands: string
	comments: string
}

export interface DisasmState {
	rows: DisasmRow[]
	requestedRva: number
	/** RVA of the instruction under the caret. */
	cursor: number
	address: string
	error: string | undefined
}

export interface DisasmData {
	doc: PeDocument
	headers: PeHeaders
	state: DisasmState
}

const prefixes = new Set([
	'lock',
	'rep',
	'repe',
	'repz',
	'repne',
	'repnz',
	'xacquire',
	'xrelease',
	'bnd',
	'notrack',
])

/** Splits off the mnemonic, with any prefix before it, so the text joins back unchanged. */
function splitInstruction(text: string): { mnemonic: string; operands: string } {
	const pattern = /^\s*(\S+)/
	let end = 0
	let match = pattern.exec(text)
	while (match) {
		end += match[0].length
		if (!prefixes.has(match[1])) break
		match = pattern.exec(text.slice(end))
	}
	return { mnemonic: text.slice(0, end), operands: text.slice(end) }
}

export function readDisasmWindow(doc: PeDocument, headers: PeHeaders, rva: number): DisasmRow[] {
	const imageSize = headers.NtHeaders.OptionalHeader.SizeOfImage
	assertImageRva(rva, imageSize)
	const bytes = unwrap(doc.peFile.sliceBytes(rva))
	// Start exactly at the requested instruction: x86 has no fixed alignment,
	// so decoding from an arbitrary earlier byte can change all boundaries.
	const end = Math.min(rva + 0x1000, rva + bytes.length, imageSize)
	const instructions = unwrap(doc.peFile.disasm(rva, end))
	let address = rva
	return instructions.map((instruction) => {
		const at = address
		address += instruction.bytes.length
		return {
			rva: at,
			section: sectionAt(headers, at),
			bytes: instruction.bytes.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' '),
			label: instruction.label,
			...splitInstruction(instruction.instruction),
			comments: instruction.comments.join('; '),
		}
	})
}

export function prepare(doc: PeDocument, input?: RvaInput): ViewContent<DisasmData> {
	const headers = unwrap(doc.peFile.headers())
	const rva = inputRva(doc, input, headers.NtHeaders.OptionalHeader.AddressOfEntryPoint)
	const state = reactive<DisasmState>({
		rows: readDisasmWindow(doc, headers, rva),
		requestedRva: rva,
		cursor: rva,
		address: hex(rva),
		error: undefined,
	})
	return {
		data: { doc, headers, state },
		get titleSuffix() {
			return hex(state.requestedRva)
		},
		get duplicateData() {
			return { rva: state.requestedRva }
		},
	}
}

/** The decoder handles x86 and x64 machine code only. */
export function isAvailable(doc: PeDocument, headers?: PeHeaders): boolean {
	const machine = headers?.NtHeaders.FileHeader.Machine ?? unwrapMachine(doc)
	return machine === 0x14c || machine === 0x8664
}

function unwrapMachine(doc: PeDocument): number | undefined {
	const header = doc.peFile.fileHeader()
	return header instanceof Error ? undefined : header.Machine
}
</script>

<script setup lang="ts">
import { useWorkspace } from '@/pe/view'
import { count } from '@/lib/format'
import GoToForm from './analysis/GoToForm.vue'
import { createMark, escapeHtml } from './analysis/html'
import { parseRvaText, rvaFormatMessage } from './analysis/rva'

const props = defineProps<{ data: DisasmData }>()

const state = props.data.state
const dump = useTemplateRef<HTMLElement>('dump')

const summary = computed(() => {
	const rows = state.rows
	const last = rows[rows.length - 1]
	if (!last) return undefined
	return {
		count: `${count(rows.length)} ${rows.length === 1 ? 'instruction' : 'instructions'}`,
		range: `${hex(rows[0].rva, 8)} to ${hex(last.rva, 8)}`,
	}
})

/**
 * The whole listing as one HTML string. About 8,000 elements as Vue nodes took near a hundred
 * milliseconds to create and were all re-rendered on every caret move; parsed from a string
 * they cost a few. The caret mark is set on the element directly.
 */
const listing = computed(() =>
	state.rows
		.map((row) => {
			const label = row.label
				? `<span class="col-span-full pt-2 font-medium wrap-anywhere whitespace-pre-wrap text-primary" contenteditable="false">${escapeHtml(row.label)}:</span>`
				: ''
			const section = escapeHtml(row.section)
			const operands = row.operands ? `<span class="text-secondary">${escapeHtml(row.operands)}</span>` : ''
			const comments = row.comments
				? `<span class="wrap-anywhere whitespace-pre-wrap text-secondary" data-col="comments">; ${escapeHtml(row.comments)}</span>`
				: ''
			return (
				`<div data-rva="${row.rva}" class="disasm-grid px-3 hover:bg-hover">${label}` +
				`<span class="truncate text-secondary" contenteditable="false" title="${section}">${section}</span>` +
				`<span class="text-secondary" data-col="rva" data-kind="rva" contenteditable="false">${hex(row.rva, 8)}</span>` +
				`<span class="hidden whitespace-pre-wrap text-secondary @lg:block" data-col="bytes">${escapeHtml(row.bytes)}</span>` +
				'<span class="flex min-w-0 flex-wrap gap-x-4">' +
				`<span class="wrap-anywhere whitespace-pre-wrap" data-col="instruction"><span class="mnemonic text-primary">${escapeHtml(row.mnemonic)}</span>${operands}</span>` +
				`${comments}</span></div>`
			)
		})
		.join(''),
)

const markCursor = createMark('cursor')

function markCaret() {
	markCursor(() => dump.value?.querySelectorAll(`[data-rva="${state.cursor}"] > [data-col="rva"]`))
}

watch(() => [state.cursor, listing.value], markCaret, { flush: 'post' })
onMounted(markCaret)

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
		state.rows = readDisasmWindow(props.data.doc, props.data.headers, rva)
		state.requestedRva = rva
		state.cursor = rva
		state.error = undefined
		return true
	} catch (error) {
		state.error = error instanceof Error ? error.message : String(error)
		return false
	}
}

function rowOf(node: Node | null): HTMLElement | null {
	const element = node instanceof Element ? node : node?.parentElement
	const row = element?.closest<HTMLElement>('[data-rva]')
	return row && dump.value?.contains(row) ? row : null
}

function selectionChanged() {
	if (!dump.value?.contains(document.activeElement)) return
	const row = rowOf(document.getSelection()?.focusNode ?? null)
	if (row) state.cursor = Number(row.dataset.rva)
}

interface CaretPoint {
	rva: number
	column: string
	offset: number
}

/** Enter decodes again from the caret's instruction and puts the selection back where it was. */
function recenter() {
	const selection = document.getSelection()
	if (!selection) return
	const capture = (node: Node | null, offset: number): CaretPoint | undefined => {
		const element = node instanceof Element ? node : node?.parentElement
		const column = element?.closest<HTMLElement>('[data-col]')
		const row = rowOf(column ?? null)
		if (!node || !column || !row) return
		const range = document.createRange()
		range.selectNodeContents(column)
		range.setEnd(node, offset)
		return { rva: Number(row.dataset.rva), column: column.dataset.col ?? '', offset: range.toString().length }
	}
	const anchor = capture(selection.anchorNode, selection.anchorOffset)
	const focus = capture(selection.focusNode, selection.focusOffset)
	if (!focus || !loadWindow(focus.rva)) return
	state.address = hex(focus.rva)
	void nextTick(() => {
		const restore = (point: CaretPoint | undefined): [Node, number] | undefined => {
			if (!point || !dump.value) return
			const column = dump.value.querySelector(`[data-rva="${point.rva}"] [data-col="${point.column}"]`)
			if (!column) return
			const walker = document.createTreeWalker(column, NodeFilter.SHOW_TEXT)
			let remaining = point.offset
			let last: [Node, number] | undefined
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				const length = (node as Text).data.length
				if (remaining <= length) return [node, remaining]
				remaining -= length
				last = [node, length]
			}
			return last
		}
		const end = restore(focus)
		const start = restore(anchor) ?? end
		if (start && end) selection.setBaseAndExtent(start[0], start[1], end[0], end[1])
		scrollToCursor(focus.column)
	})
}

function scrollToCursor(column = 'rva') {
	dump.value
		?.querySelector(`[data-rva="${state.cursor}"] [data-col="${column}"]`)
		?.scrollIntoView({ block: 'start', inline: 'nearest' })
}

const workspace = useWorkspace()

/** The workspace menu leaves editable regions to the browser, so the address cells open it here. */
function openAddressMenu(event: MouseEvent) {
	const cell = (event.target as Element).closest?.('[data-kind="rva"]')
	const row = cell?.closest<HTMLElement>('[data-rva]')
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
</script>

<template>
	<ViewPage
		title="Disassembly"
		fill
		description="Decodes up to 4 KiB of x86 or x64 instructions from an RVA. Put the caret in an instruction and press Enter to decode from there."
	>
		<template #toolbar>
			<GoToForm v-model="state.address" :error="state.error" @submit="go">
				<p v-if="summary" class="text-caption text-secondary">
					{{ summary.count }} from
					<span class="num font-mono text-data text-primary" translate="no">{{ summary.range }}</span>
				</p>
			</GoToForm>
		</template>
		<EmptyState v-if="!state.rows.length" title="No instructions decoded here">
			The decoder found no complete instruction at {{ hex(state.requestedRva) }}. Try an RVA inside a code
			section.
		</EmptyState>
		<div v-else class="scroll-thin min-h-0 flex-1 overflow-auto">
			<div class="listing num min-w-max p-4 font-mono text-data @2xl:px-6" translate="no">
				<div
					class="disasm-grid sticky top-0 z-10 h-8 items-center border-b border-default bg-surface px-3 font-sans text-caption font-medium text-secondary"
					aria-hidden="true"
				>
					<span>Section</span>
					<span>RVA</span>
					<span class="hidden @lg:block">Bytes</span>
					<span>Instruction</span>
				</div>
				<!-- The rows come from `listing`, built from the decoder's output with every text escaped. -->
				<div
					ref="dump"
					class="cursor-text py-1 whitespace-pre focus-visible:-outline-offset-2"
					contenteditable="true"
					role="textbox"
					aria-label="Disassembly"
					aria-readonly="true"
					aria-multiline="true"
					spellcheck="false"
					@keydown.enter.prevent="recenter"
					@beforeinput.prevent
					@paste.prevent
					@drop.prevent
					@contextmenu="openAddressMenu"
					v-html="listing"
				></div>
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
.listing {
	/* Keeps its size while skipped, so the scroll position survives the switch. */
	contain-intrinsic-size: auto none;
}

[data-slot='tabs-panel'][inert] .listing {
	content-visibility: hidden;
}

/* The rows come from v-html and carry no scope attribute, so the rules reach them through :deep(). */
.listing :deep(.disasm-grid) {
	display: grid;
	grid-template-columns: 8ch 10ch minmax(30ch, 1fr);
	column-gap: 0.75rem;
}

/* 30ch holds ten bytes, which covers nearly every instruction; the rare longer one wraps. */
@container (width >= 32rem) {
	.listing :deep(.disasm-grid) {
		grid-template-columns: 8ch 10ch 30ch minmax(30ch, 1fr);
	}
}

/*
 * Rows off screen skip style, layout and paint. Most rows are one line; a row with a label or
 * a wrapped instruction is taller, and once shown the browser remembers its real height.
 */
.listing :deep([data-rva]) {
	content-visibility: auto;
	contain-intrinsic-size: auto 1.25rem;
}

/* Padding the mnemonic starts every operand list on one column, so the eye can run down it. */
.listing :deep(.mnemonic) {
	display: inline-block;
	min-width: 7ch;
}

.listing :deep(.cursor) {
	position: relative;
}

.listing :deep(.cursor)::before {
	content: '';
	position: absolute;
	inset-inline-start: -3px;
	inset-block: 3px;
	width: 1px;
	background: var(--color-accent);
	pointer-events: none;
}

.listing :deep([data-col]) {
	scroll-margin-block-start: 2.5rem;
}
</style>
