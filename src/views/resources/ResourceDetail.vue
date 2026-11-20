<script setup lang="ts">
import IconDownload from '~icons/lucide/download'
import { Button } from '@ui-sdk/vue/button'
import { byteCount, count, hex } from '@/lib/format'
import { decodeBytes, hexLines, safeFileName, type ResourceNode } from './tree'

const props = defineProps<{ node: ResourceNode }>()

const previewLimit = 256

/** Label beside value in a narrow panel, label above value once the grid has columns. */
const fieldClass =
	'grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-x-3 @md:flex @md:flex-col @md:items-stretch @md:gap-0.5'

const levels = ['Type', 'Name', 'Language']

const trail = computed(() =>
	props.node.trail.map((label, index) => ({ title: levels[index] ?? `Level ${index + 1}`, label })),
)

/** Language IDs are LANGIDs: show the hex form that Windows documentation uses next to the decimal ID. */
function languageHex(label: string): string | undefined {
	const match = /^#(\d+)$/.exec(label)
	return match ? hex(Number(match[1]), 4) : undefined
}

const bytes = computed(() => {
	const encoded = props.node.data?.bytes
	if (encoded == null) return null
	try {
		return decodeBytes(encoded)
	} catch {
		return null
	}
})

const lines = computed(() => (bytes.value ? hexLines(bytes.value, previewLimit) : []))

const textTypes = new Set(['RT_MANIFEST', 'RT_HTML'])

const text = computed(() => {
	if (!bytes.value || !textTypes.has(props.node.trail[0] ?? '')) return null
	return new TextDecoder('utf-8').decode(bytes.value)
})

function save() {
	if (!bytes.value) return
	const name = props.node.trail.map(safeFileName).join('-') || 'resource'
	const url = URL.createObjectURL(
		new Blob([bytes.value.slice().buffer], { type: 'application/octet-stream' }),
	)
	const link = document.createElement('a')
	link.href = url
	link.download = `${name}.bin`
	link.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
	<div class="flex min-w-0 flex-col gap-6">
		<header class="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
			<h3
				class="min-w-0 flex-1 basis-48 font-mono text-data font-medium wrap-anywhere text-primary"
				translate="no"
			>
				{{ node.trail.join(' / ') }}
			</h3>
			<Button v-if="bytes" data-size="sm" @click="save">
				<IconDownload class="size-4" aria-hidden="true" />
				Save resource
			</Button>
		</header>

		<dl class="grid grid-cols-1 gap-x-8 gap-y-3 @md:grid-cols-2 @4xl:grid-cols-3">
			<div v-for="item in trail" :key="item.title" :class="fieldClass">
				<dt class="text-caption text-secondary">{{ item.title }}</dt>
				<dd class="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-primary">
					<span class="font-mono text-data wrap-anywhere" translate="no">{{ item.label }}</span>
					<span
						v-if="item.title === 'Language' && languageHex(item.label)"
						class="num font-mono text-data text-secondary"
						translate="no"
						>{{ languageHex(item.label) }}</span
					>
				</dd>
			</div>
			<!-- Always label above, so a long path wraps as one block and not in a narrow column beside its label. -->
			<div v-if="node.path" class="col-span-full flex min-w-0 flex-col gap-0.5">
				<dt class="text-caption text-secondary">Path</dt>
				<dd class="flex min-w-0 items-start gap-1">
					<span class="min-w-0 py-0.5 font-mono text-data wrap-anywhere text-primary" translate="no">{{
						node.path
					}}</span>
					<CopyButton :value="node.path" label="Copy resource path" />
				</dd>
			</div>
			<template v-if="node.data">
				<div :class="fieldClass">
					<dt class="text-caption text-secondary">RVA</dt>
					<dd><AddressText kind="rva" :value="node.data.image.OffsetToData" /></dd>
				</div>
				<div :class="fieldClass">
					<dt class="text-caption text-secondary">Size</dt>
					<dd class="num text-primary">{{ byteCount(node.data.size) }}</dd>
				</div>
				<div :class="fieldClass">
					<dt class="text-caption text-secondary">Code page</dt>
					<dd class="num text-primary">{{ node.data.code_page }}</dd>
				</div>
			</template>
		</dl>

		<p v-if="node.children" class="text-secondary">
			{{ count(node.children.length) }} {{ node.children.length === 1 ? 'entry' : 'entries' }} in this
			directory. Expand it in the tree to reach the resource data.
		</p>
		<Notice v-else-if="!node.data" tone="warning">
			The data entry for this resource could not be read, so its address and size are unknown.
		</Notice>
		<Notice v-else-if="!bytes" tone="warning">
			The resource data lies outside the file, so there is nothing to preview or save.
		</Notice>

		<section v-if="text !== null" class="flex min-w-0 flex-col gap-2" aria-labelledby="resource-text-title">
			<h4 id="resource-text-title" class="font-medium text-primary">Text</h4>
			<!-- No height cap: the detail pane already scrolls, and a second scroller inside it traps the wheel. -->
			<pre
				class="scroll-thin w-fit max-w-full overflow-x-auto rounded-md bg-sunken p-3 font-mono text-data whitespace-pre text-primary"
				tabindex="0"
				aria-label="Resource text"
				translate="no"
				>{{ text }}</pre>
		</section>

		<section
			v-if="bytes && lines.length"
			class="flex min-w-0 flex-col gap-2"
			aria-labelledby="resource-bytes-title"
		>
			<header class="flex flex-wrap items-baseline gap-x-3">
				<h4 id="resource-bytes-title" class="font-medium text-primary">Bytes</h4>
				<span class="num text-caption text-secondary">
					{{
						bytes.length > previewLimit
							? `First ${count(previewLimit)} of ${byteCount(bytes.length)}`
							: byteCount(bytes.length)
					}}
				</span>
			</header>
			<pre
				class="scroll-thin w-fit max-w-full overflow-x-auto rounded-md bg-sunken p-3 font-mono text-data whitespace-pre text-primary num"
				tabindex="0"
				aria-label="Resource bytes in hexadecimal"
				translate="no"
				>{{ lines.join('\n') }}</pre>
		</section>
	</div>
</template>
