<script setup lang="ts" generic="Row">
import { useVirtualizer } from '@tanstack/vue-virtual'
import IconArrowDown from '~icons/lucide/arrow-down'
import IconArrowUp from '~icons/lucide/arrow-up'
import IconArrowUpDown from '~icons/lucide/chevrons-up-down'
import { TransitionGroup } from 'vue'
import type { Column, SortState } from './table'

/**
 * A data table for anything from a five-row header to a hundred thousand relocations.
 *
 * Two layouts:
 * - default: natural height and column widths, the surrounding page scrolls. For short tables.
 * - `fill`: takes its parent's height (the parent must have one, like a flex child with
 *   `min-h-0 flex-1`), scrolls inside, keeps the header in view and renders only the rows
 *   on screen. Use it for any list that can pass about fifty rows.
 *
 * Rows take keyboard focus (one tab stop, arrow keys move). `selected` holds a row key
 * when the table drives a detail pane.
 */
const props = withDefaults(
	defineProps<{
		rows: readonly Row[]
		columns: Column<Row>[]
		/** Names the table for assistive technology. */
		label: string
		rowKey?: (row: Row, index: number) => string | number
		fill?: boolean
		/** Shown in place of the table when there are no rows. */
		empty?: string
		/**
		 * Rows that change place because of a command (Move up, Move down) glide to their new
		 * place. Only without `fill`; a sort change and rows that come or go stay instant.
		 */
		animateMoves?: boolean
	}>(),
	{ empty: 'No entries' },
)

const selected = defineModel<string | number | undefined>('selected')
const sort = defineModel<SortState | undefined>('sort')

const emit = defineEmits<{
	/** Enter or a double click on a row. */
	activate: [row: Row, index: number]
}>()

defineSlots<
	{
		[K in `cell-${string}`]?: (props: { row: Row; index: number; value: string }) => unknown
	} & { empty?: () => unknown }
>()

const rowHeight = 28
const headerHeight = 32

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

function compare(a: unknown, b: unknown): number {
	if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1
	if (typeof a === 'string' || typeof b === 'string') return collator.compare(String(a), String(b))
	return a < b ? -1 : a > b ? 1 : 0
}

/** Rows keep their original index so keys and cell formatters stay stable under sorting. */
const ordered = computed(() => {
	const entries = props.rows.map((row, index) => ({ row, index }))
	const state = sort.value
	const column = state && props.columns.find((item) => item.key === state.key)
	if (!state || !column?.sortValue) return entries
	const by = column.sortValue
	const sign = state.direction === 'ascending' ? 1 : -1
	return entries.sort((a, b) => sign * compare(by(a.row), by(b.row)) || a.index - b.index)
})

function keyOf(entry: { row: Row; index: number }): string | number {
	return props.rowKey ? props.rowKey(entry.row, entry.index) : entry.index
}

function toggleSort(column: Column<Row>) {
	if (!column.sortValue) return
	const current = sort.value?.key === column.key ? sort.value.direction : undefined
	sort.value =
		current === undefined
			? { key: column.key, direction: 'ascending' }
			: current === 'ascending'
				? { key: column.key, direction: 'descending' }
				: undefined
}

function ariaSort(column: Column<Row>) {
	if (!column.sortValue) return undefined
	return sort.value?.key === column.key ? sort.value.direction : 'none'
}

function text(column: Column<Row>, entry: { row: Row; index: number }): string {
	const value = column.value(entry.row, entry.index)
	return value == null ? '' : String(value)
}

function kindOf(column: Column<Row>, entry: { row: Row; index: number }) {
	return typeof column.kind === 'function' ? column.kind(entry.row, entry.index) : column.kind
}

const scroller = useTemplateRef<HTMLElement>('scroller')

const virtualizer = useVirtualizer(
	computed(() => ({
		count: props.fill ? ordered.value.length : 0,
		getScrollElement: () => scroller.value,
		estimateSize: () => rowHeight,
		overscan: 12,
		// The sticky header covers the top of the scroller.
		scrollPaddingStart: headerHeight,
	})),
)

const visible = computed(() => {
	if (!props.fill) return ordered.value.map((entry, position) => ({ entry, position }))
	return virtualizer.value
		.getVirtualItems()
		.map((item) => ({ entry: ordered.value[item.index], position: item.index }))
		.filter((item) => item.entry !== undefined)
})

