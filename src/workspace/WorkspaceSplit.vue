<script setup lang="ts">
import { Resizable, ResizableHandle, ResizablePanel } from '@ui-sdk/vue/resizable'
import { clamp, maxSplitRatio, minSplitRatio, type WorkspaceNode, type WorkspacePaneNode } from './layout'

const props = defineProps<{ node: WorkspaceNode }>()
defineSlots<{ default(props: { pane: WorkspacePaneNode }): unknown }>()

const minSize = minSplitRatio * 100
const maxSize = maxSplitRatio * 100

const sizes = computed(() => {
	const node = props.node
	return node.type === 'split' ? [node.ratio * 100, (1 - node.ratio) * 100] : []
})

function resize(next: number[]) {
	const node = props.node
	if (node.type === 'split' && next.length === 2) {
		node.ratio = clamp(next[0] / 100, minSplitRatio, maxSplitRatio)
	}
}
</script>

<template>
	<slot v-if="node.type === 'pane'" :pane="node" />
	<Resizable
		v-else
		:layout="sizes"
		:orientation="node.direction === 'row' ? 'horizontal' : 'vertical'"
		:step="5"
		class="min-h-0 min-w-0 flex-1 rounded-none border-0"
		@update:layout="resize"
	>
		<ResizablePanel :min-size="minSize" :max-size="maxSize" class="flex min-h-0 min-w-0 p-0">
			<WorkspaceSplit v-slot="scope" :node="node.first"><slot v-bind="scope" /></WorkspaceSplit>
		</ResizablePanel>
		<ResizableHandle
			aria-label="Resize split"
			:data-workspace-split="node.id"
			class="focus-visible:bg-accent focus-visible:shadow-none focus-visible:outline-offset-0! data-dragging:bg-accent data-hovering:bg-accent"
		/>
		<ResizablePanel :min-size="minSize" :max-size="maxSize" class="flex min-h-0 min-w-0 p-0">
			<WorkspaceSplit v-slot="scope" :node="node.second"><slot v-bind="scope" /></WorkspaceSplit>
		</ResizablePanel>
	</Resizable>
</template>
