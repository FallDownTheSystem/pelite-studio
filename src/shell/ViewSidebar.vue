<script setup lang="ts">
import IconChevronDown from '~icons/lucide/chevron-down'
import IconX from '~icons/lucide/x'
import { Tree, TreeGroup, TreeItem, TreeItemIndicator, TreeItemLabel } from '@ui-sdk/vue/tree'
import type { ViewMenuEntry, ViewMenuGroup } from '@/pe/registry'
import type { WorkspaceView } from '@/workspace/model'

/**
 * Every view the file offers, grouped as the PE format groups them. A view that is open
 * carries a mark, and the one in front is the current item. Views that can be open more
 * than once (Hex Dump, Disassembly, Scanner) list their open copies beneath them.
 */
const props = defineProps<{
	groups: ViewMenuGroup[]
	openViews: readonly WorkspaceView[]
	activeViewId: number | undefined
}>()

const emit = defineEmits<{
	'open-view': [id: string]
	'activate-view': [id: number]
	'close-view': [id: number]
}>()

const expanded = ref(props.groups.filter((group) => group.title).map((group) => `group:${group.id}`))

function instancesOf(view: ViewMenuEntry): WorkspaceView[] {
	return view.singleton ? [] : props.openViews.filter((open) => open.kind === view.id)
}

function isOpen(view: ViewMenuEntry): boolean {
	return props.openViews.some((open) => open.kind === view.id)
}

const current = computed(() => {
	const active = props.openViews.find((view) => view.id === props.activeViewId)
	if (!active) return null
	return active.definition.singleton ? `view:${active.kind}` : `instance:${active.id}`
})

// A view that opens its first copy becomes a branch; show the copy without a second press.
watch(
	() => props.openViews.filter((view) => !view.definition.singleton).map((view) => view.kind),
	(kinds) => {
		for (const kind of new Set(kinds)) {
			const value = `view:${kind}`
			if (!expanded.value.includes(value)) expanded.value = [...expanded.value, value]
		}
	},
)

/** Pressing a view opens it. Only a group heading folds on a press. */
function onExpandedChange(next: string[], details: { reason: string; cancel: () => void }) {
	if (details.reason !== 'item-press') return
	const before = expanded.value
	const changed = [
		...next.filter((value) => !before.includes(value)),
		...before.filter((value) => !next.includes(value)),
	]
	if (changed.some((value) => value.startsWith('view:'))) details.cancel()
}

function onAction(value: string) {
	const [type, id] = value.split(':')
	if (type === 'view') emit('open-view', id)
	else if (type === 'instance') emit('activate-view', Number(id))
}

function onKeydown(event: KeyboardEvent) {
	if (event.key !== 'Delete' || !(event.target instanceof HTMLElement)) return
	const id = event.target.closest<HTMLElement>('[data-instance]')?.dataset.instance
	if (id) emit('close-view', Number(id))
}
</script>

