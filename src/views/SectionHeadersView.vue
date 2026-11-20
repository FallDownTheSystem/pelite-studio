<script lang="ts">
import type { PeDocument } from '@/pe/document'
import type { PeHeaders } from '@/pe/pelite'
import type { ViewContent } from '@/pe/view'
import { readSections, type SectionRow } from './headers/sections'

export interface SectionHeadersData {
	sections: SectionRow[]
}

/** `existingHeaders` lets the NT headers view reuse headers it has already parsed. */
export function prepare(doc: PeDocument, existingHeaders?: PeHeaders): ViewContent<SectionHeadersData> {
	return { data: { sections: readSections(doc, existingHeaders) } }
}
</script>

<script setup lang="ts">
import { count } from '@/lib/format'
import SectionTable from './headers/SectionTable.vue'

defineProps<{ data: SectionHeadersData }>()
</script>

<template>
	<ViewPage
		title="Section headers"
		description="IMAGE_SECTION_HEADER: where each section sits in memory and in the file, and how the loader maps it."
	>
		<EmptyState v-if="!data.sections.length" title="No section headers in this file">
			The file header declares zero sections.
		</EmptyState>
		<ViewSection
			v-else
			title="Sections"
			:meta="`${count(data.sections.length)} ${data.sections.length === 1 ? 'section' : 'sections'}`"
			description="Entropy runs from 0 to 8 bits per byte. Values near 8 suggest compressed or encrypted data. Each chart shows the entropy from the start to the end of the section's raw data, on that 0 to 8 scale."
			flush
		>
			<SectionTable :rows="data.sections" label="Section headers" />
		</ViewSection>
	</ViewPage>
</template>
