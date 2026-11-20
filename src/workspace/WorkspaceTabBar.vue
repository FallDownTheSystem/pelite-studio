<script setup lang="ts">
import { MenuContextTrigger } from '@ui-sdk/vue/menu'
import { TabsList, TabsTab, TabsTabIcon } from '@ui-sdk/vue/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@ui-sdk/vue/tooltip'
import { animateMini, useReducedMotion } from 'motion-v'
import type { ComponentPublicInstance } from 'vue'
import IconX from '~icons/lucide/x'
import { enterTransition, exitTransition, layoutSpring } from '@/lib/motion'
import { clamp, type WorkspacePaneNode } from './layout'
import { useWorkspace } from './types'

const props = defineProps<{ pane: WorkspacePaneNode; focused: boolean }>()

const workspace = useWorkspace()
const reducedMotion = useReducedMotion()
const list = useTemplateRef<ComponentPublicInstance>('list')
const marker = useTemplateRef<HTMLElement>('marker')
const titleElements = new Map<number, HTMLElement>()

function listElement(): HTMLElement | undefined {
	return list.value?.$el as HTMLElement | undefined
}

function title(id: number): string {
	return workspace.view(id)?.title ?? ''
}

function titleFits(id: number): boolean {
	const element = titleElements.get(id)
	return !element || element.scrollWidth <= element.clientWidth
}

function rememberTitle(id: number, element: Element | ComponentPublicInstance | null) {
	if (element instanceof HTMLElement) titleElements.set(id, element)
	else titleElements.delete(id)
}

function tabItems(bar: HTMLElement): HTMLElement[] {
	return Array.from(bar.querySelectorAll<HTMLElement>(':scope > [data-tab-item]'))
}

function revealSelected() {
	const bar = listElement()
	const id = props.pane.selected
	if (!bar || id === undefined) return
	const item = tabItems(bar).find((element) => element.dataset.tabItem === String(id))
	if (!item) return
	const itemRect = item.getBoundingClientRect()
	const barRect = bar.getBoundingClientRect()
	if (itemRect.left < barRect.left) bar.scrollLeft -= barRect.left - itemRect.left
	else if (itemRect.right > barRect.right) bar.scrollLeft += itemRect.right - barRect.right
}

watch(
	() => [props.pane.selected, props.pane.tabs.length],
	() => nextTick(revealSelected),
)
onMounted(revealSelected)

/* Which ends of the bar have tabs scrolled out of view. Changes only when an end is reached. */

const overflow = shallowReactive({ start: false, end: false })

function updateOverflow() {
	const bar = listElement()
	if (!bar) return
	// Scrolling toward the start edge is negative in right-to-left layouts.
	const scrolled = Math.abs(bar.scrollLeft)
	const start = scrolled > 1
	const end = scrolled + bar.clientWidth < bar.scrollWidth - 1
	if (overflow.start !== start) overflow.start = start
	if (overflow.end !== end) overflow.end = end
}

useResizeObserver(() => listElement(), updateOverflow)
watch(
	() => props.pane.tabs.length,
	() => nextTick(updateOverflow),
)
onMounted(updateOverflow)

function scrollTabs(event: WheelEvent) {
	const { deltaMode, deltaX, deltaY, ctrlKey } = event
	if (ctrlKey || deltaX || !deltaY) return
	const bar = event.currentTarget as HTMLElement
	if (bar.scrollWidth <= bar.clientWidth) return
	const start = bar.scrollLeft
	const unit =
		deltaMode === WheelEvent.DOM_DELTA_LINE
			? 16
			: deltaMode === WheelEvent.DOM_DELTA_PAGE
				? bar.clientWidth
				: 1
	bar.scrollLeft += deltaY * unit
	if (bar.scrollLeft !== start) event.preventDefault()
}

/*
 * Tab motion. Tabs slide only to explain a change of place: neighbors open a gap where a
 * dragged tab will land, and close it when a tab moves or closes. Every slide is a transform
 * on the tab, so the bar never re-lays out per frame, and each one starts from where the tab
 * is drawn at that moment, so a new change retargets a slide that is still running.
 */

interface Slide {
	to: number
	stop(): void
}

const slides = new WeakMap<HTMLElement, Slide>()

function drawnOffset(element: HTMLElement): number {
	const transform = getComputedStyle(element).transform
	return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41
}

function restingOffset(element: HTMLElement): number {
	return slides.get(element)?.to ?? (element.style.transform ? drawnOffset(element) : 0)
}

