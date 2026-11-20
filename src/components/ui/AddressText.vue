<script setup lang="ts">
import { hex } from '@/lib/format'
import type { AddressKind } from '@/pe/view'
import { useWorkspace } from '@/pe/view'

/**
 * An address outside a table, shown as a button that opens the address menu
 * (Hex Dump, Disassembly). In a DataTable, set the column's `kind` instead.
 */
const props = defineProps<{
	kind: AddressKind
	value: number | bigint
	/** Zero-pad to this many hex digits. */
	digits?: number
}>()

const workspace = useWorkspace()

const text = computed(() => hex(props.value, props.digits))

function open(event: MouseEvent) {
	workspace.showAddressMenu(event.currentTarget as HTMLElement, { kind: props.kind, value: props.value })
}
</script>

<template>
	<button
		type="button"
		class="num -mx-1 cursor-pointer rounded-sm px-1 font-mono text-data text-accent underline decoration-accent-border decoration-dotted underline-offset-4 hover:bg-hover hover:decoration-solid"
		:data-kind="kind"
		translate="no"
		@click="open"
	>
		{{ text }}
	</button>
</template>
