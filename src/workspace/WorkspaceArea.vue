<script setup lang="ts">
import {
	createMenuController,
	Menu,
	MenuContent,
	MenuItem,
	MenuItemIcon,
	MenuSeparator,
} from '@ui-sdk/vue/menu'
import IconAppWindow from '~icons/lucide/app-window'
import IconArrowLeft from '~icons/lucide/arrow-left'
import IconArrowRight from '~icons/lucide/arrow-right'
import IconCopy from '~icons/lucide/copy'
import IconSplitDown from '~icons/lucide/square-split-vertical'
import IconSplitRight from '~icons/lucide/square-split-horizontal'
import { AnimatePresence, animateMini, useReducedMotion } from 'motion-v'
import { layoutSpring } from '@/lib/motion'
import {
	boundWindow,
	type WorkspaceBounds,
	type WorkspaceDirection,
	type WorkspaceFloatingWindow,
	type WorkspaceLayout,
	type WorkspaceNode,
	type WorkspacePaneNode,
	type WorkspaceSize,
} from './layout'
import {
	paneOutletKey,
	windowOutletKey,
	workspaceContextKey,
	type WorkspaceContext,
	type WorkspaceDropZone,
	type WorkspaceViewInfo,
	type WorkspaceWindowExit,
} from './types'
import WorkspacePane from './WorkspacePane.vue'
import WorkspaceSplit from './WorkspaceSplit.vue'
import WorkspaceWindow from './WorkspaceWindow.vue'

/**
 * Renders a reactive WorkspaceLayout with host-provided view info and a `view({ id })` slot.
 * The host handles `close-view` by removing the view and calling `layout.close(id)`.
 * For `duplicate-view`, the host creates a fresh view and calls `layout.open(newId, sourceId)`.
 */
const props = defineProps<{ layout: WorkspaceLayout; views: WorkspaceViewInfo[] }>()
const emit = defineEmits<{ 'close-view': [id: number]; 'duplicate-view': [id: number] }>()
defineSlots<{ view(props: { id: number }): unknown }>()

interface Placement {
	target: string
	visible: boolean
}

const root = useTemplateRef<HTMLElement>('root')
const tabDragType = `application/x-workspace-tab-${useId().toLowerCase()}`
const tabMenu = createMenuController<number>()
const TabMenuContent = MenuContent<number>

const outlets = shallowReactive(new Map<string, HTMLElement>())
const mountedViews = shallowReactive(new Set<number>())
const areaSize = shallowRef<WorkspaceSize>({ width: 0, height: 0 })
const reducedMotion = useReducedMotion()
let dragging: { id: number; width: number } | undefined
const liftedView = shallowRef<number>()
let liftFrame = 0

const viewsById = computed(() => new Map(props.views.map((view) => [view.id, view])))

const placements = computed(() => {
	const result = new Map<number, Placement>()
	for (const pane of props.layout.panes) {
		for (const id of pane.tabs)
			result.set(id, { target: paneOutletKey(pane.id, id), visible: pane.selected === id })
	}
	for (const { viewId } of props.layout.windows)
		result.set(viewId, { target: windowOutletKey(viewId), visible: true })
	return result
})

function outletFor(id: number): HTMLElement | undefined {
	const placement = placements.value.get(id)
	return placement && outlets.get(placement.target)
}

function paneOf(id: number): WorkspacePaneNode | undefined {
	return props.layout.panes.find((pane) => pane.tabs.includes(id))
}

/* Scroll positions. Moving an outlet's view, or hiding it, drops the scroll offset with the box. */

const scrollPositions = new Map<number, { left: number; top: number }>()
let rendered: { root?: WorkspaceNode; placements?: Map<number, Placement> } = {}
let restoreFrame = 0

function rememberLayout() {
	rendered = { root: props.layout.root, placements: placements.value }
}

function restoreScroll(retries = 2) {
	let pending = false
	for (const [id, position] of scrollPositions) {
		const placement = placements.value.get(id)
		if (!placement) {
			scrollPositions.delete(id)
			continue
		}
		if (!placement.visible) continue
		const outlet = outlets.get(placement.target)
		const content = outlet?.querySelector(`:scope > [data-workspace-view="${id}"]`)
		if (!outlet || !content || !outlet.checkVisibility()) {
			pending = true
			continue
		}
		outlet.scrollLeft = position.left
		outlet.scrollTop = position.top
		scrollPositions.delete(id)
	}
	// The tab panels hide and show from their own state, which can settle a frame after this update.
	if (pending && retries > 0 && !restoreFrame) {
		restoreFrame = requestAnimationFrame(() => {
			restoreFrame = 0
			restoreScroll(retries - 1)
		})
	}
}

