<script setup lang="ts">
import type { ChangeDetails } from '@ui-sdk/core'
import type { TabsValueChangeReason } from '@ui-sdk/core/tabs'
import { Tabs } from '@ui-sdk/vue/tabs'
import { AnimatePresence, motion, useReducedMotion } from 'motion-v'
import IconX from '~icons/lucide/x'
import IconButton from '@/components/ui/IconButton.vue'
import { enterTransition, exitTransition, trackSpring } from '@/lib/motion'
import type { WorkspacePaneNode } from './layout'
import { paneOutletKey, useWorkspace, type WorkspaceDropZone } from './types'
import WorkspaceOutlet from './WorkspaceOutlet.vue'
import WorkspaceTabBar from './WorkspaceTabBar.vue'

const props = defineProps<{ pane: WorkspacePaneNode; focused: boolean; canClose: boolean }>()

const workspace = useWorkspace()
const zone = ref<WorkspaceDropZone | null>(null)

const zoneClass: Record<WorkspaceDropZone, string> = {
	start: 'inset-y-1 start-1 end-1/2',
	end: 'inset-y-1 start-1/2 end-1',
	top: 'inset-x-1 top-1 bottom-1/2',
	bottom: 'inset-x-1 top-1/2 bottom-1',
	center: 'inset-1',
}

const reducedMotion = useReducedMotion()

// The preview moves between zones instead of jumping, so the eye reads where the tab will land.
const zoneTransition = { opacity: enterTransition, layout: trackSpring } as const

// The layout owns the selection; the tabs only report what the user picked.
function onValueChange(value: string | null, details: ChangeDetails<TabsValueChangeReason>) {
	const picked =
		details.reason === 'item-press' || details.reason === 'list-navigation' || details.source === 'agent'
	if (value !== null && picked) workspace.select(Number(value))
	// Any other change is the tabs' own guess, for example after a tab closes. The layout decides that.
	else details.cancel()
}

function focusPane() {
	workspace.layout.focusPane(props.pane.id)
}

function zoneAt(event: DragEvent, body: HTMLElement): WorkspaceDropZone | null {
	const { tabs } = props.pane
	const dragged = workspace.draggedView()
	const own = dragged !== undefined && tabs.includes(dragged)
	if (!tabs.length) return 'center'
	if (own && tabs.length === 1) return null
	const rect = body.getBoundingClientRect()
	const x = (event.clientX - rect.left) / rect.width
	const y = (event.clientY - rect.top) / rect.height
	const fromSide = Math.min(x, 1 - x)
	const fromEdge = Math.min(y, 1 - y)
	if (fromSide > 0.25 && fromEdge > 0.25) return own ? null : 'center'
	if (fromSide < fromEdge) {
		const rtl = getComputedStyle(body).direction === 'rtl'
		return x < 0.5 !== rtl ? 'start' : 'end'
	}
	return y < 0.5 ? 'top' : 'bottom'
}

function isTabDrag(event: DragEvent): boolean {
	return !!event.dataTransfer?.types.includes(workspace.tabDragType)
}

function previewDrop(event: DragEvent) {
	if (!isTabDrag(event)) return
	event.preventDefault()
	event.stopPropagation()
	const next = zoneAt(event, event.currentTarget as HTMLElement)
	event.dataTransfer!.dropEffect = next ? 'move' : 'none'
	if (zone.value !== next) zone.value = next
}

function leaveDrop(event: DragEvent) {
	const body = event.currentTarget as HTMLElement
	if (!(event.relatedTarget instanceof Node) || !body.contains(event.relatedTarget)) zone.value = null
}

function drop(event: DragEvent) {
	const target = zone.value
	zone.value = null
	const id = Number(event.dataTransfer?.getData(workspace.tabDragType) || Number.NaN)
	if (!target || !Number.isFinite(id)) return
	event.preventDefault()
	event.stopPropagation()
	workspace.dropOnPane(props.pane.id, id, target)
}

function clearZone() {
	zone.value = null
}

onMounted(() => document.addEventListener('dragend', clearZone, true))
onBeforeUnmount(() => document.removeEventListener('dragend', clearZone, true))
</script>

<template>
	<section
		:data-workspace-pane="pane.id"
		aria-label="Pane"
		:tabindex="pane.tabs.length ? -1 : 0"
		class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-page focus-visible:-outline-offset-2"
		@pointerdown.capture="focusPane"
		@focusin="focusPane"
	>
		<Tabs
			:value="pane.selected === undefined ? null : String(pane.selected)"
			class="flex min-h-0 min-w-0 flex-1 flex-col gap-0"
			@value-change="onValueChange"
		>
			<WorkspaceTabBar v-if="pane.tabs.length" :pane="pane" :focused="focused" />
			<div
				class="relative flex min-h-0 min-w-0 flex-1 flex-col"
				@dragover="previewDrop"
				@dragleave="leaveDrop"
				@drop="drop"
			>
				<WorkspaceOutlet
					v-for="id in pane.tabs"
					:key="id"
					:target="paneOutletKey(pane.id, id)"
					:tab="String(id)"
				/>
				<template v-if="!pane.tabs.length">
					<div
						class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 p-6 text-center"
					>
						<p class="m-0 text-body font-medium text-primary">No views open</p>
						<p class="m-0 max-w-72 text-body text-secondary">
							Open one from the sidebar or from Go to view or address.
						</p>
					</div>
					<div v-if="canClose" class="absolute end-1 top-1">
						<IconButton label="Close empty pane" size="sm" @click="workspace.closePane(pane.id)">
							<IconX class="size-4 shrink-0" aria-hidden="true" />
						</IconButton>
					</div>
				</template>
				<AnimatePresence>
					<motion.div
						v-if="zone"
						key="zone"
						:layout="!reducedMotion"
						:initial="{ opacity: 0 }"
						:animate="{ opacity: 1 }"
						:exit="{ opacity: 0, transition: exitTransition }"
						:transition="zoneTransition"
						class="pointer-events-none absolute z-10 rounded-md border-2 border-accent-border bg-accent-subtle/60"
						:class="zoneClass[zone]"
						aria-hidden="true"
					/>
				</AnimatePresence>
			</div>
		</Tabs>
	</section>
</template>