/** Moves a tab to `to` pixels from its place in the layout, from `from` or from where it is drawn. */
function slide(element: HTMLElement, to: number, from = drawnOffset(element)) {
	slides.get(element)?.stop()
	if (reducedMotion.value || Math.abs(from - to) < 0.5) {
		slides.delete(element)
		element.style.transform = to ? `translateX(${to}px)` : ''
		return
	}
	const controls = animateMini(
		element,
		{ transform: [`translateX(${from}px)`, `translateX(${to}px)`] },
		layoutSpring,
	)
	const current: Slide = { to, stop: () => controls.stop() }
	slides.set(element, current)
	controls.finished.then(() => {
		if (slides.get(element) !== current) return
		slides.delete(element)
		// At rest a tab carries no transform, so its text is never drawn on a fractional pixel.
		element.style.transform = to ? `translateX(${to}px)` : ''
	})
}

/** Where each tab is drawn now, including a slide in progress. */
function drawnPositions(): Map<number, number> {
	const result = new Map<number, number>()
	const bar = listElement()
	if (!bar) return result
	for (const item of tabItems(bar))
		result.set(Number(item.dataset.tabItem), item.getBoundingClientRect().left)
	return result
}

/** Slides every tab from where it was drawn before a change of order to its new place. */
function settleTabs(before: Map<number, number>) {
	const bar = listElement()
	if (!bar) return
	const items = tabItems(bar)
	// Reads and writes run in separate passes, so the bar lays out once.
	for (const item of items) {
		slides.get(item)?.stop()
		slides.delete(item)
		item.style.transform = ''
		item.style.opacity = ''
	}
	const places = items.map((item) => item.getBoundingClientRect().left)
	items.forEach((item, index) => {
		const from = before.get(Number(item.dataset.tabItem))
		if (from !== undefined) slide(item, 0, from - places[index])
	})
}

let pendingSettle: Map<number, number> | undefined
let instantChange = false

// The tabs render inside the list's slot, so the list re-renders when they change, not this
// component: watchers on the order see the tabs just before and just after the list patches.
const tabOrder = () => props.pane.tabs.slice()

watch(
	tabOrder,
	() => {
		if (!pendingSettle && !instantChange) pendingSettle = drawnPositions()
	},
	{ flush: 'pre' },
)

watch(
	tabOrder,
	() => {
		instantChange = false
		const before = pendingSettle
		pendingSettle = undefined
		if (before) settleTabs(before)
	},
	{ flush: 'post' },
)

/*
 * Tab drops. While a tab is dragged over its own bar, its slot closes and it is hidden: the drag
 * image stands for it. A gap opens where it would land. The insertion point comes from that
 * collapsed layout, not from where tabs are drawn, so a gap opening under the pointer never
 * moves the point it opened for.
 */

interface Slot {
	item: HTMLElement
	/** Start of the tab in the bar's scrolled coordinates once the dragged tab's slot has closed. */
	start: number
	width: number
}

interface DropPlan {
	slots: Slot[]
	/** The dragged tab when it comes from this bar. */
	source: HTMLElement | undefined
	/** Where the dragged tab's slot was, in the order of the bar; -1 when it comes from another bar. */
	from: number
	rtl: boolean
}

function dropPlan(bar: HTMLElement): DropPlan {
	const items = tabItems(bar)
	const rtl = getComputedStyle(bar).direction === 'rtl'
	const from = items.findIndex((item) => item.dataset.tabItem === String(workspace.draggedView()))
	const source = items[from]
	const closed = source ? source.offsetWidth : 0
	const slots: Slot[] = []
	items.forEach((item, index) => {
		if (index === from) return
		// Tabs after the dragged one close its slot, toward the start edge.
		const shift = from >= 0 && index > from ? (rtl ? closed : -closed) : 0
		slots.push({ item, start: item.offsetLeft + shift, width: item.offsetWidth })
	})
	return { slots, source, from, rtl }
}

/** The place among the other tabs that the pointer at `x` points to. */
function slotAt(bar: HTMLElement, plan: DropPlan, x: number): number {
	const origin = bar.getBoundingClientRect().left - bar.scrollLeft
	const index = plan.slots.findIndex(({ start, width }) => {
		const middle = origin + start + width / 2
		return plan.rtl ? x > middle : x < middle
	})
	return index < 0 ? plan.slots.length : index
}

/** The insertion index `moveTab` takes for a place among the other tabs. */
function moveIndex(plan: DropPlan, slot: number): number {
	return plan.from >= 0 && slot >= plan.from ? slot + 1 : slot
}

/** The start edge of the gap at `slot`, in the bar's scrolled coordinates. */
function gapEdge(bar: HTMLElement, plan: DropPlan, slot: number): number {
	const next = plan.slots[slot]
	if (next) return next.start + (plan.rtl ? next.width : 0)
	const last = plan.slots[plan.slots.length - 1]
	if (!last) return plan.rtl ? bar.scrollWidth : 0
	return last.start + (plan.rtl ? 0 : last.width)
}

