<script setup lang="ts">
import { useShortcut } from '@ui-sdk/vue/shortcuts'
import { errorMessage } from '@/lib/format'
import { toast } from '@/lib/overlays'
import type { PeDocument } from '@/pe/document'
import { createViewMenu } from '@/pe/registry'
import { workspaceKey, type AddressValue, type StatusTone } from '@/pe/view'
import { WorkspaceModel } from '@/workspace/model'
import type { WorkspaceViewInfo } from '@/workspace/types'
import WorkspaceArea from '@/workspace/WorkspaceArea.vue'
import AddressMenu from './AddressMenu.vue'
import CommandPalette from './CommandPalette.vue'
import DeferredMount from './DeferredMount.vue'
import ViewBoundary from './ViewBoundary.vue'
import ViewSidebar from './ViewSidebar.vue'

const props = defineProps<{
	doc: PeDocument
	/** Narrow window: the sidebar and the workspace take turns instead of sitting side by side. */
	compact: boolean
}>()

const emit = defineEmits<{
	status: [tone: StatusTone, text: string, detail?: string]
	'close-file': []
}>()

const sidebarOpen = defineModel<boolean>('sidebarOpen', { required: true })

const model = new WorkspaceModel()
const viewMenu = createViewMenu(props.doc)
const definitions = viewMenu.flatMap((group) => group.views)
const paletteOpen = ref(false)
const area = useTemplateRef('area')
const addressMenu = useTemplateRef('addressMenu')

const viewInfos = computed<WorkspaceViewInfo[]>(() =>
	model.views.map((view) => ({
		id: view.id,
		title: view.displayTitle,
		icon: view.definition.icon,
		preferredWindowSize: view.content.preferredWindowSize,
	})),
)

const viewsById = computed(() => new Map(model.views.map((view) => [view.id, view])))

function reportReady() {
	emit('status', 'ready', 'Ready', props.doc.file.name)
}

function openView(id: string, input?: unknown, afterViewId?: number) {
	const definition = definitions.find((view) => view.id === id)
	if (!definition?.available) return
	const existing =
		definition.singleton && afterViewId === undefined
			? model.views.find((view) => view.kind === id)
			: undefined
	if (existing) {
		activateView(existing.id)
		return
	}
	try {
		model.createView(definition, props.doc, input, afterViewId)
		reportReady()
	} catch (error) {
		const detail = errorMessage(error)
		emit('status', 'error', `${definition.title} not opened`, detail)
		toast.error(`${definition.title} not opened`, { description: detail })
	}
}

function activateView(id: number) {
	if (model.layout.activate(id)) reportReady()
}

function closeView(id: number) {
	if (model.closeView(id)) reportReady()
}

function duplicateView(id: number) {
	const source = viewsById.value.get(id)
	if (source) openView(source.kind, source.content.duplicateData, source.id)
}

/** In a narrow window, choosing a view also brings the workspace forward. */
function showContent() {
	if (!props.compact) return
	sidebarOpen.value = false
	area.value?.focusControl()
}

function openFromSidebar(id: string) {
	openView(id)
	showContent()
}

function activateFromSidebar(id: number) {
	activateView(id)
	showContent()
}

function openFromPalette(id: string, input?: unknown) {
	openView(id, input)
	showContent()
}

function showAddressMenu(anchor: Element | { x: number; y: number }, address: AddressValue) {
	addressMenu.value?.openFor(anchor, address)
}

provide(workspaceKey, {
	doc: props.doc,
	openView: (id, input) => openView(id, input),
	setStatus: (tone, text, detail) => emit('status', tone, text, detail),
	showAddressMenu,
})

/**
 * The sidebar slides when a pointer toggles it, so the eye can follow where the views went.
 * A keyboard toggle is instant: it repeats often and the result must show at once.
 */
const sidebarMotion = ref(true)

function toggleSidebarInstantly() {
	sidebarMotion.value = false
	sidebarOpen.value = !sidebarOpen.value
	requestAnimationFrame(() => requestAnimationFrame(() => (sidebarMotion.value = true)))
}

useShortcut('mod+b', toggleSidebarInstantly, { description: 'Show or hide views' })
useShortcut('mod+k', () => (paletteOpen.value = true), {
	description: 'Go to view or address',
	allowInInput: true,
})

/**
 * Views that open with the file appear together with the workspace. Every view opened later
 * mounts one frame after its tab, so the tab answers the click at once (see DeferredMount).
 */
const openedWithFile = new Set<number>()

onMounted(() => {
	openView('summary')
	for (const view of model.views) openedWithFile.add(view.id)
})

defineExpose({ openPalette: () => (paletteOpen.value = true), openView })
</script>

<template>
	<div class="relative flex min-h-0 min-w-0 flex-1">
		<ViewSidebar
			class="shrink-0 border-e border-subtle"
			:class="[
				compact ? 'w-full border-e-0' : 'w-60',
				sidebarOpen ? '' : 'sidebar-closed',
				sidebarMotion && !compact ? 'sidebar-motion' : '',
			]"
			:inert="!sidebarOpen"
			:groups="viewMenu"
			:open-views="model.views"
			:active-view-id="model.activeViewId"
			@open-view="openFromSidebar"
			@activate-view="activateFromSidebar"
			@close-view="closeView"
		/>
		<div v-show="!(compact && sidebarOpen)" class="flex min-h-0 min-w-0 flex-1 flex-col">
			<WorkspaceArea
				ref="area"
				class="min-h-0 flex-1"
				:layout="model.layout"
				:views="viewInfos"
				@close-view="closeView"
				@duplicate-view="duplicateView"
				@contextmenu="addressMenu?.openFromEvent($event)"
			>
				<template #view="{ id }">
					<ViewBoundary
						v-if="viewsById.has(id)"
						:title="viewsById.get(id)!.definition.title"
						@error="emit('status', 'error', `${viewsById.get(id)?.definition.title} stopped`, $event)"
					>
						<DeferredMount :immediate="openedWithFile.has(id)">
							<component
								:is="viewsById.get(id)!.definition.component"
								:data="viewsById.get(id)!.content.data"
							/>
						</DeferredMount>
					</ViewBoundary>
				</template>
			</WorkspaceArea>
		</div>
		<AddressMenu ref="addressMenu" :doc="doc" @open="openView" />
		<CommandPalette
			v-model:open="paletteOpen"
			:doc="doc"
			:groups="viewMenu"
			:open-views="model.views"
			@open-view="openFromPalette"
			@activate-view="activateFromSidebar"
			@toggle-sidebar="toggleSidebarInstantly"
			@close-file="emit('close-file')"
		/>
	</div>
</template>

<style scoped>
/*
 * A closed sidebar leaves the layout at once, so the workspace is laid out one time and not on
 * every frame, and the sidebar slides away over it. Opening takes the space at once and slides in.
 */
.sidebar-closed {
	position: absolute;
	inset-block: 0;
	inset-inline-start: 0;
	z-index: 20;
	translate: -100% 0;
	visibility: hidden;

	&:dir(rtl) {
		translate: 100% 0;
	}
}

@media (prefers-reduced-motion: no-preference) {
	.sidebar-motion {
		transition:
			translate var(--motion-move) var(--ease-out),
			visibility 0s;

		&.sidebar-closed {
			transition:
				translate var(--motion-exit) var(--ease-out),
				visibility 0s var(--motion-exit);
		}
	}
}
</style>
