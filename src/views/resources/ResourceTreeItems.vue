<script setup lang="ts">
import IconChevronDown from '~icons/lucide/chevron-down'
import IconFile from '~icons/lucide/file'
import IconFolder from '~icons/lucide/folder'
import { TreeGroup, TreeItem, TreeItemIndicator, TreeItemLabel } from '@ui-sdk/vue/tree'
import { count } from '@/lib/format'
import type { ResourceNode } from './tree'

defineOptions({ name: 'ResourceTreeItems' })

defineProps<{ nodes: ResourceNode[] }>()
</script>

<template>
	<TreeItem v-for="node in nodes" :key="node.value" :value="node.value" :label="node.label">
		<TreeItemLabel>
			<TreeItemIndicator v-if="node.children">
				<IconChevronDown class="size-4" aria-hidden="true" />
			</TreeItemIndicator>
			<IconFolder v-if="node.children" class="size-4 shrink-0" aria-hidden="true" />
			<IconFile v-else class="size-4 shrink-0" aria-hidden="true" />
			<span :class="node.name === null ? 'text-secondary' : 'font-mono text-data'" translate="no">{{
				node.label
			}}</span>
			<span v-if="node.children" class="ms-auto ps-2 text-caption text-secondary num">{{
				count(node.children.length)
			}}</span>
			<span v-else-if="!node.data" class="ms-auto ps-2 text-caption text-secondary">Unavailable</span>
		</TreeItemLabel>
		<TreeGroup v-if="node.children">
			<ResourceTreeItems :nodes="node.children" />
		</TreeGroup>
	</TreeItem>
</template>
