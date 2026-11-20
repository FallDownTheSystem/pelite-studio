<script lang="ts">
import { computed } from 'vue'
import type { PeDocument } from '@/pe/document'
import type { ViewContent } from '@/pe/view'
import { unwrap } from '@/pe/pelite'
import type { PeTls } from '@/vendor/pelite/pelite.js'
import { byteCount, hex } from '@/lib/format'
import { addressKind, formatFieldValue, type FieldRow } from './headers/fields'
import { sectionAlignment } from './headers/flags'

export interface TlsData {
	directory: PeTls
	rows: FieldRow[]
}

function describe(
	field: string,
	value: number,
	image: PeTls['image'],
): Omit<FieldRow, 'field' | 'value'> | undefined {
	switch (field) {
		case 'StartAddressOfRawData':
			return { kind: addressKind('va', value), meaning: 'Start of the initialized data template' }
		case 'EndAddressOfRawData': {
			const size = value - (image.StartAddressOfRawData ?? 0)
			return {
				kind: addressKind('va', value),
				meaning:
					size >= 0 ? `End of the template (${byteCount(size)} of initialized data)` : 'End of the template',
			}
		}
		case 'AddressOfIndex':
			return { kind: addressKind('va', value), meaning: 'Where the loader stores the TLS slot index' }
		case 'AddressOfCallBacks':
			return {
				kind: addressKind('va', value),
				meaning: value ? 'Zero-terminated array of callback addresses' : 'No callbacks',
			}
		case 'SizeOfZeroFill':
			return { meaning: `${byteCount(value)} of zeros after the template` }
		case 'Characteristics': {
			const alignment = sectionAlignment(value)
			return alignment ? { meaning: `Aligned to ${byteCount(alignment)}` } : undefined
		}
	}
	return undefined
}

export function prepare(doc: PeDocument): ViewContent<TlsData> {
	const directory = unwrap(doc.peFile.tls())
	if (directory === null) throw new Error('This file has no TLS directory.')
	const rows: FieldRow[] = Object.entries(directory.image).map(([field, value]) => ({
		field,
		value: formatFieldValue(value),
		...describe(field, value, directory.image),
	}))
	rows.push({
		field: 'TLS slot',
		value: directory.slot === null ? '' : formatFieldValue(directory.slot),
		meaning:
			directory.slot === null
				? 'Unavailable: the parser could not read the value at AddressOfIndex'
				: `Value stored at AddressOfIndex ${hex(directory.image.AddressOfIndex)}`,
	})
	return { data: { directory, rows } }
}
</script>

<script setup lang="ts">
import { defineColumns } from '@/components/ui/table'
import { count } from '@/lib/format'
import FieldTable from './headers/FieldTable.vue'

const props = defineProps<{ data: TlsData }>()

interface CallbackRow {
	number: number
	address: number
}

const callbacks = computed(() =>
	(props.data.directory.callbacks ?? []).map((address, index) => ({ number: index + 1, address })),
)
const long = computed(() => callbacks.value.length > 50)
const callbackMeta = computed(() => {
	const total = callbacks.value.length
	return total ? `${count(total)} ${total === 1 ? 'callback' : 'callbacks'}` : undefined
})
const tableHeight = computed(() => `min(${callbacks.value.length * 28 + 34}px, 32rem)`)

const callbackColumns = defineColumns<CallbackRow>([
	{
		key: 'number',
		title: '#',
		width: '4rem',
		align: 'end',
		mono: true,
		muted: true,
		value: (row) => row.number,
	},
	{ key: 'address', title: 'Callback VA', mono: true, kind: 'va', value: (row) => hex(row.address) },
])

const image = computed(() => props.data.directory.image)
const rawData = computed(() => props.data.directory.raw_data)

/** Base64 carries 3 bytes in every 4 characters, less the padding. */
const rawSize = computed(() => {
	const text = rawData.value
	if (!text) return 0
	return (text.length / 4) * 3 - (text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0)
})
const rawMeta = computed(() => (rawData.value ? byteCount(rawSize.value) : undefined))
</script>

<template>
	<ViewPage
		title="TLS directory"
		description="IMAGE_TLS_DIRECTORY: the template the loader copies into each thread's local storage, and the callbacks it runs when a thread or the process starts and ends."
	>
		<ViewSection title="Fields" flush>
			<FieldTable :rows="data.rows" label="TLS directory fields" />
		</ViewSection>
		<ViewSection
			title="Callbacks"
			:meta="callbackMeta"
			description="TLS callbacks run before the entry point."
			flush
		>
			<!-- One narrow column reads badly stretched across a wide panel. -->
			<div
				v-if="callbacks.length"
				class="max-w-sm"
				:class="long ? 'h-(--h)' : ''"
				:style="long ? { '--h': tableHeight } : undefined"
			>
				<DataTable
					:rows="callbacks"
					:columns="callbackColumns"
					label="TLS callbacks"
					:row-key="(row) => row.number"
					:fill="long"
				/>
			</div>
			<p v-else class="px-4 text-secondary @2xl:px-6">
				{{
					data.directory.callbacks === null && image.AddressOfCallBacks
						? 'The callback table is unavailable: it could not be read from the file.'
						: 'No TLS callbacks in this file.'
				}}
			</p>
		</ViewSection>
		<ViewSection
			title="Initialized data"
			:meta="rawMeta"
			description="The template copied into each new thread's TLS block, shown as Base64."
		>
			<template v-if="rawData" #actions>
				<CopyButton :value="rawData" label="Copy initialized data as Base64" />
			</template>
			<pre
				v-if="rawData"
				class="scroll-thin max-h-64 overflow-auto rounded-md bg-sunken p-3 font-mono text-data whitespace-pre-wrap wrap-anywhere"
				tabindex="0"
				aria-label="Initialized TLS data (Base64)"
				translate="no"
				>{{ rawData }}</pre>
			<p v-else class="text-secondary">
				{{
					rawData === null && image.StartAddressOfRawData !== image.EndAddressOfRawData
						? 'The initialized data is unavailable: it could not be read from the file.'
						: 'No initialized TLS data in this file.'
				}}
			</p>
		</ViewSection>
	</ViewPage>
</template>
