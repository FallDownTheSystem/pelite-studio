<script lang="ts">
import type { PeDocument } from '@/pe/document'
import type { ViewContent } from '@/pe/view'
import { unwrap } from '@/pe/pelite'
import type { PeDebugDirectoryEntry, PeDebugDirectoryImage } from '@/vendor/pelite/pelite.js'
import { byteCount, hex, timestamp } from '@/lib/format'
import { addressKind, fieldRows, formatFieldValue, signatureText, type FieldRow } from './headers/fields'
import { debugTypeDescription, debugTypeName, debugTypeRepro } from './headers/flags'

export interface PgoRow {
	number: number
	name: string | null
	rva: number | null
	size: number | null
	error: string | null
}

export interface DebugPayload {
	title: string
	rows: FieldRow[]
	/** Only profile-guided optimization entries list sections. */
	sections?: PgoRow[]
}

export interface DebugEntryRow {
	number: number
	/** `CODEVIEW`, `POGO`…; the raw type number in hex when the format does not name it. */
	type: string
	image: PeDebugDirectoryImage
	header: FieldRow[]
	payload: DebugPayload | null
}

export interface DebugDirectoryData {
	entries: DebugEntryRow[]
	state: { selected: number | undefined }
}

function stampMeaning(value: number, reproducible: boolean): string {
	if (reproducible) return 'Content hash, not a date (reproducible build)'
	return value ? timestamp(value) : 'Not set'
}

function headerRows(image: PeDebugDirectoryImage, type: string, reproducible: boolean): FieldRow[] {
	return fieldRows(image, (value, field) => {
		const number = typeof value === 'number' ? value : 0
		switch (field) {
			case 'TimeDateStamp':
				return { meaning: stampMeaning(number, reproducible) }
			case 'Type':
				return { meaning: debugTypeDescription(type), constant: `IMAGE_DEBUG_TYPE_${type}` }
			case 'SizeOfData':
				return { meaning: byteCount(number) }
			case 'AddressOfRawData':
				return { kind: addressKind('rva', value), meaning: number ? undefined : 'Not mapped into memory' }
			case 'PointerToRawData':
				return { kind: addressKind('fo', value) }
		}
		return undefined
	})
}

function payloadOf(entry: PeDebugDirectoryEntry['entry'], reproducible: boolean): DebugPayload | null {
	if (!entry) return null
	if ('pdb_file_name' in entry) {
		const rows: FieldRow[] = [
			{ field: 'Format', value: entry.format },
			...fieldRows(entry.image, (value, field) => {
				const number = typeof value === 'number' ? value : 0
				if (field === 'CvSignature') return { meaning: signatureText(number, 4) }
				if (field === 'TimeDateStamp') return { meaning: stampMeaning(number, reproducible) }
				return undefined
			}),
			{ field: 'PDB path', value: entry.pdb_file_name },
		]
		return { title: 'CodeView', rows }
	}
	if ('name' in entry) {
		const name = Array.isArray(entry.name)
			? entry.name.map((unit) => String.fromCharCode(unit)).join('')
			: entry.name
		const rows: FieldRow[] = [
			...fieldRows(entry.image, (value, field) => {
				if (field === 'DataType' && value === 1) return { constant: 'IMAGE_DEBUG_MISC_EXENAME' }
				if (field === 'Length') return { meaning: byteCount(Number(value)) }
				if (field === 'Unicode') return { meaning: value ? 'UTF-16 name' : 'ANSI name' }
				return undefined
			}),
			{ field: 'Name', value: name },
		]
		return { title: 'Miscellaneous', rows }
	}
	return {
		title: 'Profile-guided optimization',
		rows: [{ field: 'PGO signature', value: entry.signature }],
		sections: entry.sections.map((section, index) => ({
			number: index + 1,
			name: section.Ok?.name ?? null,
			rva: section.Ok?.rva ?? null,
			size: section.Ok?.size ?? null,
			error: section.Err ?? null,
		})),
	}
}

export function prepare(doc: PeDocument): ViewContent<DebugDirectoryData> {
	const entries = unwrap(doc.peFile.debug())
	if (entries === null) throw new Error('This file has no debug directory.')
	const reproducible = entries.some((entry) => entry.image.Type === debugTypeRepro)
	const rows = entries.map(({ image, type, entry }, index): DebugEntryRow => {
		const name = debugTypeName(image.Type, type) ?? formatFieldValue(image.Type)
		return {
			number: index + 1,
			type: name,
			image,
			header: headerRows(image, name, reproducible),
			payload: payloadOf(entry, reproducible),
		}
	})
	return { data: { entries: rows, state: reactive({ selected: rows[0]?.number }) } }
}
</script>

<script setup lang="ts">
import { defineColumns } from '@/components/ui/table'
import { count } from '@/lib/format'
import FieldTable from './headers/FieldTable.vue'