const padding = computed(() => {
	if (!props.fill) return { top: 0, bottom: 0 }
	const items = virtualizer.value.getVirtualItems()
	if (!items.length) return { top: 0, bottom: 0 }
	return {
		top: items[0].start,
		bottom: virtualizer.value.getTotalSize() - items[items.length - 1].end,
	}
})

/** Position of the row that holds the tab stop. */
const active = ref(0)

watch(
	() => ordered.value.length,
	(length) => {
		if (active.value >= length) active.value = Math.max(0, length - 1)
	},
)

/**
 * Position of a row that must take focus when it is rendered. A virtual list renders a far
 * row only after its scroll event, one frame or more after the key press.
 */
let pendingFocus: number | undefined

function settleFocus() {
	if (pendingFocus === undefined) return
	const row = scroller.value?.querySelector<HTMLElement>(`tr[data-position="${pendingFocus}"]`)
	if (!row) return
	pendingFocus = undefined
	row.focus({ preventScroll: props.fill })
	if (!props.fill) row.scrollIntoView({ block: 'nearest' })
}

async function focusRow(position: number) {
	const last = ordered.value.length - 1
	if (last < 0) return
	active.value = Math.max(0, Math.min(position, last))
	pendingFocus = active.value
	if (props.fill) {
		// The focused row is about to leave the DOM. The scroller holds focus until the new row exists.
		const present = scroller.value?.querySelector(`tr[data-position="${active.value}"]`)
		if (!present) scroller.value?.focus({ preventScroll: true })
		virtualizer.value.scrollToIndex(active.value)
	}
	await nextTick()
	settleFocus()
}

watch(visible, settleFocus, { flush: 'post' })

function pageSize(): number {
	const height = scroller.value?.clientHeight ?? 0
	return Math.max(1, Math.floor((height - headerHeight) / rowHeight) - 1)
}

function onRowKeydown(event: KeyboardEvent, position: number) {
	if (event.target !== event.currentTarget) return
	let next: number | undefined
	switch (event.key) {
		case 'ArrowDown':
			next = position + 1
			break
		case 'ArrowUp':
			next = position - 1
			break
		case 'Home':
			next = 0
			break
		case 'End':
			next = ordered.value.length - 1
			break
		case 'PageDown':
			next = position + pageSize()
			break
		case 'PageUp':
			next = position - pageSize()
			break
		case 'Enter':
		case ' ': {
			const entry = ordered.value[position]
			if (!entry) return
			event.preventDefault()
			selected.value = keyOf(entry)
			if (event.key === 'Enter') emit('activate', entry.row, entry.index)
			return
		}
		default:
			return
	}
	event.preventDefault()
	void focusRow(next)
}

function onRowClick(entry: { row: Row; index: number }, position: number) {
	active.value = position
	selected.value = keyOf(entry)
}

/**
 * A plain click on the text of an address opens the address menu, as on an AddressText. In a
 * table that selects rows, the same click also selects the row.
 */
function onCellClick(event: MouseEvent, kind: unknown) {
	if (!kind || event.button !== 0 || !(event.target instanceof Element)) return
	if (event.target.closest('button, a, input, select, textarea')) return
	// Dragging across the text to copy it ends in a click; that one must not open a menu.
	if (document.getSelection()?.isCollapsed === false) return
	event.currentTarget?.dispatchEvent(
		new MouseEvent('contextmenu', {
			bubbles: true,
			cancelable: true,
			clientX: event.clientX,
			clientY: event.clientY,
		}),
	)
}

const emptyBox = useTemplateRef<HTMLElement>('emptyBox')

/**
 * A table that runs to the edge of its view lines its outer columns up with the page's own
 * padding, so cell text starts where the headings above it start. Elsewhere, beside a divider
 * or inside a padded section, the cell padding alone is enough.
 */
const atEdge = reactive({ start: false, end: false })

function measureEdges() {
	const element = scroller.value ?? emptyBox.value
	const page = element?.closest('[data-view-page]')
	if (!element || !page) {
		atEdge.start = atEdge.end = false
		return
	}
	const box = element.getBoundingClientRect()
	const frame = page.getBoundingClientRect()
	const left = Math.abs(box.left - frame.left) < 1
	const right = Math.abs(box.right - frame.right) < 1
	const rtl = getComputedStyle(element).direction === 'rtl'
	atEdge.start = rtl ? right : left
	atEdge.end = rtl ? left : right
}