/** The width of the gap. A tab from another bar never pushes a bar that fits into overflowing. */
function gapWidth(bar: HTMLElement, plan: DropPlan): number {
	const width = workspace.draggedTabWidth()
	if (plan.source || bar.scrollWidth > bar.clientWidth) return width
	const last = plan.slots[plan.slots.length - 1]
	if (!last) return width
	const used = plan.rtl ? bar.scrollWidth - last.start : last.start + last.width
	return clamp(bar.clientWidth - used, 0, width)
}

let gap: number | undefined
let markerX: number | undefined
let markerMove: { stop(): void } | undefined
let markerFade: { stop(): void } | undefined

function openGap(bar: HTMLElement, plan: DropPlan, slot: number) {
	showMarker(bar, gapEdge(bar, plan, slot) - bar.scrollLeft - 1)
	if (gap === slot) return
	gap = slot
	if (plan.source) plan.source.style.opacity = '0'
	const width = gapWidth(bar, plan)
	plan.slots.forEach(({ item, start }, index) => {
		const opened = index >= slot ? width : 0
		const to = start - item.offsetLeft + (plan.rtl ? -opened : opened)
		if (restingOffset(item) !== to) slide(item, to)
	})
}

function closeGap() {
	const bar = listElement()
	gap = undefined
	hideMarker()
	if (!bar) return
	for (const item of tabItems(bar)) {
		item.style.opacity = ''
		if (restingOffset(item) !== 0) slide(item, 0)
	}
}

// The marker follows the pointer on every dragover, so it is moved directly instead of through state.
// It appears in place and then travels with the gap; stopping a running move first keeps its
// drawn position, so the next move starts from there.
function showMarker(bar: HTMLElement, x: number) {
	const element = marker.value
	if (!element) return
	const to = clamp(x, 0, bar.clientWidth - 2)
	if (to === markerX) return
	markerMove?.stop()
	markerMove = undefined
	if (markerX === undefined || reducedMotion.value) element.style.transform = `translateX(${to}px)`
	else markerMove = animateMini(element, { transform: `translateX(${to}px)` }, layoutSpring)
	if (markerX === undefined) fadeMarker(element, 1, enterTransition)
	markerX = to
}

function hideMarker() {
	if (markerX === undefined || !marker.value) return
	markerX = undefined
	fadeMarker(marker.value, 0, exitTransition)
}

function fadeMarker(
	element: HTMLElement,
	opacity: number,
	transition: typeof enterTransition | typeof exitTransition,
) {
	markerFade?.stop()
	markerFade = animateMini(element, { opacity }, transition)
}

function isTabDrag(event: DragEvent): boolean {
	return !!event.dataTransfer?.types.includes(workspace.tabDragType)
}

function previewDrop(event: DragEvent) {
	if (!isTabDrag(event)) return
	event.preventDefault()
	event.stopPropagation()
	event.dataTransfer!.dropEffect = 'move'
	const bar = event.currentTarget as HTMLElement
	const bounds = bar.getBoundingClientRect()
	const edge = Math.min(20, bounds.width / 3)
	if (event.clientX < bounds.left + edge) bar.scrollLeft -= 12
	else if (event.clientX > bounds.right - edge) bar.scrollLeft += 12
	const plan = dropPlan(bar)
	openGap(bar, plan, slotAt(bar, plan, event.clientX))
}

function leaveDrop(event: DragEvent) {
	const bar = event.currentTarget as HTMLElement
	if (!(event.relatedTarget instanceof Node) || !bar.contains(event.relatedTarget)) closeGap()
}

function dropTab(event: DragEvent) {
	const bar = event.currentTarget as HTMLElement
	const id = Number(event.dataTransfer?.getData(workspace.tabDragType) || Number.NaN)
	if (!Number.isFinite(id)) {
		closeGap()
		return
	}
	event.preventDefault()
	event.stopPropagation()
	const plan = dropPlan(bar)
	const index = moveIndex(plan, slotAt(bar, plan, event.clientX))
	gap = undefined
	hideMarker()
	// The other tabs settle from where they are drawn; the dropped tab appears in the gap it opened.
	const before = drawnPositions()
	before.delete(id)
	pendingSettle = before
	workspace.moveTab(props.pane.id, id, index)
	nextTick(() => {
		if (pendingSettle !== before) return
		pendingSettle = undefined
		settleTabs(before)
	})
}