const props = defineProps<{ data: DebugDirectoryData }>()

const state = props.data.state

const selectedEntry = computed(() => props.data.entries.find((entry) => entry.number === state.selected))

const entryColumns = defineColumns<DebugEntryRow>([
	{
		key: 'number',
		title: '#',
		width: '3rem',
		align: 'end',
		mono: true,
		muted: true,
		value: (row) => row.number,
	},
	{ key: 'type', title: 'Type', width: '13rem', mono: true, value: (row) => row.type },
	{
		key: 'rva',
		title: 'Data RVA',
		width: '7rem',
		mono: true,
		kind: (row) => (row.image.AddressOfRawData ? 'rva' : undefined),
		value: (row) => formatFieldValue(row.image.AddressOfRawData),
	},
	{
		key: 'offset',
		title: 'File offset',
		width: '7rem',
		mono: true,
		kind: (row) => (row.image.PointerToRawData ? 'fo' : undefined),
		value: (row) => formatFieldValue(row.image.PointerToRawData),
	},
	{
		key: 'size',
		title: 'Size',
		width: '8rem',
		align: 'end',
		mono: true,
		value: (row) => byteCount(row.image.SizeOfData),
	},
	{ key: 'description', title: 'Description', muted: true, value: (row) => debugTypeDescription(row.type) },
])

const sections = computed(() => selectedEntry.value?.payload?.sections ?? [])
const long = computed(() => sections.value.length > 50)
const tableHeight = computed(() => `min(${sections.value.length * 28 + 34}px, 32rem)`)

const sectionColumns = defineColumns<PgoRow>([
	{
		key: 'number',
		title: '#',
		width: '4rem',
		align: 'end',
		mono: true,
		muted: true,
		value: (row) => row.number,
	},
	{ key: 'name', title: 'Name', width: '20rem', mono: true, value: (row) => row.name },
	{
		key: 'rva',
		title: 'RVA',
		width: '8rem',
		mono: true,
		kind: (row) => (row.rva ? 'rva' : undefined),
		value: (row) => (row.rva === null ? null : hex(row.rva)),
	},
	{
		key: 'size',
		title: 'Size',
		width: '9rem',
		align: 'end',
		mono: true,
		value: (row) => (row.size === null ? null : hex(row.size)),
	},
	// The error column is empty for most rows, so it takes the spare width at the end.
	{ key: 'error', title: 'Error', minWidth: '14rem', value: (row) => row.error },
])
</script>

<template>
	<ViewPage
		title="Debug directory"
		description="IMAGE_DEBUG_DIRECTORY: pointers to debug information, such as the PDB file that holds the symbols for this image."
	>
		<EmptyState v-if="!data.entries.length" title="No debug entries in this file">
			The debug directory is present but empty.
		</EmptyState>
		<template v-else>
			<ViewSection
				title="Entries"
				:meta="`${count(data.entries.length)} ${data.entries.length === 1 ? 'entry' : 'entries'}`"
				description="Select an entry to see its header and data."
				flush
			>
				<DataTable
					v-model:selected="state.selected"
					:rows="data.entries"
					:columns="entryColumns"
					label="Debug directory entries"
					:row-key="(row) => row.number"
				/>
			</ViewSection>
			<template v-if="selectedEntry">
				<ViewSection :title="`Entry ${selectedEntry.number}: ${selectedEntry.type}`" flush>
					<FieldTable :rows="selectedEntry.header" :label="`Debug entry ${selectedEntry.number} header`" />
				</ViewSection>
				<ViewSection
					:title="selectedEntry.payload ? `${selectedEntry.payload.title} data` : 'Debug data'"
					flush
				>
					<FieldTable
						v-if="selectedEntry.payload"
						:rows="selectedEntry.payload.rows"
						:label="`Debug entry ${selectedEntry.number} data`"
					/>
					<p v-else class="px-4 text-secondary @2xl:px-6">
						The data of this entry is unavailable or uses a format this tool does not read.
					</p>
				</ViewSection>
				<ViewSection
					v-if="selectedEntry.payload?.sections"
					title="PGO sections"
					:meta="`${count(sections.length)} ${sections.length === 1 ? 'section' : 'sections'}`"
					flush
				>
					<div
						v-if="sections.length"
						:class="long ? 'h-(--h)' : ''"
						:style="long ? { '--h': tableHeight } : undefined"
					>
						<DataTable
							:rows="sections"
							:columns="sectionColumns"
							label="PGO sections"
							:row-key="(row) => row.number"
							:fill="long"
						/>
					</div>
					<p v-else class="px-4 text-secondary @2xl:px-6">This entry lists no PGO sections.</p>
				</ViewSection>
			</template>
		</template>
	</ViewPage>
</template>