<template>
	<!-- Positioned, so its visually hidden labels are clipped by it and never make the page scroll. -->
	<nav
		id="view-sidebar"
		class="scroll-thin relative flex min-h-0 flex-col overflow-y-auto bg-surface py-2"
		aria-label="Views"
	>
		<Tree
			v-model:expanded="expanded"
			class="view-tree px-2"
			aria-label="Views"
			mode="none"
			:current="current"
			@expanded-change="onExpandedChange"
			@action="onAction"
			@keydown="onKeydown"
		>
			<template v-for="group in groups" :key="group.id">
				<component
					:is="group.title ? TreeItem : 'div'"
					v-bind="group.title ? { value: `group:${group.id}` } : { role: 'none', class: 'contents' }"
				>
					<TreeItemLabel v-if="group.title" class="mt-2 text-caption font-medium text-secondary">
						<!-- The default stylesheet turns this part a quarter left while the group is folded. -->
						<TreeItemIndicator><IconChevronDown class="size-3.5" aria-hidden="true" /></TreeItemIndicator>
						{{ group.title }}
					</TreeItemLabel>
					<component
						:is="group.title ? TreeGroup : 'div'"
						v-bind="group.title ? {} : { role: 'none', class: 'contents' }"
					>
						<TreeItem
							v-for="view in group.views"
							:key="view.id"
							:value="`view:${view.id}`"
							:disabled="!view.available"
							:branch="instancesOf(view).length > 0"
						>
							<TreeItemLabel
								:title="view.available ? undefined : `${view.title} is not present in this file`"
							>
								<component :is="view.icon" class="size-4 shrink-0 text-secondary" aria-hidden="true" />
								<span class="min-w-0 flex-1 truncate">{{ view.title }}</span>
								<span v-if="!view.available" class="sr-only">, not present in this file</span>
								<template v-else-if="isOpen(view) && view.singleton">
									<span class="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true"></span>
									<span class="sr-only">, open</span>
								</template>
								<span v-else-if="instancesOf(view).length" class="num shrink-0 text-caption text-secondary">
									{{ instancesOf(view).length }}<span class="sr-only"> open</span>
								</span>
							</TreeItemLabel>
							<TreeGroup v-if="instancesOf(view).length">
								<TreeItem
									v-for="instance in instancesOf(view)"
									:key="instance.id"
									:value="`instance:${instance.id}`"
									:label="instance.displayTitle"
									:data-instance="instance.id"
									@auxclick.middle.prevent="emit('close-view', instance.id)"
								>
									<TreeItemLabel class="group/instance">
										<span
											class="min-w-0 flex-1 truncate"
											:class="instance.content.titleSuffix ? 'num font-mono text-data' : ''"
											:title="instance.displayTitle"
										>
											{{ instance.content.titleSuffix ?? instance.displayTitle }}
										</span>
										<!-- Pointer shortcut only: the keyboard closes a copy with Delete. -->
										<span
											class="grid size-5 shrink-0 place-items-center rounded-sm text-secondary opacity-0 group-hover/instance:opacity-100 group-data-current/instance:opacity-100 hover:bg-pressed hover:text-primary"
											aria-hidden="true"
											@click.stop="emit('close-view', instance.id)"
										>
											<IconX class="size-3.5" />
										</span>
									</TreeItemLabel>
								</TreeItem>
							</TreeGroup>
						</TreeItem>
					</component>
				</component>
			</template>
		</Tree>
	</nav>
</template>

<style>
/* Rows are 28px and indent by level; the current view reads as "you are here" without a weight change. */
.view-tree [data-slot='tree-label'] {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	min-height: 1.75rem;
	padding-block: 0;
	padding-inline: calc(0.5rem + (var(--tree-level, 1) - 1) * 0.875rem) 0.5rem;
	border-radius: 0.25rem;
	cursor: pointer;
	user-select: none;
}

/* An open copy has no icon of its own, so its text lines up with its view's text, not its icon. */
.view-tree [data-instance] > [data-slot='tree-label'] {
	padding-inline-start: calc(2rem + (var(--tree-level, 1) - 2) * 0.875rem);
}

.view-tree [data-slot='tree-label']:hover:not([data-disabled]) {
	background: var(--background-color-hover);
}

.view-tree [data-slot='tree-label'][data-current] {
	background: var(--color-accent-subtle);
	color: var(--text-color-primary);
}

.view-tree [data-slot='tree-label'][data-current] > svg {
	color: var(--color-accent);
}

.view-tree [data-slot='tree-label'][data-disabled] {
	color: var(--text-color-disabled);
	cursor: default;
}

.view-tree [data-slot='tree-label'][data-disabled] > svg {
	color: var(--text-color-disabled);
}

.view-tree [data-slot='tree-item']:focus-visible {
	outline: none;
}

.view-tree [data-slot='tree-item']:focus-visible > [data-slot='tree-label'] {
	outline: 2px solid var(--color-focus);
	outline-offset: -2px;
}
</style>
