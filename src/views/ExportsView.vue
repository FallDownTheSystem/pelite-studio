<script lang="ts">
import type { PeDocument } from '@/pe/document'
import type { ViewContent } from '@/pe/view'
import { unwrap } from '@/pe/pelite'
import type { SortState } from '@/components/ui/table'
import type { PeExportDirectory } from '@/vendor/pelite/pelite.js'

export interface ExportRow {
	ordinal: number
	/** An RVA, a forwarder string (`DLL.Name`), or `null` for an unused slot. */
	target: number | string | null
	names: string[]
}

export interface ExportsData {
	directory: PeExportDirectory
	rows: ExportRow[]
	hasForwarders: boolean
	state: { query: string; sort: SortState | undefined }
}

export function prepare(doc: PeDocument): ViewContent<ExportsData> {
	const directory = unwrap(doc.peFile.exports())
	// The serializer returns null when the export lookup tables cannot be parsed.
	if (directory === null) throw new Error('The export tables could not be parsed.')
	// One row per function slot in ordinal order; aliases share a row.
	const rows: ExportRow[] = directory.functions.map((target, index) => ({
		ordinal: directory.ordinal_base + index,
		target,
		names: [],
	}))
	for (const [name, index] of Object.entries(directory.names)) rows[index]?.names.push(name)
	return {
		data: {
			directory,
			rows,
			hasForwarders: rows.some((row) => typeof row.target === 'string'),
			state: reactive({ query: '', sort: undefined }),
		},
	}
}
</script>

<script setup lang="ts">
import { Button } from '@ui-sdk/vue/button'
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '@ui-sdk/vue/collapsible'
import IconChevronRight from '~icons/lucide/chevron-right'
import { defineColumns, monoWidth } from '@/components/ui/table'
import { count, hex, hexOrZero, timestamp } from '@/lib/format'
import type { AddressKind } from '@/pe/view'

const props = defineProps<{ data: ExportsData }>()
const state = props.data.state
const image = props.data.directory.image

function targetText(row: ExportRow): string {
	return typeof row.target === 'number' ? hex(row.target) : (row.target ?? '')
}

const rows = computed(() => {
	const query = state.query.trim().toLowerCase()
	if (!query) return props.data.rows
	return props.data.rows.filter(
		(row) =>
			String(row.ordinal).includes(query) ||
			row.names.some((name) => name.toLowerCase().includes(query)) ||
			targetText(row).toLowerCase().includes(query),
	)
})

const tableBox = useTemplateRef<HTMLElement>('tableBox')
const { width: tableWidth } = useElementSize(tableBox)

const longestName = props.data.rows.reduce(
	(longest, row) => Math.max(longest, row.names.join(', ').length),
	0,
)
const remPixels = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

/**
 * The name column is as wide as the longest name, so the RVA sits beside the names instead of
 * across a wide panel; it gives way when the panel is narrow.
 */
const nameWidth = computed(() => {
	// Ordinal, RVA and the smallest forwarder column.
	const others = 6 + 7 + (props.data.hasForwarders ? 16 : 0)
	return `${monoWidth(longestName, tableWidth.value / remPixels - others, 12)}rem`
})

// The last column takes the remaining width, so there is never a gap inside the row.
const columns = computed(() =>
	defineColumns<ExportRow>([
		{
			key: 'ordinal',
			title: 'Ordinal',
			width: '6rem',
			align: 'end',
			mono: true,
			value: (row) => row.ordinal,
			sortValue: (row) => row.ordinal,
		},
		{
			key: 'name',
			title: 'Name',
			width: nameWidth.value,
			mono: true,
			value: (row) => row.names.join(', '),
			sortValue: (row) => row.names[0] ?? null,
		},
		{
			key: 'rva',
			title: 'RVA',
			...(props.data.hasForwarders ? { width: '7rem' } : { minWidth: '7rem' }),
			mono: true,
			kind: (row) => (typeof row.target === 'number' ? 'rva' : undefined),
			value: (row) => (typeof row.target === 'number' ? hex(row.target) : null),
			sortValue: (row) => (typeof row.target === 'number' ? row.target : null),
		},
		...(props.data.hasForwarders
			? [
					{
						key: 'forward',
						title: 'Forwarded to',
						minWidth: '16rem',
						mono: true,
						value: (row: ExportRow) => (typeof row.target === 'string' ? row.target : null),
						sortValue: (row: ExportRow) => (typeof row.target === 'string' ? row.target : null),
					},
				]
			: []),
	]),
)

const rvaFields = new Set(['Name', 'AddressOfFunctions', 'AddressOfNames', 'AddressOfNameOrdinals'])

interface FieldRow {
	name: string
	value: unknown
}

const fieldRows: FieldRow[] = Object.entries(image).map(([name, value]) => ({ name, value }))

function exportTimestamp(value: unknown): string {
	const seconds = Number(value)
	if (seconds === 0 || seconds === 0xffffffff) return 'Unspecified'
	return timestamp(seconds)
}

