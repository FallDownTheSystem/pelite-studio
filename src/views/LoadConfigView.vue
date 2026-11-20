<script lang="ts">
import { computed } from 'vue'
import type { PeDocument } from '@/pe/document'
import type { ViewContent } from '@/pe/view'
import { unwrap } from '@/pe/pelite'
import { byteCount, count, hexOrZero, timestamp } from '@/lib/format'
import { addressKind, formatFieldValue, type FieldRow } from './headers/fields'
import { guardFlagNames, guardTableStride } from './headers/flags'

export interface LoadConfigData {
	rows: FieldRow[]
	/** The value stored at the SecurityCookie address, as text. */
	securityCookie: string
	handlers: number[] | null
	handlerTable: number
	size: number
}

const addressFields = new Set([
	'LockPrefixTable',
	'EditList',
	'SecurityCookie',
	'SEHandlerTable',
	'GuardCFCheckFunctionPointer',
	'GuardCFDispatchFunctionPointer',
	'GuardCFFunctionTable',
	'GuardAddressTakenIatEntryTable',
	'GuardLongJumpTargetTable',
	'DynamicValueRelocTable',
	'CHPEMetadataPointer',
	'GuardRFFailureRoutine',
	'GuardRFFailureRoutineFunctionPointer',
	'GuardRFVerifyStackPointerFunctionPointer',
	'EnclaveConfigurationPointer',
	'VolatileMetadataPointer',
	'GuardEHContinuationTable',
	'GuardXFGCheckFunctionPointer',
	'GuardXFGDispatchFunctionPointer',
	'GuardXFGTableDispatchFunctionPointer',
	'CastGuardOsDeterminedFailureMode',
	'GuardMemcpyFunctionPointer',
	'UmaFunctionPointers',
])

const countFields: Record<string, [string, string]> = {
	SEHandlerCount: ['SE handler', 'SE handlers'],
	GuardCFFunctionCount: ['function', 'functions'],
	GuardAddressTakenIatEntryCount: ['IAT entry', 'IAT entries'],
	GuardLongJumpTargetCount: ['target', 'targets'],
	GuardEHContinuationCount: ['continuation target', 'continuation targets'],
}

function describe(field: string, value: unknown): Omit<FieldRow, 'field' | 'value'> | undefined {
	const number = typeof value === 'number' ? value : 0
	if (addressFields.has(field))
		return { kind: addressKind('va', value), meaning: number ? undefined : 'Not set' }
	const counted = countFields[field]
	if (counted) return { meaning: `${count(number)} ${number === 1 ? counted[0] : counted[1]}` }
	switch (field) {
		case 'Size':
			return { meaning: byteCount(number) }
		case 'TimeDateStamp':
			return { meaning: number ? timestamp(number) : 'Not set' }
		case 'GuardFlags': {
			const stride = guardTableStride(number)
			return {
				flags: guardFlagNames(number),
				meaning: stride
					? `CF table entries carry ${byteCount(stride)} of metadata after each RVA`
					: undefined,
			}
		}
	}
	return undefined
}

export function prepare(doc: PeDocument): ViewContent<LoadConfigData> {
	const config = unwrap(doc.peFile.loadConfig())
	if (config === null) throw new Error('This file has no load configuration directory.')
	const rows = Object.entries(config.image).flatMap(([field, value]): FieldRow[] =>
		value !== null && typeof value === 'object'
			? Object.entries(value).map(([member, memberValue]) => ({
					field: `${field}.${member}`,
					value: formatFieldValue(memberValue),
				}))
			: [{ field, value: formatFieldValue(value), ...describe(field, value) }],
	)
	return {
		data: {
			rows,
			securityCookie: config.security_cookie === null ? '' : hexOrZero(config.security_cookie),
			handlers: config.se_handler_table,
			handlerTable: config.image.SEHandlerTable,
			size: config.size,
		},
	}
}
</script>

<script setup lang="ts">
import { defineColumns } from '@/components/ui/table'
import { hex } from '@/lib/format'
import FieldTable from './headers/FieldTable.vue'

const props = defineProps<{ data: LoadConfigData }>()

interface HandlerRow {
	number: number
	rva: number
}

const handlers = computed(() => (props.data.handlers ?? []).map((rva, index) => ({ number: index + 1, rva })))
const long = computed(() => handlers.value.length > 50)
const sizeMeta = computed(() => byteCount(props.data.size))
const handlerMeta = computed(() => {
	const total = handlers.value.length
	return total ? `${count(total)} ${total === 1 ? 'handler' : 'handlers'}` : undefined
})
const tableHeight = computed(() => `min(${handlers.value.length * 28 + 34}px, 32rem)`)

const handlerColumns = defineColumns<HandlerRow>([
	{
		key: 'number',
		title: '#',
		width: '4rem',
		align: 'end',
		mono: true,
		muted: true,
		value: (row) => row.number,
	},
	{ key: 'rva', title: 'Handler RVA', mono: true, kind: 'rva', value: (row) => hex(row.rva) },
])
</script>

<template>
	<ViewPage
		title="Load configuration"
		description="IMAGE_LOAD_CONFIG_DIRECTORY: settings the loader applies at startup, such as the security cookie, safe exception handlers and Control Flow Guard tables."
	>
		<ViewSection
			title="Fields"
			:meta="sizeMeta"
			description="Fields past the structure size this file declares are not in the file. They read as zero."
			flush
		>
			<FieldTable :rows="data.rows" label="Load configuration fields" />
		</ViewSection>
		<ViewSection
			title="Security cookie"
			description="The initial value stored at the SecurityCookie address. It is replaced with a random value at startup."
		>
			<p v-if="data.securityCookie" class="num font-mono text-data" translate="no">
				{{ data.securityCookie }}
			</p>
			<p v-else class="text-secondary">Unavailable: the cookie value could not be read from the file.</p>
		</ViewSection>
		<ViewSection
			title="SE handlers"
			:meta="handlerMeta"
			description="Safe structured exception handlers. Only 32-bit images use this table."
			flush
		>
			<!-- One narrow column reads badly stretched across a wide panel. -->
			<div
				v-if="handlers.length"
				class="max-w-sm"
				:class="long ? 'h-(--h)' : ''"
				:style="long ? { '--h': tableHeight } : undefined"
			>
				<DataTable
					:rows="handlers"
					:columns="handlerColumns"
					label="SE handlers"
					:row-key="(row) => row.number"
					:fill="long"
				/>
			</div>
			<p v-else class="px-4 text-secondary @2xl:px-6">
				{{
					data.handlers === null && data.handlerTable
						? 'The SE handler table is unavailable: its address is not in the file.'
						: 'No SE handlers in this file.'
				}}
			</p>
		</ViewSection>
	</ViewPage>
</template>