onMounted(rememberLayout)

onBeforeUpdate(() => {
	// Snapshot before a split, a move or a tab switch detaches or hides the current outlet.
	const { root: previousRoot, placements: previous } = rendered
	if (previousRoot !== props.layout.root) rememberPanes()
	for (const [id, before] of previous ?? []) {
		const next = placements.value.get(id)
		if (!before.visible || !next || scrollPositions.has(id)) continue
		if (previousRoot === props.layout.root && before.target === next.target && next.visible) continue
		const outlet = outlets.get(before.target)
		if (outlet) scrollPositions.set(id, { left: outlet.scrollLeft, top: outlet.scrollTop })
	}
	rememberLayout()
})

onUpdated(() => {
	movePanes()
	restoreScroll()
})

onBeforeUnmount(() => {
	cancelAnimationFrame(restoreFrame)
	cancelAnimationFrame(liftFrame)
})

/*
 * Pane motion. When the tree of panes changes, each pane already has its final size, so its
 * content lays out once; the motion is a transform or a clip on the pane box, run on the
 * compositor. A pane that grows toward its end is uncovered where it stands, a pane whose
 * start edge moves slides there, and a pane split off another slides in from the edge it
 * takes. A pane that shrinks takes its size at once: the pane sliding in covers the space.
 */

interface Box {
	left: number
	top: number
	right: number
	bottom: number
}

const flights = new WeakMap<HTMLElement, { stop(): void }>()
let panesBefore: { boxes: Map<number, Box>; handles: Set<string> } | undefined
let droppedSplit = false

function paneElements(): HTMLElement[] {
	return Array.from(root.value?.querySelectorAll<HTMLElement>('[data-workspace-pane]') ?? [])
}

function handleElements(): HTMLElement[] {
	return Array.from(root.value?.querySelectorAll<HTMLElement>('[data-workspace-split]') ?? [])
}

/** The part of a pane that is drawn now, which a running motion may still offset or clip. */
function drawnBox(element: HTMLElement): Box {
	const { left, top, right, bottom } = element.getBoundingClientRect()
	const clip = /^inset\(([^)]*)\)/.exec(getComputedStyle(element).clipPath)
	if (!clip) return { left, top, right, bottom }
	const [t = 0, r = t, b = t, l = r] = clip[1].split(/\s+/).map((value) => Number.parseFloat(value))
	return { left: left + l, top: top + t, right: right - r, bottom: bottom - b }
}

function rememberPanes() {
	if (panesBefore) return
	const boxes = new Map<number, Box>()
	for (const element of paneElements()) boxes.set(Number(element.dataset.workspacePane), drawnBox(element))
	const handles = new Set(handleElements().map((element) => element.dataset.workspaceSplit ?? ''))
	panesBefore = { boxes, handles }
}

function fly(element: HTMLElement, keyframes: Record<string, string[]>) {
	const controls = animateMini(element, keyframes, layoutSpring)
	const flight = { stop: () => controls.stop() }
	flights.set(element, flight)
	controls.finished.then(() => {
		if (flights.get(element) !== flight) return
		flights.delete(element)
		// At rest a pane carries no transform or clip, so its text is drawn on whole pixels.
		element.style.transform = ''
		element.style.clipPath = ''
	})
}

function translate(x: number, y: number): string {
	return `translate(${x}px, ${y}px)`
}

/** The offset a new pane slides in from: the full width or height of the side of `source` it took. */
function entryOffset(box: DOMRect, source: Box): [number, number] {
	const near = (a: number, b: number) => Math.abs(a - b) < 1
	const sameLeft = near(box.left, source.left)
	const sameRight = near(box.right, source.right)
	const sameTop = near(box.top, source.top)
	const sameBottom = near(box.bottom, source.bottom)
	if (sameTop && sameBottom)
		return sameRight && !sameLeft ? [box.width, 0] : sameLeft && !sameRight ? [-box.width, 0] : [0, 0]
	return sameBottom && !sameTop ? [0, box.height] : sameTop && !sameBottom ? [0, -box.height] : [0, 0]
}