function onTabKeydown(event: KeyboardEvent, id: number) {
	if (event.key === 'Delete' && !event.altKey && !event.ctrlKey && !event.metaKey) {
		event.preventDefault()
		// A key repeated many times a minute gets its result at once, with no slide.
		instantChange = true
		workspace.close(id)
	}
}

onMounted(() => document.addEventListener('dragend', closeGap, true))
onBeforeUnmount(() => document.removeEventListener('dragend', closeGap, true))
</script>

<template>
	<div
		class="relative flex h-8 shrink-0 bg-surface select-none after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:border-b after:border-subtle"
	>
		<TabsList
			ref="list"
			aria-label="Open views"
			class="relative z-1 flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden border-b-0 [scrollbar-width:none]"
			@wheel="scrollTabs"
			@scroll.passive="updateOverflow"
			@dragover="previewDrop"
			@dragleave="leaveDrop"
			@drop="dropTab"
		>
			<MenuContextTrigger
				v-for="id in pane.tabs"
				:key="id"
				:controller="workspace.tabMenu"
				:payload="id"
				role="presentation"
				:data-tab-item="id"
				:data-selected="pane.selected === id ? '' : undefined"
				class="group/tab relative flex shrink-0 items-center border-e border-subtle text-secondary before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:border-t-2 before:border-transparent not-data-selected:hover:bg-hover hover:text-primary data-selected:bg-page data-selected:text-primary has-[[role=tab]:focus-visible]:outline-2 has-[[role=tab]:focus-visible]:-outline-offset-2 has-[[role=tab]:focus-visible]:outline-focus"
				:class="[
					focused ? 'data-selected:before:border-accent' : 'data-selected:before:border-strong',
					workspace.liftedView() === id && 'text-disabled!',
				]"
				@mousedown.middle.prevent
				@auxclick.middle.prevent="workspace.close(id)"
			>
				<Tooltip type="label" @open-change="(open, details) => open && titleFits(id) && details.cancel()">
					<TooltipTrigger>
						<template #render="{ props: trigger }">
							<TabsTab
								v-bind="trigger"
								:value="String(id)"
								:data-workspace-tab="id"
								draggable="true"
								class="m-0 flex h-full min-w-0 items-center gap-1.5 border-0 ps-3 pe-1 text-body font-normal text-inherit hover:text-inherit focus-visible:outline-none!"
								@keydown="onTabKeydown($event, id)"
								@dragstart="workspace.startTabDrag($event, id)"
							>
								<TabsTabIcon>
									<component :is="workspace.view(id)?.icon" class="size-4 shrink-0" aria-hidden="true" />
								</TabsTabIcon>
								<span :ref="(element) => rememberTitle(id, element)" class="max-w-55 truncate">
									{{ title(id) }}
								</span>
							</TabsTab>
						</template>
					</TooltipTrigger>
					<TooltipContent side="bottom" :side-offset="6">{{ title(id) }}</TooltipContent>
				</Tooltip>
				<Tooltip type="label">
					<TooltipTrigger
						type="button"
						tabindex="-1"
						data-variant="ghost"
						data-size="sm"
						data-icon-only
						aria-label="Close tab"
						class="me-1 shrink-0 opacity-0 group-hover/tab:opacity-100 group-focus-within/tab:opacity-100 group-data-selected/tab:opacity-100"
						@click="workspace.close(id)"
					>
						<IconX class="size-4 shrink-0" aria-hidden="true" />
					</TooltipTrigger>
					<TooltipContent side="bottom" :side-offset="6">Close tab</TooltipContent>
				</Tooltip>
			</MenuContextTrigger>
		</TabsList>
		<!-- More tabs lie past a faded edge. A scrollbar here would take a third of the bar's height. -->
		<div
			class="pointer-events-none absolute start-0 top-0 bottom-px z-2 w-6 bg-linear-to-r from-(--background-color-surface) opacity-0 transition-opacity duration-160 ease-(--ease-out) rtl:bg-linear-to-l"
			:class="overflow.start && 'opacity-100'"
			aria-hidden="true"
		/>
		<div
			class="pointer-events-none absolute end-0 top-0 bottom-px z-2 w-6 bg-linear-to-l from-(--background-color-surface) opacity-0 transition-opacity duration-160 ease-(--ease-out) rtl:bg-linear-to-r"
			:class="overflow.end && 'opacity-100'"
			aria-hidden="true"
		/>
		<!-- Positioned from measured client rectangles, so the offset is physical on purpose. -->
		<div
			ref="marker"
			class="pointer-events-none absolute inset-y-1 left-0 z-2 w-0.5 rounded-full bg-accent opacity-0"
			aria-hidden="true"
		/>
	</div>
</template>
