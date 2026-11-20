<script lang="ts">
import type { PeDocument } from '@/pe/document'
import type { ViewContent } from '@/pe/view'
import { unwrap } from '@/pe/pelite'
import { byteCount, count, hex } from '@/lib/format'
import { addressKind, fieldRows, signatureText, type FieldRow } from './headers/fields'

export interface DosHeaderData {
	rows: FieldRow[]
}

/** MS-DOS sizes count 512-byte pages and 16-byte paragraphs. */
function describe(value: unknown, field: string): Omit<FieldRow, 'field' | 'value'> | undefined {
	const number = typeof value === 'number' ? value : 0
	switch (field) {
		case 'e_magic':
			return number === 0x5a4d
				? { meaning: 'MZ', status: { label: 'Valid', tone: 'success' } }
				: { meaning: signatureText(number, 2), status: { label: 'Not MZ', tone: 'danger' } }
		case 'e_cblp':
			return { meaning: number === 0 ? 'Last page is full' : `${byteCount(number)} used in the last page` }
		case 'e_cp':
			return { meaning: `${count(number)} ${number === 1 ? 'page' : 'pages'} of 512 bytes` }
		case 'e_crlc':
			return { meaning: `${count(number)} DOS ${number === 1 ? 'relocation' : 'relocations'}` }
		case 'e_cparhdr':
			return { meaning: `${count(number)} paragraphs (${byteCount(number * 16)})` }
		case 'e_minalloc':
		case 'e_maxalloc':
			return { meaning: `${count(number)} paragraphs (${byteCount(number * 16)})` }
		case 'e_lfarlc':
			return { kind: addressKind('fo', value), meaning: `DOS relocation table at file offset ${hex(number)}` }
		case 'e_lfanew':
			return { kind: addressKind('fo', value), meaning: `NT headers at file offset ${hex(number)}` }
	}
	return undefined
}

export function prepare(doc: PeDocument): ViewContent<DosHeaderData> {
	const { e_res: _reserved, e_res2: _reserved2, ...header } = unwrap(doc.peFile.dosHeader())
	return { data: { rows: fieldRows(header, describe) } }
}
</script>

<script setup lang="ts">
import FieldTable from './headers/FieldTable.vue'

defineProps<{ data: DosHeaderData }>()
</script>

<template>
	<ViewPage
		title="DOS header"
		description="IMAGE_DOS_HEADER: the MS-DOS stub header at the start of the file. Windows reads only e_magic and e_lfanew, the offset of the NT headers."
	>
		<ViewSection title="Fields" flush>
			<FieldTable :rows="data.rows" label="DOS header fields" />
		</ViewSection>
	</ViewPage>
</template>
