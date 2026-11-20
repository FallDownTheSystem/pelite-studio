<script setup lang="ts">
import IconMoon from '~icons/lucide/moon'
import IconPanelLeft from '~icons/lucide/panel-left'
import IconSearch from '~icons/lucide/search'
import IconSun from '~icons/lucide/sun'
import IconX from '~icons/lucide/x'
import { Button } from '@ui-sdk/vue/button'
import { formatShortcut } from '@ui-sdk/vue/shortcuts'
import { byteSize } from '@/lib/format'
import { describeImage } from '@/pe/describe'
import type { PeDocument } from '@/pe/document'

const props = defineProps<{
	doc: PeDocument | null
	sidebarOpen: boolean
}>()

defineEmits<{
	'toggle-sidebar': []
	'close-file': []
	'open-palette': []
}>()

const { theme, toggle: toggleTheme } = useTheme()

const image = computed(() => {
	const headers = props.doc?.peFile.headers()
	return headers && !(headers instanceof Error) ? describeImage(headers) : null
})

// The shortcut text depends on the platform, which is only known in the browser.
const paletteKeys = ref('')
onMounted(() => (paletteKeys.value = formatShortcut('mod+k')))
</script>

<template>
	<header
		class="flex h-11 shrink-0 items-center gap-2 border-b border-subtle bg-surface ps-2 pe-3 select-none"
	>
		<IconButton
			v-if="doc"
			:label="sidebarOpen ? 'Hide views' : 'Show views'"
			shortcut="mod+b"
			aria-controls="view-sidebar"
			:aria-expanded="sidebarOpen"
			@click="$emit('toggle-sidebar')"
		>
			<IconPanelLeft class="size-4" aria-hidden="true" />
		</IconButton>

		<div class="flex shrink-0 items-center gap-2" :class="doc ? '' : 'ps-1'">
			<span
				class="grid h-6.5 w-6 place-items-center rounded-[3px] rounded-se-[6px] bg-accent text-[0.6875rem] font-bold text-on-accent"
				aria-hidden="true"
				>PE</span
			>
			<span class="font-semibold" :class="doc ? 'max-sm:sr-only' : ''">PeLite Studio</span>
		</div>

		<template v-if="doc">
			<span class="mx-1 h-4 w-px shrink-0 bg-(--border-color-default)" aria-hidden="true"></span>
			<div class="flex min-w-0 items-center gap-2">
				<span class="truncate font-medium" :title="doc.file.name" translate="no">{{ doc.file.name }}</span>
				<span v-if="image" class="shrink-0 whitespace-nowrap text-secondary max-md:hidden">
					{{ image.format }}, {{ image.machine }}, {{ image.type }}
				</span>
				<span class="num shrink-0 whitespace-nowrap text-secondary max-lg:hidden">
					{{ byteSize(doc.file.size) }}
				</span>
			</div>
		</template>

		<div class="ms-auto flex shrink-0 items-center gap-1">
			<!-- One control at every width: a second, hidden copy would give the same name to two buttons. -->
			<Button v-if="doc" class="max-sm:px-1.5" aria-haspopup="dialog" @click="$emit('open-palette')">
				<IconSearch class="size-4 text-secondary" aria-hidden="true" />
				<span class="font-normal text-secondary max-sm:sr-only">Go to view or address</span>
				<kbd v-if="paletteKeys" class="ms-2 text-secondary max-sm:hidden" aria-hidden="true">{{
					paletteKeys
				}}</kbd>
			</Button>
			<IconButton :label="theme === 'dark' ? 'Use light theme' : 'Use dark theme'" @click="toggleTheme">
				<IconSun v-if="theme === 'dark'" class="size-4" aria-hidden="true" />
				<IconMoon v-else class="size-4" aria-hidden="true" />
			</IconButton>
			<IconButton v-if="doc" label="Close file" @click="$emit('close-file')">
				<IconX class="size-4" aria-hidden="true" />
			</IconButton>
		</div>
	</header>
</template>
