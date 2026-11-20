<script setup lang="ts">
import IconCheck from '~icons/lucide/check'
import { Button } from '@ui-sdk/vue/button'
import { Checkbox, CheckboxIndicator } from '@ui-sdk/vue/checkbox'
import { defineColumns } from '@/components/ui/table'
import type { FactsDatabase, FactsRow } from '@/pe/facts'
import AddressMap from './AddressMap.vue'
import RecordPager from './RecordPager.vue'
import {
	hasFilters,
	isDrafting,
	kindName,
	layerId,
	layerLabel,
	pageSize,
	parseRva,
	payloadText,
	resetFilters,
	rvaText,
	sectionExtent,
	sectionName,
	toggleLayer,
} from './model'

/** The read-only combined view: every record of the visible layers, sorted by RVA and paged. */
const props = defineProps<{ db: FactsDatabase }>()
const db = props.db

const drafting = computed(() => isDrafting(db))
const allRows = computed(() => db.layers.flatMap((_, index) => db.rows(index)))
const visibleRows = computed(() => allRows.value.filter((row) => db.layers[row.layer].visible))

const range = computed(() => {
	try {
		const min = db.from.trim() ? parseRva(db.from) : 0
		const max = db.to.trim() ? parseRva(db.to) : 0xffffffff
		if (min > max) throw new Error('Enter an end RVA at or after the start RVA.')
		return { min, max, error: '' }
	} catch (error) {
		return { min: 0, max: 0, error: error instanceof Error ? error.message : String(error) }
	}
})

const filtered = computed(() => {
	if (range.value.error) return []
	const query = db.query.toLowerCase().trim()
	const section = db.headers.SectionHeaders[Number(db.section)]
	const { min, max } = range.value
	return allRows.value
		.filter(
			(row) =>
				db.layers[row.layer].visible &&
				(!db.kind || row.kind === db.kind) &&
				(!query ||
					`${row.text} ${rvaText(row.rva)} ${db.layers[row.layer].label}`.toLowerCase().includes(query)) &&
				row.rva >= min &&
				row.rva <= max &&
				(db.section === '' ||
					(row.rva >= section.VirtualAddress && row.rva < section.VirtualAddress + sectionExtent(section))),
		)
		.sort((a, b) => a.rva - b.rva || a.layer - b.layer || a.index - b.index)
})

const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const pageIndex = computed(() => Math.min(db.page, pageCount.value - 1))
const pageRows = computed(() =>
	filtered.value.slice(pageIndex.value * pageSize, (pageIndex.value + 1) * pageSize),
)

const columns = defineColumns<FactsRow>([
	{ key: 'kind', title: 'Kind', width: '7.5rem', value: (row) => kindName(row.kind) },
	{
		key: 'section',
		title: 'Section',
		width: '6rem',
		mono: true,
		muted: true,
		value: (row) => sectionName(db, row.rva),
	},
	{ key: 'rva', title: 'RVA', width: '7.5rem', mono: true, kind: 'rva', value: (row) => rvaText(row.rva) },
	{
		key: 'value',
		title: 'Value or metadata',
		minWidth: '14rem',
		mono: true,
		kind: (row) => (row.kind === 'R' ? 'rva' : undefined),
		value: (row) => payloadText(row),
	},
	{ key: 'layer', title: 'Layer', width: '9rem', value: (row) => layerLabel(db.layers[row.layer]) },
])

const emit = defineEmits<{ manage: [] }>()
</script>

<template>
	<!--
		The map and the layer list keep their natural height and the table takes the rest. In a short
		panel the whole column scrolls as one, rather than squeezing the map into a scroller of its own.
	-->
	<div class="scroll-thin flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
		<div class="flex min-w-0 shrink-0 flex-col gap-4 border-b border-subtle px-4 py-3 @2xl:px-6">
			<Notice v-if="db.error" tone="danger">{{ db.error }}</Notice>
			<AddressMap :db="db" :rows="visibleRows" />
			<fieldset class="flex min-w-0 flex-col gap-1">
				<legend class="mb-1 font-medium text-primary">Layers in view</legend>
				<div class="scroll-thin flex max-h-16 min-w-0 flex-wrap gap-x-4 gap-y-1 overflow-auto">
					<label
						v-for="(layer, index) in db.layers"
						:key="layerId(layer)"
						class="flex h-6 min-w-0 items-center gap-2"
						:class="drafting ? 'text-disabled' : ''"
					>
						<Checkbox :checked="layer.visible" :disabled="drafting" @checked-change="toggleLayer(db, index)">
							<CheckboxIndicator><IconCheck class="size-3" aria-hidden="true" /></CheckboxIndicator>
						</Checkbox>
						<span class="truncate">{{ layerLabel(layer) }}</span>
					</label>
					<p v-if="!db.layers.length" class="text-secondary">
						No layers yet. Create or import one in Manage layers.
					</p>
				</div>
				<p v-if="drafting && db.layers.length" class="text-caption text-secondary">
					Apply or discard the open draft in Manage layers to change which layers show.
				</p>
			</fieldset>
		</div>

		<div class="min-h-48 flex-1">
			<DataTable
				fill
				:rows="pageRows"
				:columns="columns"
				:row-key="(row) => `${row.layer}:${row.index}`"
				label="Fact records of the visible layers"
			>
				<template #cell-kind="{ row }">
					<Tag>{{ kindName(row.kind) }}</Tag>
				</template>
				<template #empty>
					<EmptyState v-if="!db.layers.length" title="No fact layers">
						Create a layer or import a factmap to start recording facts about this image.
						<template #actions>
							<Button data-size="sm" @click="emit('manage')">Manage layers</Button>
						</template>
					</EmptyState>
					<EmptyState v-else-if="!allRows.length" title="No facts yet">
						The layers hold no records. Add facts or import a factmap in Manage layers.
						<template #actions>
							<Button data-size="sm" @click="emit('manage')">Manage layers</Button>
						</template>
					</EmptyState>
					<EmptyState v-else-if="!visibleRows.length" title="No layers are shown">
						Check a layer under Layers in view to include its facts.
					</EmptyState>
					<EmptyState v-else title="No records match the filters">
						{{ range.error || 'Change the search, kind, section or RVA range.' }}
						<template v-if="hasFilters(db)" #actions>
							<Button data-size="sm" @click="resetFilters(db)">Clear filters</Button>
						</template>
					</EmptyState>
				</template>
			</DataTable>
		</div>
		<RecordPager
			:db="db"
			:total="filtered.length"
			:page-count="pageCount"
			:page-index="pageIndex"
			:noun="filtered.length === 1 ? 'record' : 'records'"
			order="sorted by RVA"
		/>
	</div>
</template>
