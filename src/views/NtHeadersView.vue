<script lang="ts">
import { computed } from 'vue'
import type { PeDocument } from '@/pe/document'
import type { ViewContent } from '@/pe/view'
import { unwrap } from '@/pe/pelite'
import { byteCount, count, hex, timestamp } from '@/lib/format'
import { addressKind, fieldRows, formatFieldValue, signatureText, type FieldRow } from './headers/fields'
import {
	debugTypeRepro,
	directoryNames,
	directoryViews,
	machineName,
	optionalMagicName,
	securityDirectory,
	stripFlag,
	subsystemName,
} from './headers/flags'
import { readSections, type SectionRow } from './headers/sections'

export interface DirectoryRow {
	index: number
	name: string
	address: number
	size: number
	/** The section that holds the directory, by name. */
	section: string | null
	absent: boolean
	/** The workspace view that shows this directory. */
	view: string | undefined
}

export interface NtHeadersData {
	signature: FieldRow[]
	fileHeader: FieldRow[]
	optionalHeader: FieldRow[]
	directories: DirectoryRow[]
	sections: SectionRow[]
}

type Details = Record<string, unknown>

function stringList(value: unknown): string[] {
	return Array.isArray(value) ? value.map((name) => stripFlag(String(name))) : []
}

function stampMeaning(value: number, reproducible: boolean): string {
	if (reproducible) return 'Content hash, not a date: the debug directory marks this as a reproducible build'
	if (value === 0 || value === 0xffffffff) return 'Not set'
	return timestamp(value)
}

function fileHeaderRows(header: object, details: Details, reproducible: boolean): FieldRow[] {
	return fieldRows(header, (value, field) => {
		const number = Number(value)
		switch (field) {
			case 'Machine': {
				const constant =
					typeof details['FileHeader.Machine'] === 'string' ? details['FileHeader.Machine'] : undefined
				return { meaning: machineName(number) ?? (constant ? undefined : 'Unknown machine'), constant }
			}
			case 'NumberOfSections':
				return { meaning: `${count(number)} ${number === 1 ? 'section' : 'sections'}` }
			case 'TimeDateStamp':
				return { meaning: stampMeaning(number, reproducible) }
			case 'PointerToSymbolTable':
				return {
					kind: addressKind('fo', value),
					meaning: number ? 'COFF symbol table' : 'No COFF symbol table',
				}
			case 'NumberOfSymbols':
				return { meaning: `${count(number)} ${number === 1 ? 'symbol' : 'symbols'}` }
			case 'SizeOfOptionalHeader':
				return { meaning: byteCount(number) }
			case 'Characteristics':
				return { flags: stringList(details['FileHeader.Characteristics']) }
		}
		return undefined
	})
}

const optionalSizes = new Set([
	'SizeOfCode',
	'SizeOfInitializedData',
	'SizeOfUninitializedData',
	'SectionAlignment',
	'FileAlignment',
	'SizeOfImage',
	'SizeOfHeaders',
	'SizeOfStackReserve',
	'SizeOfStackCommit',
	'SizeOfHeapReserve',
	'SizeOfHeapCommit',
])

const optionalAddresses: Record<string, 'rva' | 'va'> = {
	ImageBase: 'va',
	AddressOfEntryPoint: 'rva',
	BaseOfCode: 'rva',
	BaseOfData: 'rva',
}

function optionalHeaderRows(header: object, details: Details): FieldRow[] {
	return fieldRows(header, (value, field) => {
		const number = Number(value)
		if (optionalSizes.has(field)) return { meaning: byteCount(number) }
		switch (field) {
			case 'Magic': {
				const constant =
					typeof details['OptionalHeader.Magic'] === 'string' ? details['OptionalHeader.Magic'] : undefined
				return { meaning: optionalMagicName(number), constant }
			}
			case 'ImageBase':
				return { kind: optionalAddresses[field], meaning: 'Preferred load address' }
			case 'AddressOfEntryPoint':
				return { kind: addressKind('rva', value), meaning: number ? undefined : 'No entry point' }
			case 'BaseOfCode':
			case 'BaseOfData':
				return { kind: addressKind(optionalAddresses[field], value) }
			case 'CheckSum': {
				const computed = details['OptionalHeader.CheckSum']
				if (number === 0) return { meaning: 'Not set' }
				if (typeof computed !== 'number') return undefined
				return computed === number
					? {
							status: { label: 'Matches', tone: 'success' },
							meaning: 'Equals the checksum computed from the file',
						}
					: {
							status: { label: 'Does not match', tone: 'warning' },
							meaning: `The file computes to ${hex(computed)}`,
						}
			}
			case 'Subsystem': {
				const constant =
					typeof details['OptionalHeader.Subsystem'] === 'string'
						? details['OptionalHeader.Subsystem']
						: undefined
				return { meaning: subsystemName(number), constant }
			}
			case 'DllCharacteristics':
				return { flags: stringList(details['OptionalHeader.DllCharacteristics']) }
			case 'NumberOfRvaAndSizes':
				return { meaning: `${count(number)} data directory ${number === 1 ? 'entry' : 'entries'}` }
		}
		return undefined
	})
}

/** A debug directory that cannot be read is no reason to fail the headers view. */
function isReproducible(doc: PeDocument): boolean {
	const entries = doc.peFile.debug()
	if (entries instanceof Error || !entries) return false
	return entries.some((entry) => entry.image.Type === debugTypeRepro)
}