function movePanes() {
	const before = panesBefore
	const dropped = droppedSplit
	panesBefore = undefined
	droppedSplit = false
	if (!before || !root.value) return
	const panes = paneElements()
	const handles = handleElements()
	for (const element of [...panes, ...handles]) {
		flights.get(element)?.stop()
		flights.delete(element)
		element.style.transform = ''
		element.style.clipPath = ''
	}
	if (reducedMotion.value) return
	const rtl = getComputedStyle(root.value).direction === 'rtl'
	const boxes = panes.map((element) => element.getBoundingClientRect())
	const newHandles = handles.filter((element) => !before.handles.has(element.dataset.workspaceSplit ?? ''))
	panes.forEach((element, index) => {
		const box = boxes[index]
		const was = before.boxes.get(Number(element.dataset.workspacePane))
		if (was) {
			const grows = box.width > was.right - was.left + 0.5 || box.height > was.bottom - was.top + 0.5
			if (!grows) return
			// Content hangs from the top and the start edge; when that corner moves, the pane slides.
			const anchorMoved =
				Math.abs(rtl ? box.right - was.right : box.left - was.left) > 0.5 || Math.abs(box.top - was.top) > 0.5
			if (anchorMoved) {
				fly(element, { transform: [translate(was.left - box.left, was.top - box.top), translate(0, 0)] })
			} else {
				const inset = [was.top - box.top, box.right - was.right, box.bottom - was.bottom, was.left - box.left]
				const from = inset.map((value) => `${Math.max(0, value)}px`).join(' ')
				fly(element, { clipPath: [`inset(${from})`, 'inset(0px 0px 0px 0px)'] })
			}
			return
		}
		// A pane made by a drop appears where its preview already stood, so it needs no entrance.
		if (dropped) return
		const x = box.left + box.width / 2
		const y = box.top + box.height / 2
		const source = [...before.boxes.values()].find(
			(other) => other.left <= x && x <= other.right && other.top <= y && y <= other.bottom,
		)
		if (!source) return
		const [dx, dy] = entryOffset(box, source)
		if (!dx && !dy) return
		for (const target of [element, ...newHandles])
			fly(target, { transform: [translate(dx, dy), translate(0, 0)] })
	})
}

/* Area size, for keeping windows inside it. */

useResizeObserver(root, () => {
	const area = root.value
	if (area) areaSize.value = { width: area.clientWidth, height: area.clientHeight }
})

function windowBounds(bounds: WorkspaceBounds): WorkspaceBounds {
	return boundWindow(bounds, areaSize.value)
}

function updateBounds(floating: WorkspaceFloatingWindow, bounds: WorkspaceBounds, action: 'move' | 'resize') {
	const area = areaSize.value
	if (action === 'resize') {
		bounds.width = Math.min(bounds.width, area.width - bounds.x)
		bounds.height = Math.min(bounds.height, area.height - bounds.y)
	}
	floating.bounds = boundWindow(bounds, area)
}

/* Actions. Each one leaves focus on the control that now represents the result. */

function focusTarget(): HTMLElement | null | undefined {
	const { focused, activeViewId } = props.layout
	const selector =
		focused.type === 'window'
			? `[data-workspace-window="${focused.id}"]`
			: activeViewId === undefined
				? `[data-workspace-pane="${focused.id}"]`
				: `[data-workspace-tab="${activeViewId}"]`
	return root.value?.querySelector<HTMLElement>(selector)
}

function focusControl() {
	nextTick(() => focusTarget()?.focus({ preventScroll: true }))
}

function select(id: number) {
	props.layout.activate(id)
}

function requestClose(id: number) {
	windowOrigins.delete(id)
	emit('close-view', id)
	focusControl()
}

function requestDuplicate(id: number) {
	emit('duplicate-view', id)
	focusControl()
}

function moveTab(paneId: number, id: number, index: number) {
	if (props.layout.moveTab(id, paneId, index)) focusControl()
}

function shiftTab(id: number, offset: -1 | 1) {
	const pane = paneOf(id)
	if (!pane) return
	const index = pane.tabs.indexOf(id)
	moveTab(pane.id, id, offset < 0 ? index - 1 : index + 2)
}

function canShift(id: number | undefined, offset: -1 | 1): boolean {
	if (id === undefined) return false
	const pane = paneOf(id)
	if (!pane) return false
	const index = pane.tabs.indexOf(id) + offset
	return index >= 0 && index < pane.tabs.length
}

// A split moves the tab into a new pane, so a pane with one tab would only leave an empty pane behind.
function canSplit(id: number | undefined): boolean {
	return id !== undefined && (paneOf(id)?.tabs.length ?? 0) > 1
}

function split(paneId: number, id: number, direction: WorkspaceDirection) {
	if (props.layout.split(paneId, direction, id)) focusControl()
}

