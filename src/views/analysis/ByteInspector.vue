<script setup lang="ts">
import { Field, FieldLabel } from '@ui-sdk/vue/field'
import {
	SegmentedControl,
	SegmentedControlIndicator,
	SegmentedControlItem,
} from '@ui-sdk/vue/segmented-control'
import type { PeDocument } from '@/pe/document'
import type { DisassembledInstruction } from '@/vendor/pelite/pelite.js'
import type { HexDumpState } from '../HexDumpView.vue'

/** The byte under the hex dump caret read as each integer and float type, and as an instruction. */
const props = defineProps<{
	doc: PeDocument
	state: HexDumpState
	backed: (offset: number) => boolean
}>()

const root = useTemplateRef<HTMLElement>('root')
const titleId = useId()

const cursorRva = computed(() => props.state.window.start + props.state.cursor)

const instruction = computed((): DisassembledInstruction | Error | undefined => {
	const offset = props.state.cursor
	const window = props.state.window
	if (!props.backed(offset)) return new Error('No file-backed instruction bytes.')
	const result = props.doc.peFile.disasm(window.start + offset)
	if (result instanceof Error) return result
	const first = result[0]
	if (
		first &&
		(offset + first.bytes.length > window.bytes.length ||
			first.bytes.some((_, index) => !props.backed(offset + index)))
	) {
		return new Error('Instruction crosses zero-fill or the window boundary.')
	}
	return first
})

const instructionText = computed(() => {
	const value = instruction.value
	return value instanceof Error || !value || value.instruction === '(bad)' ? '-' : value.instruction
})

const values = computed(() => {
	const bytes = props.state.window.bytes
	const offset = props.state.cursor
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	const types: [string, number, () => number | bigint][] = [
		['i8', 1, () => view.getInt8(offset)],
		['u8', 1, () => view.getUint8(offset)],
		['i16', 2, () => view.getInt16(offset, true)],
		['u16', 2, () => view.getUint16(offset, true)],
		['i32', 4, () => view.getInt32(offset, true)],
		['u32', 4, () => view.getUint32(offset, true)],
		['i64', 8, () => view.getBigInt64(offset, true)],
		['u64', 8, () => view.getBigUint64(offset, true)],
		['f32', 4, () => view.getFloat32(offset, true)],
		['f64', 8, () => view.getFloat64(offset, true)],
	]
	return types.map(([type, size, read]) => {
		const available =
			offset + size <= bytes.length &&
			Array.from({ length: size }, (_, i) => props.backed(offset + i)).every(Boolean)
		if (!available) return { type, value: '-' }
		const value = read()
		if (props.state.format === 'decimal' || type.startsWith('f')) {
			return { type, value: Object.is(value, -0) ? '-0' : String(value) }
		}
		return { type, value: value < 0 ? `-0x${(-value).toString(16)}` : `0x${value.toString(16)}` }
	})
})

const format = computed({
	get: () => props.state.format,
	set: (value: string | null) => {
		if (value === 'decimal' || value === 'hex') props.state.format = value
	},
})

/** Brings the inspector into view in narrow panels, where it sits above the dump. */
function reveal() {
	root.value?.scrollIntoView({ block: 'start', inline: 'nearest' })
	root.value?.focus({ preventScroll: true })
}

defineExpose({ reveal })
</script>

<template>
	<!-- The title bar has the height and ground of the dump's column header, so the two read as one row. -->
	<section
		ref="root"
		class="flex min-w-0 flex-col focus-visible:-outline-offset-2"
		:aria-labelledby="titleId"
		tabindex="-1"
	>
		<div class="flex h-8 items-center gap-2 border-b border-default bg-surface px-3">
			<h3 :id="titleId" class="text-caption font-medium text-secondary">Byte at</h3>
			<AddressText kind="rva" :value="cursorRva" :digits="8" />
		</div>
		<Field class="flex-row items-center justify-between gap-3 px-3 pt-3 pb-2">
			<FieldLabel>Format</FieldLabel>
			<SegmentedControl v-model:value="format">
				<SegmentedControlIndicator />
				<SegmentedControlItem value="decimal">Decimal</SegmentedControlItem>
				<SegmentedControlItem value="hex">Hex</SegmentedControlItem>
			</SegmentedControl>
		</Field>
		<!--
			Above the dump, two columns pair each signed type with its unsigned twin and halve the
			height. They start where a 20-digit u64 still fits on one line.
		-->
		<dl class="grid grid-cols-1 gap-x-6 px-3 @md:grid-cols-2 @5xl:grid-cols-1">
			<div
				v-for="item in values"
				:key="item.type"
				class="grid min-h-7 grid-cols-[3ch_minmax(0,1fr)] items-baseline gap-3 border-b border-subtle py-1"
			>
				<dt class="font-mono text-data text-secondary" translate="no">{{ item.type }}</dt>
				<dd class="num font-mono text-data wrap-anywhere text-primary" translate="no">{{ item.value }}</dd>
			</div>
		</dl>
		<div class="flex flex-col gap-1 px-3 pt-3">
			<h3 class="font-medium text-primary">Instruction</h3>
			<p class="font-mono text-data wrap-anywhere text-primary" translate="no">{{ instructionText }}</p>
		</div>
	</section>
</template>
