<script lang="ts">
import type { PeDocument } from '@/pe/document'
import type { ViewContent } from '@/pe/view'
import { unwrap } from '@/pe/pelite'
import { describeImage } from '@/pe/describe'
import type { SortState } from '@/components/ui/table'
import type { PeRuntimeFunction } from '@/vendor/pelite/pelite.js'

export type ExceptionsData =
	| { supported: false; machine: number; machineName: string }
	| {
			supported: true
			functions: PeRuntimeFunction[]
			state: { query: string; sort: SortState | undefined }
	  }

const machineAmd64 = 0x8664

export function prepare(doc: PeDocument): ViewContent<ExceptionsData> {
	const header = unwrap(doc.peFile.fileHeader())
	if (header.Machine !== machineAmd64) {
		return {
			data: {
				supported: false,
				machine: header.Machine,
				machineName: describeImage(unwrap(doc.peFile.headers())).machine,
			},
		}
	}
	const functions = unwrap(doc.peFile.exceptionsX64())
	if (functions === null) throw new Error('The directory is unavailable.')
	return { data: { supported: true, functions, state: reactive({ query: '', sort: undefined }) } }
}
</script>

<script setup lang="ts">
import X64ExceptionTable from './exceptions/X64ExceptionTable.vue'
import { hex } from '@/lib/format'

defineProps<{ data: ExceptionsData }>()
</script>

<template>
	<X64ExceptionTable v-if="data.supported" :functions="data.functions" :state="data.state" />
	<ViewPage
		v-else
		title="Exceptions"
		description="The exception directory lists the code ranges that have unwind data for structured exception handling."
	>
		<EmptyState title="Exception entries are not supported for this machine">
			This view reads the x64 runtime function table. This file is for
			<span translate="no">{{ data.machineName }}</span>
			(machine type <span class="num font-mono text-data" translate="no">{{ hex(data.machine, 4) }}</span>).
		</EmptyState>
	</ViewPage>
</template>
