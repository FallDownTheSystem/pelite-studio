<script lang="ts">
import type { PeDocument } from '@/pe/document'
import type { ViewContent } from '@/pe/view'
import { unwrap } from '@/pe/pelite'
import type { SortState } from '@/components/ui/table'
import type { PeBaseRelocations } from '@/vendor/pelite/pelite.js'

export interface BaseRelocationsData {
	relocations: PeBaseRelocations
	/** Positions into the parallel `rvas` / `types` arrays, so rows cost one number each. */
	rows: number[]
	state: { query: string; sort: SortState | undefined }
}

export function prepare(doc: PeDocument): ViewContent<BaseRelocationsData> {
	const relocations = unwrap(doc.peFile.baseRelocations())
	if (relocations === null) throw new Error('The directory is unavailable.')
	return {
		data: {
			relocations,
			rows: Array.from({ length: relocations.rvas.length }, (_, index) => index),
			state: reactive({ query: '', sort: undefined }),
		},
	}
}
</script>

<script setup lang="ts">
import { Button } from '@ui-sdk/vue/button'
import { defineColumns } from '@/components/ui/table'
import { count, hex } from '@/lib/format'

const props = defineProps<{ data: BaseRelocationsData }>()
const state = props.data.state
const { rvas, types } = props.data.relocations

/** Types 5, 7, 8 and 9 mean different things per machine, so they keep their generic names. */
const typeNames: Record<number, string> = {
	0: 'ABSOLUTE',
	1: 'HIGH',
	2: 'LOW',
	3: 'HIGHLOW',
	4: 'HIGHADJ',
	6: 'RESERVED',
	10: 'DIR64',
}

const typeDescriptions: Record<number, string> = {
	0: 'Padding, skipped by the loader',
	1: 'High 16 bits of a 32-bit address',
	2: 'Low 16 bits of a 32-bit address',
	3: '32-bit address',
	4: 'High 16 bits, adjusted by the next entry',
	10: '64-bit address',
}

function typeName(type: number): string {
	return typeNames[type] ?? `MACHINE_SPECIFIC_${type}`
}

const rows = computed(() => {
	const text = state.query.trim().toLowerCase()
	if (!text) return props.data.rows
	return props.data.rows.filter(
		(index) => hex(rvas[index]!).includes(text) || typeName(types[index]!).toLowerCase().includes(text),
	)
})

function typeLabel(type: number): string {
	return `${typeName(type)} (${type})`
}

const total = rvas.length

const typeTotals = computed(() => {
	const totals = new Map<number, number>()
	for (const type of types) totals.set(type, (totals.get(type) ?? 0) + 1)
	return [...totals].sort((a, b) => a[0] - b[0])
})

/** The type column fits the longest type label in this file (0.45rem per mono character plus padding). */
const typeWidth = Math.max(7, ...typeTotals.value.map(([type]) => typeLabel(type).length * 0.45 + 1.5))

const columns = defineColumns<number>([
	{
		key: 'rva',
		title: 'RVA',
		width: '7rem',
		mono: true,
		kind: 'rva',
		value: (index) => hex(rvas[index]!),
		sortValue: (index) => rvas[index],
	},
	{
		key: 'page',
		title: 'Page',
		width: '7rem',
		mono: true,
		muted: true,
		kind: 'rva',
		value: (index) => hex(rvas[index]! & ~0xfff),
		sortValue: (index) => rvas[index]! & ~0xfff,
	},
	{
		key: 'type',
		title: 'Type',
		width: `${typeWidth}rem`,
		mono: true,
		value: (index) => typeLabel(types[index]!),
		sortValue: (index) => types[index],
	},
	{
		key: 'meaning',
		title: 'Meaning',
		minWidth: '12rem',
		muted: true,
		value: (index) => typeDescriptions[types[index]!] ?? 'Depends on the machine type',
	},
])

const status = computed(() =>
	state.query.trim()
		? `${count(rows.value.length)} of ${count(total)} base relocations`
		: `${count(total)} base ${total === 1 ? 'relocation' : 'relocations'}`,
)

const pages = computed(() => new Set(rvas.map((rva) => rva & ~0xfff)).size)
</script>

<template>
	<ViewPage
		fill
		title="Base relocations"
		description="Places in the image that hold absolute addresses, which the loader patches when the image cannot load at its preferred base."
	>
		<!-- The facts belong to the heading; the filter sits last, next to the table it narrows. -->
		<template v-if="total" #toolbar>
			<dl class="flex min-w-0 basis-full flex-wrap items-start gap-x-6 gap-y-2 pt-1 pb-1">
				<div class="min-w-0">
					<dt class="text-caption text-secondary">Pages</dt>
					<dd class="num font-mono text-data">{{ count(pages) }}</dd>
				</div>
				<div v-for="[type, amount] in typeTotals" :key="type" class="min-w-0">
					<dt class="font-mono text-caption text-secondary" translate="no">{{ typeName(type) }}</dt>
					<dd class="num font-mono text-data">{{ count(amount) }}</dd>
				</div>
			</dl>
			<FilterInput v-model="state.query" label="Filter relocations" placeholder="0x1a2f0" />
			<p class="num pb-1 text-caption text-secondary" role="status">{{ status }}</p>
		</template>

		<EmptyState v-if="!total" title="No base relocations in this file">
			The relocation directory is present but holds no entries.
		</EmptyState>
		<template v-else>
			<div class="min-h-0 flex-1">
				<DataTable v-model:sort="state.sort" fill :rows="rows" :columns="columns" label="Base relocations">
					<template #empty>
						<EmptyState :title="`No base relocations match '${state.query.trim()}'`">
							The filter looks for part of an RVA or a type name.
							<template #actions>
								<Button data-size="sm" @click="state.query = ''">Clear filter</Button>
							</template>
						</EmptyState>
					</template>
				</DataTable>
			</div>
		</template>
	</ViewPage>
</template>
