<script lang="ts">
import type { PeDocument } from '@/pe/document'
import type { ViewContent } from '@/pe/view'
import { unwrap } from '@/pe/pelite'
import type { PeRichStructure } from '@/vendor/pelite/pelite.js'
import { formatFieldValue, type FieldRow } from './headers/fields'

export interface RichStructureData {
	rich: PeRichStructure | null
	summary: FieldRow[]
	/** Survives moving the tab between panes, so a download is not repeated. */
	state: { descriptions: Map<string, string> | null; error: string }
}

export function isAvailable(doc: PeDocument): boolean {
	return !(doc.peFile.richStructure() instanceof Error)
}

export function prepare(doc: PeDocument): ViewContent<RichStructureData> {
	const rich = unwrap(doc.peFile.richStructure())
	const summary: FieldRow[] = rich
		? [
				{ field: 'XOR key', value: formatFieldValue(rich.xor_key) },
				{
					field: 'Checksum',
					value: formatFieldValue(rich.checksum),
					status:
						rich.checksum === rich.xor_key
							? { label: 'Matches XOR key', tone: 'success' }
							: { label: 'Does not match XOR key', tone: 'warning' },
				},
			]
		: []
	return { data: { rich, summary, state: shallowReactive({ descriptions: null, error: '' }) } }
}
</script>

<script setup lang="ts">
import { defineColumns } from '@/components/ui/table'
import { Button } from '@ui-sdk/vue/button'
import IconExternalLink from '~icons/lucide/external-link'
import IconLoader from '~icons/lucide/loader-circle'
import type { PeRichRecord } from '@/vendor/pelite/pelite.js'
import { count, hexOrZero } from '@/lib/format'
import FieldTable from './headers/FieldTable.vue'
import { describeRecord, loadRichprintDatabase, richprintDatabaseUrl } from './headers/richprint'

const props = defineProps<{ data: RichStructureData }>()

const state = props.data.state

async function loadDescriptions() {
	state.error = ''
	try {
		state.descriptions = markRaw(await loadRichprintDatabase())
	} catch {
		state.error =
			'Could not load the richprint database. Check the network connection, then load the interpretations again.'
	}
}

interface RecordRow {
	number: number
	record: PeRichRecord
}

const records = computed(() =>
	(props.data.rich?.records ?? []).map((record, index) => ({ number: index + 1, record })),
)

const columns = computed(() => {
	const descriptions = state.descriptions
	return defineColumns<RecordRow>([
		{
			key: 'number',
			title: '#',
			width: '3.5rem',
			align: 'end',
			mono: true,
			muted: true,
			value: (row) => row.number,
		},
		{
			key: 'product',
			title: 'Product',
			width: '6rem',
			mono: true,
			value: (row) => hexOrZero(row.record.product),
		},
		{
			key: 'build',
			title: 'Build',
			width: '6rem',
			align: 'end',
			mono: true,
			value: (row) => row.record.build,
		},
		{
			key: 'count',
			title: 'Count',
			// Until interpretations load, the last column takes the remaining width of the fill table.
			width: descriptions ? '6rem' : undefined,
			minWidth: '6rem',
			align: 'end',
			mono: true,
			value: (row) => count(row.record.count),
		},
		...(descriptions
			? [
					{
						key: 'meaning',
						title: 'Interpretation',
						minWidth: '16rem',
						value: (row: RecordRow) => describeRecord(descriptions, row.record),
					},
				]
			: []),
	])
})

/** Short lists keep their natural height; long ones scroll inside a bounded, virtualized table. */
const long = computed(() => records.value.length > 50)
const tableHeight = computed(() => `min(${records.value.length * 28 + 34}px, 32rem)`)
</script>

<template>
	<ViewPage
		title="Rich structure"
		description="An undocumented block the Microsoft linker writes after the DOS stub. It lists the tools that built the image: product ID, build number and how many objects each produced."
	>
		<EmptyState v-if="!data.rich" title="No Rich structure in this file">
			The linker that built this file did not write one, or it was removed.
		</EmptyState>
		<template v-else>
			<ViewSection title="Summary" flush>
				<FieldTable :rows="data.summary" label="Rich structure summary" />
			</ViewSection>
			<ViewSection
				title="Records"
				:meta="`${count(data.rich.records.length)} ${data.rich.records.length === 1 ? 'record' : 'records'}`"
				:description="
					data.rich.records.length && !state.descriptions
						? 'Loading interpretations downloads the richprint product table from GitHub. Nothing is sent about this file.'
						: undefined
				"
				flush
			>
				<template v-if="data.rich.records.length" #actions>
					<a
						v-if="state.descriptions"
						:href="richprintDatabaseUrl"
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center gap-1 rounded-sm text-caption text-accent underline decoration-accent-border underline-offset-4 hover:decoration-solid"
					>
						Interpretations from the richprint database
						<IconExternalLink class="size-3.5 shrink-0" aria-hidden="true" />
						<span class="sr-only">(opens in a new tab)</span>
					</a>
					<Button
						v-else
						class="group"
						data-size="sm"
						pending-announcement="Loading interpretations"
						@click="loadDescriptions"
					>
						<IconLoader
							class="hidden size-4 shrink-0 group-data-pending:inline motion-safe:animate-spin"
							aria-hidden="true"
						/>
						Load interpretations
					</Button>
				</template>
				<div class="flex flex-col gap-3">
					<div v-if="state.error" class="px-4 @2xl:px-6">
						<Notice tone="danger">{{ state.error }}</Notice>
					</div>
					<!-- Four short number columns read badly stretched across a wide panel; once loaded, the interpretation column takes the width. -->
					<div
						v-if="data.rich.records.length"
						:class="[long ? 'h-(--h)' : '', state.descriptions ? '' : 'max-w-md']"
						:style="long ? { '--h': tableHeight } : undefined"
					>
						<DataTable
							:rows="records"
							:columns="columns"
							label="Rich records"
							:row-key="(row) => row.number"
							:fill="long"
						/>
					</div>
					<EmptyState v-else title="No Rich records"
						>The Rich structure is present but lists no tools.</EmptyState
					>
				</div>
			</ViewSection>
		</template>
	</ViewPage>
</template>
