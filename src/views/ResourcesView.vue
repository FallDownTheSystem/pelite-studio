<script lang="ts">
import { reactive } from 'vue'
import type { PeDocument } from '@/pe/document'
import type { ViewContent } from '@/pe/view'
import { unwrap } from '@/pe/pelite'
import { buildResourceTree, countLeaves, type ResourceNode } from './resources/tree'

export interface ResourcesData {
	nodes: ResourceNode[]
	leaves: number
	state: { expanded: string[]; selected: string | null }
}

export function prepare(doc: PeDocument): ViewContent<ResourcesData> {
	const tree = unwrap(doc.peFile.resourcesTree())
	if (tree === null) throw new Error('The resource directory could not be parsed.')
	const nodes = buildResourceTree(tree)
	return {
		data: { nodes, leaves: countLeaves(nodes), state: reactive({ expanded: [], selected: null }) },
	}
}
</script>

<script setup lang="ts">
import IconCollapse from '~icons/lucide/chevrons-down-up'
import IconExpand from '~icons/lucide/chevrons-up-down'
import { Tree } from '@ui-sdk/vue/tree'
import IconButton from '@/components/ui/IconButton.vue'
import { count } from '@/lib/format'
import { branchValues, findNode } from './resources/tree'
import ResourceDetail from './resources/ResourceDetail.vue'
import ResourceTreeItems from './resources/ResourceTreeItems.vue'

const props = defineProps<{ data: ResourcesData }>()

const state = props.data.state

const selectedNode = computed(() => findNode(props.data.nodes, state.selected))

const allBranches = branchValues(props.data.nodes)

function expandAll() {
	state.expanded = [...allBranches]
}

function collapseAll() {
	state.expanded = []
}

const typeCount = computed(() => {
	const types = props.data.nodes.length
	return `${count(types)} ${types === 1 ? 'type' : 'types'}`
})

const description = computed(
	() =>
		`${count(props.data.leaves)} ${props.data.leaves === 1 ? 'resource' : 'resources'} the program can load at run time (icons, version information, the manifest), filed by type, name and language.`,
)
</script>

<template>
	<ViewPage title="Resources" :description="description" fill>
		<EmptyState v-if="!data.nodes.length" title="No resource entries in this file">
			The resource directory exists but lists no types.
		</EmptyState>
		<div v-else class="flex min-h-0 flex-1 flex-col @2xl:flex-row">
			<div
				class="flex max-h-[50%] min-h-0 shrink-0 flex-col border-b border-subtle @2xl:max-h-none @2xl:w-[clamp(16rem,35%,26rem)] @2xl:border-e @2xl:border-b-0"
			>
				<!-- The two actions change the tree only, so they sit on the tree and not in the page header. -->
				<div
					class="flex h-8 shrink-0 items-center gap-1 border-b border-subtle ps-(--page-inset) pe-1.5 text-caption text-secondary"
				>
					<span class="me-auto">{{ typeCount }}</span>
					<IconButton label="Expand all" size="sm" side="top" @click="expandAll">
						<IconExpand class="size-4" aria-hidden="true" />
					</IconButton>
					<IconButton label="Collapse all" size="sm" side="top" @click="collapseAll">
						<IconCollapse class="size-4" aria-hidden="true" />
					</IconButton>
				</div>
				<div class="scroll-thin min-h-0 flex-1 overflow-auto p-2">
					<Tree
						v-model:value="state.selected"
						v-model:expanded="state.expanded"
						:items="data.nodes"
						aria-label="Resource tree"
						activation="automatic"
					>
						<ResourceTreeItems :nodes="data.nodes" />
					</Tree>
				</div>
			</div>
			<div class="scroll-thin min-h-0 min-w-0 flex-1 overflow-auto px-4 py-3 @2xl:px-6">
				<ResourceDetail v-if="selectedNode" :key="selectedNode.value" :node="selectedNode" />
				<EmptyState v-else title="No resource selected">
					Select a resource in the tree to see its address, size and contents.
				</EmptyState>
			</div>
		</div>
	</ViewPage>
</template>
