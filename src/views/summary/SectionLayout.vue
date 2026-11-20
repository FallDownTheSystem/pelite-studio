<script setup lang="ts">
import { byteSize } from '@/lib/format'
import type { SummaryData } from './analysis'

/**
 * How the sections divide the file on disk and the image in memory, as two proportional
 * strips that share one legend. The legend carries the names, so color is never the only key.
 */
const props = defineProps<{ data: SummaryData }>()

const seriesClasses = [
	'bg-series-1',
	'bg-series-2',
	'bg-series-3',
	'bg-series-4',
	'bg-series-5',
	'bg-series-6',
	'bg-series-7',
	'bg-series-8',
]

interface Part {
	key: string
	label: string
	color: string
	/** Striped, to tell a part apart from another of the same color. */
	hatched: boolean
	mono: boolean
}

interface Segment {
	key: string
	title: string
	color: string
	hatched: boolean
	left: number
	width: number
}

/*
 * Headers and overlay are not sections, so they take a neutral gray. The strong border gray keeps
 * 3:1 against the track, which the hover gray does not. The overlay is striped to differ from the headers.
 */
const neutral = 'bg-(--border-color-strong)'
const headersPart: Part = { key: 'headers', label: 'Headers', color: neutral, hatched: false, mono: false }
const overlayPart: Part = { key: 'overlay', label: 'Overlay', color: neutral, hatched: true, mono: false }

/** Past eight sections the colors repeat, so each further round of the series is striped. */
const parts = computed<Part[]>(() => [
	headersPart,
	...props.data.sections.map((section) => ({
		key: `section-${section.index}`,
		label: section.name || `Section ${section.index + 1}`,
		color: seriesClasses[section.index % seriesClasses.length],
		hatched: Math.floor(section.index / seriesClasses.length) % 2 === 1,
		mono: !!section.name,
	})),
	...(props.data.overlay.size > 0 ? [overlayPart] : []),
])

function place(part: Part, start: number, size: number, total: number): Segment | undefined {
	if (total <= 0 || size <= 0 || start >= total) return undefined
	const end = Math.min(start + size, total)
	return {
		key: part.key,
		title: `${part.label}: ${byteSize(end - start)}`,
		color: part.color,
		hatched: part.hatched,
		left: (start / total) * 100,
		width: ((end - start) / total) * 100,
	}
}

const fileSegments = computed(() => {
	const { fileSize, headers, overlay, sections } = props.data
	const result = [place(headersPart, 0, headers.NtHeaders.OptionalHeader.SizeOfHeaders, fileSize)]
	for (const section of sections) {
		const part = parts.value[section.index + 1]
		result.push(place(part, section.header.PointerToRawData, section.header.SizeOfRawData, fileSize))
	}
	if (overlay.size > 0) result.push(place(overlayPart, overlay.offset, overlay.size, fileSize))
	return result.filter((segment) => segment !== undefined)
})

const imageSegments = computed(() => {
	const { headers, sections } = props.data
	const total = headers.NtHeaders.OptionalHeader.SizeOfImage
	const result = [place(headersPart, 0, headers.NtHeaders.OptionalHeader.SizeOfHeaders, total)]
	for (const section of sections) {
		const part = parts.value[section.index + 1]
		// A section with no virtual size is mapped with its raw size.
		const size = section.header.VirtualSize || section.header.SizeOfRawData
		result.push(place(part, section.header.VirtualAddress, size, total))
	}
	return result.filter((segment) => segment !== undefined)
})

const strips = computed(() => [
	{ key: 'file', label: 'File', total: byteSize(props.data.fileSize), segments: fileSegments.value },
	{
		key: 'image',
		label: 'Image',
		total: byteSize(props.data.headers.NtHeaders.OptionalHeader.SizeOfImage),
		segments: imageSegments.value,
	},
])
</script>

<template>
	<div class="flex flex-col gap-2">
		<div
			v-for="strip in strips"
			:key="strip.key"
			class="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3"
		>
			<span class="text-caption text-secondary">
				{{ strip.label }}
				<span class="sr-only">layout, {{ strip.total }}</span>
			</span>
			<div class="relative h-4 overflow-hidden rounded-sm bg-sunken" aria-hidden="true">
				<!-- The page-colored end edge keeps neighbors apart, and 3px keeps a tiny section visible. -->
				<span
					v-for="segment in strip.segments"
					:key="segment.key"
					class="absolute inset-y-0 start-(--left) w-(--width) min-w-[3px] border-e border-(--background-color-page)"
					:class="[segment.color, { hatched: segment.hatched }]"
					:style="{ '--left': `${segment.left}%`, '--width': `${segment.width}%` }"
					:title="segment.title"
				/>
			</div>
		</div>
		<ul class="ms-[4.25rem] flex flex-wrap gap-x-4 gap-y-1" aria-label="Layout legend">
			<li v-for="part in parts" :key="part.key" class="flex items-center gap-1.5 text-caption text-primary">
				<span
					class="size-3 shrink-0 rounded-sm"
					:class="[part.color, { hatched: part.hatched }]"
					aria-hidden="true"
				/>
				<span :class="part.mono ? 'font-mono' : ''" :translate="part.mono ? 'no' : undefined">{{
					part.label
				}}</span>
			</li>
		</ul>
	</div>
</template>

<style scoped>
.hatched {
	background-image: repeating-linear-gradient(
		-45deg,
		transparent 0 3px,
		var(--background-color-page) 3px 5px
	);
}
</style>
