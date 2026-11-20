<script setup lang="ts">
import { defineColumns, type SortState } from '@/components/ui/table'
import { hex, hexOrZero } from '@/lib/format'
import type { SectionRow } from './sections'

/** The section table: placement in memory and in the file, permissions, content and entropy. */
defineProps<{
	rows: readonly SectionRow[]
	label: string
}>()

const sort = ref<SortState>()

const permissions = [
	{ key: 'read', letter: 'R', name: 'read' },
	{ key: 'write', letter: 'W', name: 'write' },
	{ key: 'execute', letter: 'X', name: 'execute' },
] as const

function permissionText(row: SectionRow): string {
	const names = permissions.filter((item) => row[item.key]).map((item) => item.name)
	return names.length ? names.join(', ') : 'No access'
}

function entropyText(row: SectionRow): string {
	return row.entropy?.entropy == null ? '' : row.entropy.entropy.toFixed(2)
}

const columns = defineColumns<SectionRow>([
	{
		key: 'number',
		title: '#',
		width: '3rem',
		align: 'end',
		mono: true,
		muted: true,
		value: (row) => row.number,
		sortValue: (row) => row.number,
	},
	{
		key: 'name',
		title: 'Name',
		width: '7rem',
		mono: true,
		value: (row) => row.header.Name,
		sortValue: (row) => row.header.Name,
	},
	{
		key: 'va',
		title: 'Virtual address',
		width: '9rem',
		mono: true,
		kind: 'rva',
		value: (row) => hex(row.header.VirtualAddress),
		sortValue: (row) => row.header.VirtualAddress,
	},
	{
		key: 'vsize',
		title: 'Virtual size',
		width: '8rem',
		align: 'end',
		mono: true,
		value: (row) => hexOrZero(row.header.VirtualSize),
		sortValue: (row) => row.header.VirtualSize,
	},
	{
		key: 'offset',
		title: 'Raw offset',
		width: '8rem',
		mono: true,
		kind: (row) => (row.header.PointerToRawData ? 'fo' : undefined),
		value: (row) => hexOrZero(row.header.PointerToRawData),
		sortValue: (row) => row.header.PointerToRawData,
	},
	{
		key: 'rsize',
		title: 'Raw size',
		width: '7rem',
		align: 'end',
		mono: true,
		value: (row) => hexOrZero(row.header.SizeOfRawData),
		sortValue: (row) => row.header.SizeOfRawData,
	},
	{ key: 'access', title: 'Permissions', width: '7rem', value: permissionText },
	{ key: 'content', title: 'Content', width: '9rem', value: (row) => row.content.join(', ') },
	{
		key: 'entropy',
		title: 'Entropy',
		width: '10rem',
		value: entropyText,
		sortValue: (row) => row.entropy?.entropy ?? -1,
	},
	{
		key: 'flags',
		title: 'Characteristics',
		value: (row) => [hexOrZero(row.header.Characteristics), ...row.flags].join(' '),
	},
])
</script>

<template>
	<DataTable
		v-model:sort="sort"
		:rows="rows"
		:columns="columns"
		:label="label"
		:row-key="(row) => row.number"
		empty="No section headers in this file"
	>
		<template #cell-access="{ row }">
			<span class="sr-only">{{ permissionText(row) }}</span>
			<span class="inline-flex gap-0.5" aria-hidden="true">
				<span v-for="item in permissions" :key="item.key" class="inline-flex w-5 justify-center">
					<Tag v-if="row[item.key]" mono>{{ item.letter }}</Tag>
					<span v-else class="font-mono text-data text-disabled">-</span>
				</span>
			</span>
		</template>
		<template #cell-entropy="{ row, value }">
			<span v-if="value" class="inline-flex items-center gap-2">
				<span class="num inline-block w-8 text-end font-mono text-data">{{ value }}</span>
				<Sparkline v-if="row.entropy?.samples.length" :values="row.entropy.samples" :max="8" />
			</span>
			<span v-else class="text-secondary">No raw data</span>
		</template>
		<template #cell-flags="{ row }">
			<span class="flex flex-wrap items-center gap-1">
				<span class="num me-1 font-mono text-data">{{ hexOrZero(row.header.Characteristics) }}</span>
				<Tag v-for="flag in row.flags" :key="flag" mono>{{ flag }}</Tag>
			</span>
		</template>
	</DataTable>
</template>
