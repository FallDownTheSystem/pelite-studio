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
import { Button } from '@ui-sdk/vue/button'
import { Tree } from '@ui-sdk/vue/tree'
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

const description = computed(
	() =>
		`${count(props.data.leaves)} ${props.data.leaves === 1 ? 'resource' : 'resources'} the program can load at run time (icons, version information, the manifest), filed by type, name and language.`,
)
</script>

<template>
	<ViewPage title="Resources" :description="description" fill>
		<template v-if="data.nodes.length" #actions>
			<Button data-size="sm" @click="expandAll">Expand all</Button>
			<Button data-size="sm" @click="collapseAll">Collapse all</Button>
		</template>
		<EmptyState v-if="!data.nodes.length" title="No resource entries in this file">
			The resource directory exists but lists no types.
		</EmptyState>
		<div v-else class="flex min-h-0 flex-1 flex-col @2xl:flex-row">
			<div
				class="scroll-thin max-h-[50%] min-h-0 shrink-0 overflow-auto border-b border-subtle p-2 @2xl:max-h-none @2xl:w-[clamp(16rem,35%,26rem)] @2xl:border-e @2xl:border-b-0"
			>
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
			<div class="scroll-thin min-h-0 min-w-0 flex-1 overflow-auto px-4 py-3 @2xl:px-6">
				<ResourceDetail v-if="selectedNode" :key="selectedNode.value" :node="selectedNode" />
				<EmptyState v-else title="No resource selected">
					Select a resource in the tree to see its address, size and contents.
				</EmptyState>
			</div>
		</div>
	</ViewPage>
</template>
