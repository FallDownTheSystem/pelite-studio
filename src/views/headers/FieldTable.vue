<script setup lang="ts">
import { defineColumns } from '@/components/ui/table'
import type { FieldRow } from './fields'

/** Field / Value / Meaning rows of one header structure. */
defineProps<{
	rows: readonly FieldRow[]
	label: string
}>()

// One set of widths for every field table, so the tables stacked on a page share column edges.
// The value column wraps: a long GUID or PDB path must not push the meaning column out of line.
const columns = defineColumns<FieldRow>([
	{ key: 'field', title: 'Field', width: '20rem', mono: true, value: (row) => row.field },
	{
		key: 'value',
		title: 'Value',
		width: '14rem',
		mono: true,
		wrap: true,
		kind: (row) => row.kind,
		value: (row) => row.value,
	},
	{
		key: 'meaning',
		title: 'Meaning',
		wrap: true,
		minWidth: '16rem',
		value: (row) =>
			[row.meaning, row.constant, ...(row.flags ?? []), row.status?.label].filter(Boolean).join(' '),
	},
])
</script>

<template>
	<DataTable :rows="rows" :columns="columns" :label="label" :row-key="(row) => row.field">
		<template #cell-value="{ value }">
			<!-- Most members of a header are zero; the ones that are set should stand out. A number never breaks across lines. -->
			<span
				v-if="value"
				:class="[
					value === '0' ? 'text-secondary' : '',
					/^0x[\da-f]+$/i.test(value) ? 'whitespace-nowrap' : '',
				]"
				>{{ value }}</span
			>
			<template v-else>
				<span class="text-disabled" aria-hidden="true">-</span>
				<span class="sr-only">None</span>
			</template>
		</template>
		<template #cell-meaning="{ row }">
			<span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
				<Tag v-if="row.status" :tone="row.status.tone">{{ row.status.label }}</Tag>
				<span v-if="row.meaning" class="text-pretty" :class="row.value === '0' ? 'text-secondary' : ''">{{
					row.meaning
				}}</span>
				<span v-if="row.constant" class="font-mono text-data text-secondary" translate="no">{{
					row.constant
				}}</span>
				<span v-if="row.flags?.length" class="flex flex-wrap gap-1">
					<Tag v-for="flag in row.flags" :key="flag" mono translate="no">{{ flag }}</Tag>
				</span>
			</span>
		</template>
	</DataTable>
</template>