function dropOnPane(paneId: number, id: number, zone: WorkspaceDropZone) {
	if (zone === 'center') {
		const target = props.layout.panes.find((pane) => pane.id === paneId)
		if (!target) return
		if (target.tabs.includes(id)) {
			select(id)
			focusControl()
		} else {
			moveTab(paneId, id, target.tabs.length)
		}
		return
	}
	const direction = zone === 'start' || zone === 'end' ? 'row' : 'column'
	droppedSplit = true
	if (props.layout.splitWith(paneId, direction, id, zone === 'start' || zone === 'top')) focusControl()
	else droppedSplit = false
}

/* Windows grow from the tab they leave and shrink toward the tab they return to. */

const windowOrigins = shallowReactive(new Map<number, string>())
const windowExit = shallowRef<WorkspaceWindowExit>('close')

/** A point of the tab of `id` as a transform origin for a box at `left`, `top` in the viewport. */
function tabOrigin(id: number, left: number, top: number): string | undefined {
	const tab = root.value?.querySelector(`[data-tab-item="${id}"]`)?.getBoundingClientRect()
	return tab && `${tab.left + tab.width / 2 - left}px ${tab.top + tab.height / 2 - top}px`
}

function floatView(id: number) {
	const area = root.value?.getBoundingClientRect()
	const tab = root.value?.querySelector(`[data-tab-item="${id}"]`)?.getBoundingClientRect()
	if (!props.layout.float(id, viewsById.value.get(id)?.preferredWindowSize)) return
	const floating = props.layout.windows.find((item) => item.viewId === id)
	if (area && tab && floating) {
		const { x, y } = windowBounds(floating.bounds)
		windowOrigins.set(
			id,
			`${tab.left + tab.width / 2 - area.left - x}px ${tab.top + tab.height / 2 - area.top - y}px`,
		)
	}
	focusControl()
}

function dockView(id: number) {
	const leaving = root.value?.querySelector<HTMLElement>(`[data-workspace-window="${id}"]`)
	windowExit.value = 'dock'
	if (!props.layout.dock(id)) {
		windowExit.value = 'close'
		return
	}
	windowOrigins.delete(id)
	nextTick(() => {
		windowExit.value = 'close'
		const box = leaving?.getBoundingClientRect()
		const origin = box && tabOrigin(id, box.left, box.top)
		if (leaving && origin) leaving.style.transformOrigin = origin
	})
	focusControl()
}

function closePane(paneId: number) {
	if (props.layout.closeEmptyPane(paneId)) focusControl()
}

// The layout changes once the menu has closed: changing it while the menu still closes removes
// the tab it returns focus to, and the menu then falls back to an unrelated control.
let pendingTabAction: (() => void) | undefined

function queueTabAction(action: string) {
	pendingTabAction = () => runTabAction(action)
}

function onTabMenuSettled(open: boolean) {
	const action = pendingTabAction
	pendingTabAction = undefined
	if (!open) action?.()
}

function runTabAction(action: string) {
	const id = tabMenu.getPayload()
	const pane = id === undefined ? undefined : paneOf(id)
	if (id === undefined || !pane) return
	switch (action) {
		case 'duplicate':
			return requestDuplicate(id)
		case 'move-left':
			return shiftTab(id, -1)
		case 'move-right':
			return shiftTab(id, 1)
		case 'split-right':
			return split(pane.id, id, 'row')
		case 'split-down':
			return split(pane.id, id, 'column')
		case 'float':
			return floatView(id)
	}
}

/* Tab drags. */

function startTabDrag(event: DragEvent, id: number) {
	const transfer = event.dataTransfer
	if (!transfer) return
	tabMenu.close()
	transfer.setData(tabDragType, String(id))
	transfer.effectAllowed = 'move'
	const tab = event.currentTarget instanceof Element ? event.currentTarget.closest('[data-tab-item]') : null
	dragging = { id, width: tab?.getBoundingClientRect().width ?? 0 }
	// The tab dims a frame later, once the browser has taken its picture for the drag image.
	cancelAnimationFrame(liftFrame)
	liftFrame = requestAnimationFrame(() => (liftedView.value = id))
}

function endTabDrag() {
	dragging = undefined
	cancelAnimationFrame(liftFrame)
	liftedView.value = undefined
}

function rejectTabDrop(event: DragEvent) {
	const transfer = event.dataTransfer
	if (!transfer?.types.includes(tabDragType)) return
	transfer.dropEffect = 'none'
	event.stopPropagation()
}

useEventListener(document, 'dragend', endTabDrag, { capture: true })

