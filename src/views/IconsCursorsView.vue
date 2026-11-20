<script lang="ts">
import type { PeDocument } from '@/pe/document'
import type { ViewContent } from '@/pe/view'
import type { ResourceName } from '@/vendor/pelite/pelite.js'

export interface IconCursorEntry {
	kind: 'icons' | 'cursors'
	name: ResourceName
	bytes: Uint8Array
}

export interface IconsCursorsData {
	entries: IconCursorEntry[]
	/** Resources that were listed but could not be read, so the view can say so. */
	failures: string[]
}

export function isAvailable(doc: PeDocument): boolean {
	return [doc.peFile.resourcesListIcons(), doc.peFile.resourcesListCursors()].some(
		(names) => names !== null && !(names instanceof Error) && names.length > 0,
	)
}

export function prepare(doc: PeDocument): ViewContent<IconsCursorsData> {
	const entries: IconCursorEntry[] = []
	const failures: string[] = []
	for (const kind of ['icons', 'cursors'] as const) {
		const names = kind === 'icons' ? doc.peFile.resourcesListIcons() : doc.peFile.resourcesListCursors()
		if (names instanceof Error) {
			console.error(`Unable to list ${kind}:`, names)
			failures.push(`The ${kind === 'icons' ? 'icon' : 'cursor'} list could not be read: ${names.message}`)
			continue
		}
		for (const name of names ?? []) {
			const bytes = kind === 'icons' ? doc.peFile.resourcesGetIcon(name) : doc.peFile.resourcesGetCursor(name)
			if (bytes instanceof Error || bytes === null) {
				const label = `${kind === 'icons' ? 'Icon' : 'Cursor'} ${typeof name === 'number' ? `#${name}` : name}`
				console.error(`Unable to load ${label}:`, bytes ?? 'Resource not found.')
				failures.push(`${label} could not be read${bytes ? `: ${bytes.message}` : ''}`)
				continue
			}
			entries.push({ kind, name, bytes })
		}
	}
	return { data: { entries, failures } }
}
</script>

<script setup lang="ts">
import IconDownload from '~icons/lucide/download'
import { Button } from '@ui-sdk/vue/button'
import { byteCount, count } from '@/lib/format'
import { iconImageSizes, type IconImageSize } from './icons-cursors/icon-directory'

const props = defineProps<{ data: IconsCursorsData }>()

/** Previews fit in this box. Icons of 32 pixels or less are doubled, without smoothing, so pixel art stays legible. */
const previewSize = 64

function describeSizes(sizes: IconImageSize[]): { short: string; full: string } | null {
	if (!sizes.length) return null
	const labels = [...new Set(sizes.map((size) => `${size.width}×${size.height}`))]
	const full = labels.join(', ')
	if (labels.length <= 4) return { short: full, full }
	const byArea = [...sizes].sort((a, b) => a.width * a.height - b.width * b.height)
	const first = byArea[0]
	const last = byArea[byArea.length - 1]
	return {
		short: `${count(sizes.length)} images, ${first.width}×${first.height} to ${last.width}×${last.height}`,
		full,
	}
}

function displaySize(width: number, height: number): { width: number; height: number; pixelated: boolean } {
	if (!width || !height) return { width: previewSize, height: previewSize, pixelated: false }
	const largest = Math.max(width, height)
	const scale = largest <= previewSize / 2 ? 2 : Math.min(1, previewSize / largest)
	return { width: Math.round(width * scale), height: Math.round(height * scale), pixelated: scale > 1 }
}

