<script lang="ts">
import type { PeDocument } from '@/pe/document'
import type { FactsDatabase } from '@/pe/facts'
import type { ViewContent } from '@/pe/view'

export interface FactsData {
	/** Reactive already, and owned by the document: it outlives this tab. */
	db: FactsDatabase
}

export function prepare(doc: PeDocument): ViewContent<FactsData> {
	// Reading it here creates the database inside the workspace's error handling.
	return { data: { db: doc.facts } }
}
</script>

<script setup lang="ts">
import {
	SegmentedControl,
	SegmentedControlIndicator,
	SegmentedControlItem,
} from '@ui-sdk/vue/segmented-control'
import InspectFilters from './facts/InspectFilters.vue'
import InspectPanel from './facts/InspectPanel.vue'
import ManagePanel from './facts/ManagePanel.vue'
import { isDrafting } from './facts/model'

const props = defineProps<{ data: FactsData }>()
const db = props.data.db

const mode = computed({
	get: () => (db.mode === 'layers' ? 'layers' : 'inspect'),
	set: (value: string | null) => {
		if (!value || value === db.mode) return
		db.mode = value
		db.page = 0
	},
})

const root = useTemplateRef<HTMLElement>('root')
const { width } = useElementSize(root)
const compact = computed(() => width.value > 0 && width.value < 760)

/**
 * Undo and redo work anywhere in the view except in text fields, which keep their own undo.
 * They follow the toolbar: nothing happens while a draft or an import is open.
 */
function onKeydown(event: KeyboardEvent) {
	if (!(event.ctrlKey || event.metaKey) || event.altKey || event.defaultPrevented) return
	const target = event.target as HTMLElement | null
	if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return
	const key = event.key.toLowerCase()
	const redo = key === 'y' || (key === 'z' && event.shiftKey)
	if (key !== 'z' && key !== 'y') return
	event.preventDefault()
	if (isDrafting(db)) return
	if (redo ? db.future.length : db.past.length) db.undo(redo)
}
</script>

<template>
	<div ref="root" class="flex h-full min-h-0 min-w-0 flex-col" @keydown="onKeydown">
		<ViewPage
			fill
			title="Facts"
			description="Annotation layers for this image in the factmap format: symbols, comments, references, functions, decode hints and alignment, kept in memory until you export them."
		>
			<template #actions>
				<SegmentedControl v-model:value="mode" aria-label="Facts mode">
					<SegmentedControlIndicator />
					<SegmentedControlItem value="inspect">Inspect</SegmentedControlItem>
					<SegmentedControlItem value="layers">Manage layers</SegmentedControlItem>
				</SegmentedControl>
			</template>
			<template v-if="mode === 'inspect'" #toolbar>
				<InspectFilters :db="db" />
			</template>

			<InspectPanel v-if="mode === 'inspect'" :db="db" @manage="mode = 'layers'" />
			<ManagePanel v-else :db="db" :compact="compact" />
		</ViewPage>
	</div>
</template>