const fieldColumns = defineColumns<FieldRow>([
	{ key: 'field', title: 'Field', width: '14rem', mono: true, value: (row) => row.name },
	{
		key: 'value',
		title: 'Value',
		width: '9rem',
		mono: true,
		kind: (row): AddressKind | undefined =>
			rvaFields.has(row.name) && typeof row.value === 'number' && row.value ? 'rva' : undefined,
		value: (row) => (typeof row.value === 'number' ? hexOrZero(row.value) : String(row.value)),
	},
	{
		key: 'meaning',
		title: 'Meaning',
		minWidth: '12rem',
		muted: true,
		value: (row) => {
			if (row.name === 'TimeDateStamp') return exportTimestamp(row.value)
			if (rvaFields.has(row.name)) return 'RVA'
			if (typeof row.value === 'number' && /^(Base|NumberOf)/.test(row.name)) return count(row.value)
			return null
		},
	},
])

const total = props.data.rows.length
const status = computed(() =>
	state.query.trim()
		? `${count(rows.value.length)} of ${count(total)} exports`
		: `${count(total)} ${total === 1 ? 'export' : 'exports'}`,
)

const summary = computed(() => [
	{ term: 'Ordinal base', value: count(props.data.directory.ordinal_base), mono: true },
	{ term: 'Functions', value: count(props.data.directory.functions.length), mono: true },
	{ term: 'Names', value: count(Object.keys(props.data.directory.names).length), mono: true },
	{
		term: 'Forwarders',
		value: count(props.data.rows.filter((row) => typeof row.target === 'string').length),
		mono: true,
	},
	{ term: 'Timestamp', value: exportTimestamp(image.TimeDateStamp), mono: false },
	...(typeof image.Version === 'string' ? [{ term: 'Version', value: image.Version, mono: true }] : []),
])
</script>

<template>
	<ViewPage
		fill
		title="Exports"
		description="Functions and data this image makes available to other modules, by ordinal and by name."
	>
		<!-- The directory facts belong to the heading; the filter sits last, next to the table it narrows. -->
		<template #toolbar>
			<div class="flex min-w-0 basis-full flex-col gap-1 pt-1 pb-1">
				<dl class="flex flex-wrap items-start gap-x-6 gap-y-2">
					<div class="min-w-0">
						<dt class="text-caption text-secondary">DLL name</dt>
						<dd
							class="font-mono text-data wrap-anywhere"
							:class="data.directory.dll_name ? 'text-primary' : 'text-secondary'"
							translate="no"
						>
							{{ data.directory.dll_name ?? 'Unavailable' }}
						</dd>
					</div>
					<div v-for="item in summary" :key="item.term" class="min-w-0">
						<dt class="text-caption text-secondary">{{ item.term }}</dt>
						<dd :class="item.mono ? 'num font-mono text-data' : ''">{{ item.value }}</dd>
					</div>
				</dl>
				<Collapsible>
					<CollapsibleTrigger
						class="group -ms-1 h-6 gap-1 rounded-sm px-1 text-caption text-secondary hover:bg-hover hover:text-primary"
					>
						<IconChevronRight class="size-4 shrink-0 group-data-open:rotate-90" aria-hidden="true" />
						Directory fields
					</CollapsibleTrigger>
					<CollapsiblePanel class="text-primary">
						<div class="-mx-4 mt-1 max-h-60 overflow-auto scroll-thin @2xl:-mx-6">
							<DataTable :rows="fieldRows" :columns="fieldColumns" label="Export directory fields" />
						</div>
					</CollapsiblePanel>
				</Collapsible>
			</div>
			<template v-if="total">
				<FilterInput v-model="state.query" label="Filter exports" placeholder="CreateFileW" />
				<p class="num pb-1 text-caption text-secondary" role="status">{{ status }}</p>
			</template>
		</template>

		<EmptyState v-if="!total" title="No exports in this file">
			The export directory is present but lists no functions.
		</EmptyState>
		<div v-else ref="tableBox" class="min-h-0 flex-1">
			<DataTable
				v-model:sort="state.sort"
				fill
				:rows="rows"
				:columns="columns"
				:row-key="(row) => row.ordinal"
				label="Exports"
			>
				<template #cell-rva="{ row, value }">
					<Tag v-if="typeof row.target === 'string'">Forwarder</Tag>
					<template v-else-if="value">{{ value }}</template>
					<span v-else class="font-sans text-body text-secondary">Unused</span>
				</template>
				<template #empty>
					<EmptyState :title="`No exports match '${state.query.trim()}'`">
						The filter looks for part of a name, a forwarder target, an ordinal or an RVA.
						<template #actions>
							<Button data-size="sm" @click="state.query = ''">Clear filter</Button>
						</template>
					</EmptyState>
				</template>
			</DataTable>
		</div>
	</ViewPage>
</template>