const previews = reactive(
	props.data.entries.map((entry) => {
		const name = typeof entry.name === 'number' ? `#${entry.name}` : entry.name
		const label = `${entry.kind === 'icons' ? 'Icon' : 'Cursor'} ${name}`
		const safe = String(entry.name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
		const sizes = iconImageSizes(entry.bytes)
		const largest = sizes.reduce(
			(best, size) => (size.width * size.height > best.width * best.height ? size : best),
			{ width: 0, height: 0 },
		)
		return {
			key: `${entry.kind}:${String(entry.name)}`,
			kind: entry.kind,
			name,
			label,
			filename: entry.kind === 'icons' ? `icon-${safe}.ico` : `cursor-${safe}.cur`,
			url: URL.createObjectURL(new Blob([entry.bytes.slice().buffer], { type: 'image/x-icon' })),
			byteLength: entry.bytes.length,
			sizes: describeSizes(sizes),
			display: displaySize(largest.width, largest.height),
			failed: false,
		}
	}),
)

onBeforeUnmount(() => {
	for (const preview of previews) URL.revokeObjectURL(preview.url)
})

function groupCount(total: number, noun: string): string {
	return `${count(total)} ${noun}${total === 1 ? '' : 's'}`
}

const groups = computed(() => [
	{
		key: 'icons',
		title: 'Icons',
		meta: groupCount(previews.filter((preview) => preview.kind === 'icons').length, 'icon'),
		empty: 'No icons in this file.',
		previews: previews.filter((preview) => preview.kind === 'icons'),
	},
	{
		key: 'cursors',
		title: 'Cursors',
		meta: groupCount(previews.filter((preview) => preview.kind === 'cursors').length, 'cursor'),
		empty: 'No cursors in this file.',
		previews: previews.filter((preview) => preview.kind === 'cursors'),
	},
])

function save(preview: (typeof previews)[number]) {
	const link = document.createElement('a')
	link.href = preview.url
	link.download = preview.filename
	link.click()
}
</script>

<template>
	<ViewPage
		title="Icons and cursors"
		description="Icon and cursor groups from the resources, each rebuilt as the .ico or .cur file Windows would load."
	>
		<Notice v-if="data.failures.length" tone="warning" title="Some resources could not be read">
			<ul class="flex flex-col gap-0.5">
				<li v-for="failure in data.failures" :key="failure">{{ failure }}</li>
			</ul>
		</Notice>
		<ViewSection
			v-for="group in groups"
			:key="group.key"
			:title="group.title"
			:meta="group.previews.length ? group.meta : undefined"
		>
			<ul
				v-if="group.previews.length"
				class="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-4"
				:aria-label="group.title"
			>
				<li
					v-for="preview in group.previews"
					:key="preview.key"
					class="flex min-w-0 flex-col items-start gap-2"
				>
					<div class="preview-well grid size-24 place-items-center rounded-md">
						<img
							v-if="!preview.failed"
							:src="preview.url"
							:alt="preview.label"
							:width="preview.display.width"
							:height="preview.display.height"
							class="max-w-none object-contain"
							:class="preview.display.pixelated ? '[image-rendering:pixelated]' : ''"
							@error="preview.failed = true"
						/>
						<span v-else class="px-2 text-center text-caption text-secondary">Preview unavailable</span>
					</div>
					<div class="flex min-w-0 flex-col gap-0.5">
						<span class="font-mono text-data wrap-anywhere text-primary" translate="no">{{
							preview.name
						}}</span>
						<span class="num text-caption text-secondary" :title="preview.sizes?.full">
							{{ preview.sizes ? preview.sizes.short : byteCount(preview.byteLength) }}
						</span>
					</div>
					<!-- Pushed to the bottom, so the buttons of a row line up when a size list wraps. -->
					<Button data-size="sm" class="mt-auto" :title="preview.filename" @click="save(preview)">
						<IconDownload class="size-4" aria-hidden="true" />
						<span>
							Save {{ preview.kind === 'icons' ? 'icon' : 'cursor' }}
							<span class="sr-only">{{ preview.name }}</span>
						</span>
					</Button>
				</li>
			</ul>
			<p v-else class="text-secondary">{{ group.empty }}</p>
		</ViewSection>
	</ViewPage>
</template>

<style scoped>
/*
 * Icons are drawn for any background, so the well is a light checkerboard in both themes:
 * dark pixels stay visible in the dark theme, and the squares show where the image is transparent.
 * The light color scheme makes the tokens below resolve to their light side here.
 */
.preview-well {
	color-scheme: light;
	background-color: var(--background-color-raised);
	background-image: repeating-conic-gradient(var(--background-color-pressed) 0 25%, transparent 0 50%);
	background-size: 12px 12px;
}
</style>