provide(workspaceContextKey, {
	get layout() {
		return props.layout
	},
	tabDragType,
	tabMenu,
	view: (id) => viewsById.value.get(id),
	draggedView: () => dragging?.id,
	draggedTabWidth: () => dragging?.width ?? 0,
	liftedView: () => liftedView.value,
	startTabDrag,
	registerOutlet: (key, element) => outlets.set(key, element),
	unregisterOutlet: (key, element) => {
		if (outlets.get(key) === element) outlets.delete(key)
	},
	select,
	close: requestClose,
	moveTab,
	dropOnPane,
	closePane,
} satisfies WorkspaceContext)

defineExpose({ focusControl })
</script>

<template>
	<section
		ref="root"
		aria-label="Workspace"
		class="relative isolate flex min-h-0 min-w-0 flex-1 overflow-hidden bg-page text-primary"
		@dragover="rejectTabDrop"
	>
		<div class="relative z-0 flex min-h-0 min-w-0 flex-1">
			<WorkspaceSplit v-slot="{ pane }" :node="layout.root">
				<WorkspacePane
					:key="pane.id"
					:pane="pane"
					:focused="layout.focused.type === 'pane' && layout.focused.id === pane.id"
					:can-close="layout.root.type === 'split'"
				/>
			</WorkspaceSplit>
		</div>
		<AnimatePresence :initial="false" :custom="windowExit">
			<WorkspaceWindow
				v-for="floating in layout.windows"
				:key="floating.viewId"
				:view-id="floating.viewId"
				:title="viewsById.get(floating.viewId)?.title ?? ''"
				:icon="viewsById.get(floating.viewId)?.icon"
				:layer="floating.layer"
				:bounds="windowBounds(floating.bounds)"
				:origin="windowOrigins.get(floating.viewId)"
				:focused="layout.focused.type === 'window' && layout.focused.id === floating.viewId"
				@focus-window="layout.focusWindow(floating)"
				@bounds="(bounds, action) => updateBounds(floating, bounds, action)"
				@dock="dockView(floating.viewId)"
				@close="requestClose(floating.viewId)"
			/>
		</AnimatePresence>
		<div hidden>
			<!-- Mount each view when first shown, then keep it mounted wherever its placement moves. -->
			<Teleport v-for="view in views" :key="view.id" :to="outletFor(view.id)" :disabled="!outletFor(view.id)">
				<div
					v-if="mountedViews.has(view.id) || (outletFor(view.id) && placements.get(view.id)?.visible)"
					class="contents"
					:data-workspace-view="view.id"
					@vue:mounted="mountedViews.add(view.id)"
					@vue:unmounted="mountedViews.delete(view.id)"
				>
					<slot name="view" :id="view.id" />
				</div>
			</Teleport>
		</div>
		<Menu :controller="tabMenu" @action="queueTabAction" @open-change-complete="onTabMenuSettled">
			<TabMenuContent
				v-slot="{ state }"
				:final-focus="focusTarget"
				keep-mounted
				class="min-w-44"
				aria-label="Tab actions"
			>
				<MenuItem value="duplicate">
					<MenuItemIcon><IconCopy class="size-4" aria-hidden="true" /></MenuItemIcon>
					Duplicate tab
				</MenuItem>
				<template v-if="canShift(state.payload, -1) || canShift(state.payload, 1)">
					<MenuSeparator />
					<MenuItem v-if="canShift(state.payload, -1)" value="move-left">
						<MenuItemIcon mirror><IconArrowLeft class="size-4" aria-hidden="true" /></MenuItemIcon>
						Move left
					</MenuItem>
					<MenuItem v-if="canShift(state.payload, 1)" value="move-right">
						<MenuItemIcon mirror><IconArrowRight class="size-4" aria-hidden="true" /></MenuItemIcon>
						Move right
					</MenuItem>
				</template>
				<MenuSeparator />
				<template v-if="canSplit(state.payload)">
					<MenuItem value="split-right">
						<MenuItemIcon><IconSplitRight class="size-4" aria-hidden="true" /></MenuItemIcon>
						Split right
					</MenuItem>
					<MenuItem value="split-down">
						<MenuItemIcon><IconSplitDown class="size-4" aria-hidden="true" /></MenuItemIcon>
						Split down
					</MenuItem>
				</template>
				<MenuItem value="float">
					<MenuItemIcon><IconAppWindow class="size-4" aria-hidden="true" /></MenuItemIcon>
					Float window
				</MenuItem>
			</TabMenuContent>
		</Menu>
	</section>
</template>