export function prepare(doc: PeDocument): ViewContent<NtHeadersData> {
	const headers = unwrap(doc.peFile.headers())
	const details = headers.details as Details
	const nt = headers.NtHeaders
	const sectionIndexes = details['DataDirectory.Sections'] as (number | null)[] | undefined

	const signatureConstant = details['NtHeaders.Signature']
	const signature: FieldRow[] = [
		{
			field: 'Signature',
			value: formatFieldValue(nt.Signature),
			meaning: typeof signatureConstant === 'string' ? signatureConstant : signatureText(nt.Signature, 4),
			status:
				nt.Signature === 0x4550 ? { label: 'Valid', tone: 'success' } : { label: 'Not PE', tone: 'danger' },
		},
	]

	const directories = headers.DataDirectory.map((directory, index): DirectoryRow => {
		const sectionIndex = sectionIndexes?.[index]
		return {
			index,
			name: directoryNames[index] ?? `Directory ${index}`,
			address: directory.VirtualAddress,
			size: directory.Size,
			// The parser maps every slot as an RVA; the security slot's file offset says nothing about sections.
			section:
				sectionIndex == null || index === securityDirectory
					? null
					: (headers.SectionHeaders[sectionIndex]?.Name ?? null),
			absent: directory.VirtualAddress === 0 && directory.Size === 0,
			view: directory.VirtualAddress ? directoryViews[index] : undefined,
		}
	})

	return {
		data: {
			signature,
			fileHeader: fileHeaderRows(nt.FileHeader, details, isReproducible(doc)),
			optionalHeader: optionalHeaderRows(nt.OptionalHeader, details),
			directories,
			sections: readSections(doc, headers),
		},
	}
}
</script>

<script setup lang="ts">
import { defineColumns } from '@/components/ui/table'
import { useWorkspace } from '@/pe/view'
import FieldTable from './headers/FieldTable.vue'
import SectionTable from './headers/SectionTable.vue'

const props = defineProps<{ data: NtHeadersData }>()

const workspace = useWorkspace()

const directoryMeta = computed(() => {
	const present = props.data.directories.filter((row) => !row.absent).length
	return `${count(present)} of ${count(props.data.directories.length)} present`
})
const sectionMeta = computed(() => {
	const total = props.data.sections.length
	return `${count(total)} ${total === 1 ? 'section' : 'sections'}`
})

function openDirectory(row: DirectoryRow) {
	if (row.view) workspace.openView(row.view)
}

const directoryColumns = defineColumns<DirectoryRow>([
	{
		key: 'index',
		title: '#',
		width: '3rem',
		align: 'end',
		mono: true,
		muted: true,
		value: (row) => row.index,
	},
	{ key: 'name', title: 'Directory', width: '9rem', value: (row) => row.name },
	{
		key: 'address',
		title: 'Address',
		width: '7rem',
		mono: true,
		kind: (row) => (row.absent || !row.address ? undefined : row.index === securityDirectory ? 'fo' : 'rva'),
		value: (row) => (row.absent ? null : hex(row.address)),
	},
	{
		key: 'size',
		title: 'Size',
		width: '9rem',
		align: 'end',
		mono: true,
		value: (row) => (row.absent ? null : byteCount(row.size)),
	},
	{ key: 'section', title: 'Section', mono: true, value: (row) => row.section },
])
</script>

<template>
	<ViewPage
		title="NT headers"
		description="IMAGE_NT_HEADERS: the PE signature, the COFF file header and the optional header, which tell the loader how to map and start the image."
	>
		<ViewSection title="Signature" flush>
			<FieldTable :rows="data.signature" label="NT signature" />
		</ViewSection>
		<ViewSection
			title="File header"
			description="IMAGE_FILE_HEADER: target machine, section count and image characteristics."
			flush
		>
			<FieldTable :rows="data.fileHeader" label="File header fields" />
		</ViewSection>
		<ViewSection
			title="Optional header"
			description="IMAGE_OPTIONAL_HEADER: entry point, image base, alignment, subsystem and memory reservations."
			flush
		>
			<FieldTable :rows="data.optionalHeader" label="Optional header fields" />
		</ViewSection>
		<ViewSection
			title="Data directories"
			:meta="directoryMeta"
			description="Where the loader finds each table. Addresses are RVAs, except the security directory, which holds a file offset."
			flush
		>
			<DataTable
				:rows="data.directories"
				:columns="directoryColumns"
				label="Data directories"
				:row-key="(row) => row.index"
				empty="This file has no data directories"
				@activate="openDirectory"
			>
				<!-- The name is the link to the view that shows the directory, so the link says where it goes. -->
				<template #cell-name="{ row }">
					<button
						v-if="row.view"
						type="button"
						class="-mx-1 rounded-sm px-1 text-accent underline decoration-accent-border underline-offset-4 hover:bg-hover hover:decoration-solid"
						:aria-label="`Open ${row.name} directory`"
						@click="openDirectory(row)"
					>
						{{ row.name }}
					</button>
					<span v-else :class="row.absent ? 'text-secondary' : ''">{{ row.name }}</span>
				</template>
				<template #cell-address="{ row, value }">
					<span v-if="row.absent" class="font-sans text-body text-secondary">Absent</span>
					<template v-else>{{ value }}</template>
				</template>
			</DataTable>
		</ViewSection>
		<ViewSection title="Section headers" :meta="sectionMeta" flush>
			<SectionTable :rows="data.sections" label="Section headers" />
		</ViewSection>
	</ViewPage>
</template>