/**
 * A table in the page flow scrolls sideways in its own box only while it is wider than that
 * box. A scrolling box captures `position: sticky`, so a box that scrolled always would let
 * the header row leave with the page instead of staying under the top edge of the view.
 */
const tooWide = shallowRef(false)

function measureWidth() {
	const table = scroller.value?.querySelector('table')
	tooWide.value = !!table && !!scroller.value && table.offsetWidth > scroller.value.clientWidth + 1
}

useResizeObserver(() => [scroller.value, emptyBox.value], measureEdges)
useResizeObserver(() => [scroller.value, scroller.value?.querySelector('table')], measureWidth)

const insets = computed(() => ({
	'--inset-start': atEdge.start ? 'var(--page-inset, 0.75rem)' : '0.75rem',
	'--inset-end': atEdge.end ? 'var(--page-inset, 0.75rem)' : '0.75rem',
}))

/**
 * Column widths are written for the 0.75rem cell padding. An outer column that takes the page
 * inset grows by the difference, so its content keeps the room its width was chosen for.
 */
function widen(width: string | undefined, index: number): string | undefined {
	if (!width || width === 'auto') return width
	const extra = [
		index === 0 && atEdge.start ? ' + var(--inset-start) - 0.75rem' : '',
		index === props.columns.length - 1 && atEdge.end ? ' + var(--inset-end) - 0.75rem' : '',
	].join('')
	return extra ? `calc(${width}${extra})` : width
}

/** A sort reorders every row at once; that stays instant, so the next update skips the glide. */
const sorting = ref(false)

watch(
	sort,
	() => {
		sorting.value = true
	},
	{ flush: 'sync', deep: true },
)

// The row group reads its move class in its own updated hook, which runs before this one.
onUpdated(() => {
	sorting.value = false
})

const animated = computed(() => props.animateMoves && !props.fill)
// TransitionGroup moves a row only when its move class carries a transform transition.
const moveClass = computed(() => (sorting.value ? 'row-still' : 'row-move'))

const columnWidths = computed(() =>
	props.columns.map((column, index) => widen(column.width, index) ?? 'auto'),
)

const columnMinWidths = computed(() =>
	props.columns.map((column, index) =>
		props.fill
			? widen(column.minWidth ?? column.width ?? '8rem', index)
			: (widen(column.minWidth, index) ?? 'auto'),
	),
)
</script>

