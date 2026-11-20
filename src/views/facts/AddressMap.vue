<script setup lang="ts">
import { count, hex } from '@/lib/format'
import type { FactsDatabase, FactsRow } from '@/pe/facts'
import { kindName, rvaText, sectionExtent, zoom } from './model'

/**
 * The image from RVA 0 to SizeOfImage as 96 equal bins. A bin's bar is its share of the
 * fullest bin; pressing it narrows the RVA filter to that bin. Sections sit under the bins
 * in series colors, and the legend below names them and filters by them.
 */
const props = defineProps<{
	db: FactsDatabase
	/** Records of the visible layers. */
	rows: FactsRow[]
}>()

const binCount = 96
const titleId = useId()

const imageSize = computed(() => Math.max(1, props.db.headers.NtHeaders.OptionalHeader.SizeOfImage))

const bins = computed(() => {
	const size = imageSize.value
	const result = Array.from({ length: binCount }, (_, index) => ({
		start: Math.floor((index * size) / binCount),
		end: Math.ceil(((index + 1) * size) / binCount) - 1,
		count: 0,
		kinds: [] as string[],
	}))
	for (const row of props.rows) {
		if (row.rva >= size) continue
		const bin = result[Math.min(binCount - 1, Math.floor((row.rva * binCount) / size))]
		bin.count++
		if (!bin.kinds.includes(row.kind)) bin.kinds.push(row.kind)
	}
	return result
})

const maxBin = computed(() => Math.max(1, ...bins.value.map((bin) => bin.count)))
const outOfImage = computed(() => props.rows.filter((row) => row.rva >= imageSize.value).length)

const sections = computed(() =>
	props.db.headers.SectionHeaders.map((section, index) => {
		const extent = Math.max(0, Math.min(sectionExtent(section), imageSize.value - section.VirtualAddress))
		return {
			index,
			name: section.Name || `Section ${index + 1}`,
			start: section.VirtualAddress,
			end: section.VirtualAddress + Math.max(1, sectionExtent(section)) - 1,
			left: (100 * section.VirtualAddress) / imageSize.value,
			width: (100 * extent) / imageSize.value,
			series: (index % 8) + 1,
		}
	}),
)

function binLabel(bin: (typeof bins.value)[number]): string {
	const facts = `${count(bin.count)} ${bin.count === 1 ? 'fact' : 'facts'}`
	const kinds = bin.kinds.length ? ` (${bin.kinds.map(kindName).join(', ')})` : ''
	return `${rvaText(bin.start)} to ${rvaText(bin.end)}: ${facts}${kinds}`
}

function pickSection(index: number) {
	props.db.section = props.db.section === String(index) ? '' : String(index)
	props.db.page = 0
}

/** The bins are one tab stop; arrow keys move between them, like the rows of a table. */
const active = ref(0)
const strip = useTemplateRef<HTMLElement>('strip')

function onBinKeydown(event: KeyboardEvent, index: number) {
	const next =
		event.key === 'ArrowRight'
			? index + 1
			: event.key === 'ArrowLeft'
				? index - 1
				: event.key === 'Home'
					? 0
					: event.key === 'End'
						? binCount - 1
						: undefined
	if (next === undefined) return
	event.preventDefault()
	active.value = Math.max(0, Math.min(binCount - 1, next))
	strip.value?.querySelectorAll<HTMLButtonElement>('button')[active.value]?.focus()
}

const seriesBackground = [
	'bg-series-1',
	'bg-series-2',
	'bg-series-3',
	'bg-series-4',
	'bg-series-5',
	'bg-series-6',
	'bg-series-7',
	'bg-series-8',
]
</script>

<template>
	<section class="flex min-w-0 flex-col gap-2" :aria-labelledby="titleId">
		<div class="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4">
			<h3 :id="titleId" class="font-medium text-primary">Image address map</h3>
			<p class="text-caption text-secondary">Press a bin to filter by its RVA range, or a section below</p>
		</div>
		<div>
			<div
				ref="strip"
				class="flex h-10 items-stretch gap-px border-b border-default"
				role="group"
				aria-label="Facts per address range"
			>
				<button
					v-for="(bin, index) in bins"
					:key="bin.start"
					type="button"
					class="group flex min-w-0 flex-1 items-end bg-surface hover:bg-hover focus-visible:z-10 focus-visible:-outline-offset-2"
					:tabindex="index === active ? 0 : -1"
					:title="binLabel(bin)"
					:aria-label="binLabel(bin)"
					@focus="active = index"
					@click="zoom(db, bin.start, bin.end)"
					@keydown="onBinKeydown($event, index)"
				>
					<span
						v-if="bin.count"
						class="block h-(--bar) w-full bg-accent group-hover:bg-accent-hover"
						:style="{ '--bar': `${12 + (88 * bin.count) / maxBin}%` }"
					></span>
				</button>
			</div>
			<div class="relative mt-1 h-2" aria-hidden="true">
				<span
					v-for="section in sections"
					:key="section.index"
					class="absolute inset-y-0 start-(--left) w-(--width) rounded-xs"
					:class="[
						seriesBackground[section.series - 1],
						db.section !== '' && db.section !== String(section.index) ? 'opacity-30' : '',
					]"
					:style="{ '--left': `${section.left}%`, '--width': `${section.width}%` }"
				></span>
			</div>
			<div class="num mt-1 flex justify-between font-mono text-caption text-secondary" translate="no">
				<span>{{ rvaText(0) }}</span>
				<span>{{ rvaText(imageSize - 1) }}</span>
			</div>
		</div>
		<!-- The negative margin puts the first swatch on the map's edge rather than the button's. -->
		<ul class="-ms-1.5 flex min-w-0 flex-wrap gap-x-1 gap-y-0.5" aria-label="Sections">
			<li v-for="section in sections" :key="section.index" class="min-w-0">
				<button
					type="button"
					class="flex h-6 min-w-0 items-center gap-1.5 rounded-sm px-1.5 hover:bg-hover aria-pressed:bg-accent-subtle"
					:aria-pressed="db.section === String(section.index)"
					:aria-label="`${section.name}, ${hex(section.start)} to ${hex(section.end)}`"
					@click="pickSection(section.index)"
				>
					<span
						class="size-2.5 shrink-0 rounded-xs"
						:class="seriesBackground[section.series - 1]"
						aria-hidden="true"
					></span>
					<span class="font-mono text-data" translate="no">{{ section.name }}</span>
					<span class="num hidden font-mono text-caption text-secondary @sm:inline" translate="no"
						>{{ hex(section.start) }} to {{ hex(section.end) }}</span
					>
				</button>
			</li>
		</ul>
		<p v-if="outOfImage" class="text-caption text-secondary">
			{{ count(outOfImage) }} {{ outOfImage === 1 ? 'fact lies' : 'facts lie' }} past the end of the image.
			The record list keeps them.
		</p>
	</section>
</template>
