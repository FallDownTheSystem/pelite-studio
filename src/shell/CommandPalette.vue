<script setup lang="ts">
import IconBinary from '~icons/lucide/binary'
import IconCpu from '~icons/lucide/cpu'
import IconMoon from '~icons/lucide/moon'
import IconPanelLeft from '~icons/lucide/panel-left'
import IconSearch from '~icons/lucide/search'
import IconX from '~icons/lucide/x'
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandGroupLabel,
	CommandInput,
	CommandItem,
	CommandItemIcon,
	CommandList,
	CommandShortcut,
} from '@ui-sdk/vue/command'
import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from '@ui-sdk/vue/dialog'
import { addressTargets, describeTarget, parseAddress } from '@/pe/address'
import type { PeDocument } from '@/pe/document'
import type { ViewMenuGroup } from '@/pe/registry'
import type { WorkspaceView } from '@/workspace/model'

/**
 * One field for moving around a file: type a view's name to open it, or an address to
 * see it in Hex Dump or Disassembly. It opens and closes without animation because it is
 * used constantly.
 */
const props = defineProps<{
	doc: PeDocument
	groups: ViewMenuGroup[]
	openViews: readonly WorkspaceView[]
}>()

const emit = defineEmits<{
	'open-view': [id: string, input?: unknown]
	'activate-view': [id: number]
	'toggle-sidebar': []
	'close-file': []
}>()

const open = defineModel<boolean>('open', { default: false })
const query = ref('')
const { toggle: toggleTheme } = useTheme()

watch(open, (isOpen) => {
	if (isOpen) query.value = ''
})

const views = computed(() =>
	props.groups.flatMap((group) =>
		group.views.filter((view) => view.available).map((view) => ({ ...view, group: group.title })),
	),
)

const copies = computed(() => props.openViews.filter((view) => !view.definition.singleton))

const addresses = computed(() => {
	const value = parseAddress(query.value)
	if (value === null) return []
	const seen = new Set<string>()
	return addressTargets(props.doc, value).flatMap((target) => {
		// Two readings of one number can land on the same place; one row for each place is enough.
		const key = `address:${target.viewer}:${target.rva}`
		if (seen.has(key)) return []
		seen.add(key)
		return {
			value: key,
			viewer: target.viewer,
			// The typed text is part of the label so the palette's own filter keeps the row.
			label: `${target.viewerTitle} at ${describeTarget(target, value)}`,
			keywords: [query.value.trim()],
		}
	})
})

function run(value: string) {
	const [type, first, second] = value.split(':')
	open.value = false
	if (type === 'view') emit('open-view', first)
	else if (type === 'copy') emit('activate-view', Number(first))
	else if (type === 'address') emit('open-view', first, { rva: Number(second) })
	else if (value === 'action:sidebar') emit('toggle-sidebar')
	else if (value === 'action:theme') toggleTheme()
	else if (value === 'action:close') emit('close-file')
}
</script>

<template>
	<Dialog v-model:open="open">
		<DialogBackdrop />
		<DialogContent class="command-palette" aria-describedby="">
			<DialogTitle class="sr-only">Go to view or address</DialogTitle>
			<Command v-model:query="query" @action="run">
				<div class="flex items-center gap-2 border-b border-subtle px-3">
					<IconSearch class="size-4 shrink-0 text-secondary" aria-hidden="true" />
					<CommandInput
						aria-label="Go to view or address"
						placeholder="Imports, 0x1000, 0x140001000…"
						autocomplete="off"
						autocapitalize="none"
						autocorrect="off"
						spellcheck="false"
					/>
				</div>
				<CommandEmpty>
					No view or address matches “{{ query }}”. An address must be inside the image.
				</CommandEmpty>
				<CommandList class="scroll-thin">
					<CommandGroup v-if="addresses.length">
						<CommandGroupLabel>Address</CommandGroupLabel>
						<CommandItem
							v-for="item in addresses"
							:key="item.value"
							:value="item.value"
							:label="item.label"
							:keywords="item.keywords"
						>
							<CommandItemIcon>
								<IconCpu v-if="item.viewer === 'disasm'" class="size-4" aria-hidden="true" />
								<IconBinary v-else class="size-4" aria-hidden="true" />
							</CommandItemIcon>
							<span class="num" translate="no">{{ item.label }}</span>
						</CommandItem>
					</CommandGroup>
					<CommandGroup v-if="copies.length">
						<CommandGroupLabel>Open copies</CommandGroupLabel>
						<CommandItem
							v-for="view in copies"
							:key="view.id"
							:value="`copy:${view.id}`"
							:label="view.displayTitle"
						>
							<CommandItemIcon
								><component :is="view.definition.icon" class="size-4" aria-hidden="true"
							/></CommandItemIcon>
							<span class="num">{{ view.displayTitle }}</span>
						</CommandItem>
					</CommandGroup>
					<CommandGroup>
						<CommandGroupLabel>Views</CommandGroupLabel>
						<CommandItem
							v-for="view in views"
							:key="view.id"
							:value="`view:${view.id}`"
							:label="view.title"
							:keywords="view.group ? [view.group] : undefined"
						>
							<CommandItemIcon
								><component :is="view.icon" class="size-4" aria-hidden="true"
							/></CommandItemIcon>
							{{ view.title }}
							<span v-if="view.group" class="ms-auto text-caption text-secondary">{{ view.group }}</span>
						</CommandItem>
					</CommandGroup>
					<CommandGroup>
						<CommandGroupLabel>Actions</CommandGroupLabel>
						<CommandItem value="action:sidebar" label="Show or hide views" shortcut="mod+b">
							<CommandItemIcon><IconPanelLeft class="size-4" aria-hidden="true" /></CommandItemIcon>
							Show or hide views
							<CommandShortcut class="ms-auto" />
						</CommandItem>
						<CommandItem
							value="action:theme"
							label="Switch between light and dark theme"
							:keywords="['dark', 'light', 'theme']"
						>
							<CommandItemIcon><IconMoon class="size-4" aria-hidden="true" /></CommandItemIcon>
							Switch between light and dark theme
						</CommandItem>
						<CommandItem value="action:close" label="Close file">
							<CommandItemIcon><IconX class="size-4" aria-hidden="true" /></CommandItemIcon>
							Close file
						</CommandItem>
					</CommandGroup>
				</CommandList>
			</Command>
		</DialogContent>
	</Dialog>
</template>

<style>
/* Sits in the upper third, where the eye already is, and has no padding of its own. */
[data-slot='dialog-content'].command-palette {
	inset-block: 12dvh auto;
	width: min(36rem, calc(100% - 2rem));
	padding: 0;
	gap: 0;
	overflow: hidden;
	border-radius: 0.5rem;
	box-shadow: var(--shadow-window);
}

.command-palette [data-slot='command'] {
	width: 100%;
	max-width: none;
	border: 0;
}

.command-palette [data-slot='command-input'] {
	height: 2.75rem;
	border: 0;
	outline: none;
}

.command-palette [data-slot='command-list'] {
	max-height: min(24rem, 60dvh);
	overflow-y: auto;
}
</style>