<template>
	<div
		v-if="!rows.length"
		ref="emptyBox"
		class="ps-(--inset-start) pe-(--inset-end) py-6 text-secondary"
		:style="insets"
	>
		<slot name="empty">{{ empty }}</slot>
	</div>
	<div
		v-else
		ref="scroller"
		tabindex="-1"
		class="scroll-thin min-w-0 outline-none"
		:class="
			fill ? 'h-full min-h-0 overflow-auto' : ['max-w-full', tooWide ? 'overflow-auto' : 'overflow-visible']
		"
		:style="insets"
	>
		<table
			class="w-full border-separate border-spacing-0 text-start"
			:class="fill ? 'table-fixed' : 'table-auto'"
			:aria-label="label"
			:aria-rowcount="fill ? ordered.length + 1 : undefined"
		>
			<!-- Without `fill` a width is a preference: it lines up the columns of several tables on one page. -->
			<colgroup>
				<col
					v-for="(column, index) in columns"
					:key="column.key"
					class="w-(--col) min-w-(--col-min)"
					:style="{
						'--col': columnWidths[index],
						'--col-min': columnMinWidths[index],
					}"
				/>
			</colgroup>
			<thead>
				<tr>
					<th
						v-for="column in columns"
						:key="column.key"
						scope="col"
						class="sticky top-0 z-10 h-8 border-b border-default bg-surface px-3 text-caption first:ps-(--inset-start) last:pe-(--inset-end) font-medium whitespace-nowrap text-secondary"
						:class="column.align === 'end' ? 'text-end' : 'text-start'"
						:aria-sort="ariaSort(column)"
					>
						<button
							v-if="column.sortValue"
							type="button"
							class="-mx-1.5 inline-flex h-6 items-center gap-1 rounded-sm px-1.5 hover:bg-hover hover:text-primary"
							:class="column.align === 'end' ? 'flex-row-reverse' : ''"
							@click="toggleSort(column)"
						>
							{{ column.title }}
							<IconArrowUp
								v-if="sort?.key === column.key && sort.direction === 'ascending'"
								class="size-3.5 shrink-0 text-accent"
								aria-hidden="true"
							/>
							<IconArrowDown
								v-else-if="sort?.key === column.key"
								class="size-3.5 shrink-0 text-accent"
								aria-hidden="true"
							/>
							<IconArrowUpDown v-else class="size-3.5 shrink-0 text-disabled" aria-hidden="true" />
						</button>
						<template v-else>{{ column.title }}</template>
					</th>
				</tr>
			</thead>
			<component
				:is="animated ? TransitionGroup : 'tbody'"
				v-bind="animated ? { tag: 'tbody', moveClass } : {}"
			>
				<tr v-if="padding.top" aria-hidden="true">
					<td :colspan="columns.length" class="h-(--pad) p-0" :style="{ '--pad': `${padding.top}px` }"></td>
				</tr>
				<tr
					v-for="{ entry, position } in visible"
					:key="keyOf(entry)"
					class="group/row outline-none"
					data-focus="inset"
					:data-position="position"
					:data-selected="selected !== undefined && selected === keyOf(entry) ? '' : undefined"
					:aria-rowindex="fill ? position + 2 : undefined"
					:aria-selected="selected === undefined ? undefined : selected === keyOf(entry)"
					:tabindex="position === active ? 0 : -1"
					@keydown="onRowKeydown($event, position)"
					@click="onRowClick(entry, position)"
					@dblclick="emit('activate', entry.row, entry.index)"
				>
					<!-- Without `fill` the 24px line leaves room for a small button in a 28px row. -->
					<td
						v-for="column in columns"
						:key="column.key"
						class="border-b border-subtle px-3 group-hover/row:bg-hover first:ps-(--inset-start) last:pe-(--inset-end) group-focus-visible/row:bg-hover group-data-selected/row:bg-accent-subtle"
						:class="[
							fill ? 'h-7 truncate' : 'py-0.5 align-top leading-6',
							column.wrap && !fill ? 'wrap-anywhere whitespace-pre-wrap' : 'whitespace-nowrap',
							column.align === 'end' ? 'text-end' : 'text-start',
							column.mono ? 'num font-mono text-data' : '',
							column.muted ? 'text-secondary' : '',
						]"
						:data-kind="kindOf(column, entry)"
						:title="fill ? text(column, entry) || undefined : undefined"
						translate="no"
					>
						<!-- The address text is the click target, not the cell, so the rest of the row stays free to select the row. -->
						<span
							:class="
								kindOf(column, entry)
									? 'cursor-pointer underline decoration-transparent decoration-dotted underline-offset-4 group-hover/row:decoration-(--border-color-strong) group-focus-visible/row:decoration-(--border-color-strong) hover:decoration-solid'
									: 'contents'
							"
							@click="onCellClick($event, kindOf(column, entry))"
						>
							<slot
								:name="`cell-${column.key}`"
								:row="entry.row"
								:index="entry.index"
								:value="text(column, entry)"
							>
								<template v-if="text(column, entry)">{{ text(column, entry) }}</template>
								<template v-else>
									<span class="text-disabled" aria-hidden="true">-</span>
									<span class="sr-only">None</span>
								</template>
							</slot>
						</span>
					</td>
				</tr>
				<tr v-if="padding.bottom" aria-hidden="true">
					<td
						:colspan="columns.length"
						class="h-(--pad) p-0"
						:style="{ '--pad': `${padding.bottom}px` }"
					></td>
				</tr>
			</component>
		</table>
	</div>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
	.row-move {
		transition: transform var(--motion-move) var(--ease-out);
	}
}

/* A row is one focus target, so the ring belongs to the row and the cells only tint. */
tr:focus-visible > td {
	box-shadow:
		inset 0 2px var(--color-focus),
		inset 0 -2px var(--color-focus);
}

tr:focus-visible > td:first-child {
	box-shadow:
		inset 2px 0 var(--color-focus),
		inset 0 2px var(--color-focus),
		inset 0 -2px var(--color-focus);
}

tr:focus-visible > td:last-child {
	box-shadow:
		inset -2px 0 var(--color-focus),
		inset 0 2px var(--color-focus),
		inset 0 -2px var(--color-focus);
}

tr:focus-visible > td:only-child {
	box-shadow: inset 0 0 0 2px var(--color-focus);
}
</style>
