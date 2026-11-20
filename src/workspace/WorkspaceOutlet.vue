<script setup lang="ts">
import { TabsPanel } from '@ui-sdk/vue/tabs'
import type { ComponentPublicInstance } from 'vue'
import { useWorkspace } from './types'

/**
 * The scroll container a view is teleported into. Inside a pane it is that tab's panel;
 * in a floating window it is a plain region.
 */
const props = defineProps<{ target: string; tab?: string }>()

const workspace = useWorkspace()
const element = useTemplateRef<HTMLElement | ComponentPublicInstance>('element')
let registered: HTMLElement | undefined

onMounted(() => {
	const node = element.value
	registered = node instanceof HTMLElement ? node : (node?.$el as HTMLElement | undefined)
	if (registered) workspace.registerOutlet(props.target, registered)
})

onBeforeUnmount(() => {
	if (registered) workspace.unregisterOutlet(props.target, registered)
})
</script>

<template>
	<TabsPanel
		v-if="tab !== undefined"
		ref="element"
		:value="tab"
		keep-mounted
		class="min-h-0 min-w-0 flex-1 overflow-auto p-0 scroll-thin @container focus-visible:-outline-offset-2!"
	/>
	<div
		v-else
		ref="element"
		class="min-h-0 min-w-0 flex-1 overflow-auto scroll-thin @container focus-visible:-outline-offset-2"
	/>
</template>
