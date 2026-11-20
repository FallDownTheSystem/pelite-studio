<script setup lang="ts">
import { Button } from '@ui-sdk/vue/button'
import { defineColumns, type SortState } from '@/components/ui/table'
import { count, hex } from '@/lib/format'
import { parseAddress } from '@/pe/address'
import type { PeRuntimeFunction } from '@/vendor/pelite/pelite.js'

const props = defineProps<{
	functions: PeRuntimeFunction[]
	state: { query: string; sort: SortState | undefined }
}>()

const unwindFlags = [
	{ bit: 0x1, name: 'EHANDLER', title: 'Exception handlers' },
	{ bit: 0x2, name: 'UHANDLER', title: 'Termination handlers' },
	{ bit: 0x4, name: 'CHAININFO', title: 'Chained unwind entries' },
] as const

const registers = [
	'RAX',
	'RCX',
	'RDX',
	'RBX',
	'RSP',
	'RBP',
	'RSI',
	'RDI',
	'R8',
	'R9',
	'R10',
	'R11',
	'R12',
	'R13',
	'R14',
	'R15',
]

function size(row: PeRuntimeFunction): number {
	return row.image.EndAddress - row.image.BeginAddress
}

/** A number is also looked up as an address inside a function, which finds the function around a crash RVA. */
const rows = computed(() => {
	const text = props.state.query.trim().toLowerCase()
	if (!text) return props.functions
	const parsed = parseAddress(text)
	const address = parsed !== null && parsed <= 0xffffffffn ? Number(parsed) : undefined
	return props.functions.filter(({ image }) => {
		if (address !== undefined && address >= image.BeginAddress && address < image.EndAddress) return true
		return [image.BeginAddress, image.EndAddress, image.UnwindData].some((value) => hex(value).includes(text))
	})
})

/**
 * The flags column fits the widest set of tags in this file: per tag its name in mono
 * (0.45rem per character), 0.75rem of tag padding and 0.25rem of gap; plus 1.5rem of cell padding.
 */
const flagsWidth = props.functions.reduce((widest, row) => {
	const flags = row.unwind_info?.flags ?? 0
	const width = unwindFlags
		.filter((flag) => flags & flag.bit)
		.reduce((sum, flag) => sum + flag.name.length * 0.45 + 1, 1.5)
	return Math.max(widest, width)
}, 6.5)

// Short fixed columns first and the free-text frame register last, so it takes the remaining
// width and no gap opens inside the row.
const columns = defineColumns<PeRuntimeFunction>([
	{
		key: 'begin',
		title: 'Begin',
		width: '7rem',
		mono: true,
		kind: 'rva',
		value: (row) => hex(row.image.BeginAddress),
		sortValue: (row) => row.image.BeginAddress,
	},
	{
		key: 'end',
		title: 'End',
		width: '7rem',
		mono: true,
		kind: 'rva',
		value: (row) => hex(row.image.EndAddress),
		sortValue: (row) => row.image.EndAddress,
	},
	{
		key: 'size',
		title: 'Size',
		width: '6.5rem',
		align: 'end',
		mono: true,
		value: (row) => count(size(row)),
		sortValue: size,
	},
	{
		key: 'unwind',
		title: 'Unwind info',
		width: '7rem',
		mono: true,
		kind: 'rva',
		value: (row) => hex(row.image.UnwindData),
		sortValue: (row) => row.image.UnwindData,
	},
	{
		key: 'flags',
		title: 'Flags',
		width: `${flagsWidth}rem`,
		value: (row) =>
			row.unwind_info
				? unwindFlags
						.filter((flag) => row.unwind_info!.flags & flag.bit)
						.map((flag) => flag.name)
						.join(', ')
				: null,
	},
	{
		key: 'prolog',
		title: 'Prolog',
		width: '5rem',
		align: 'end',
		mono: true,
		value: (row) => row.unwind_info?.size_of_prolog,
		sortValue: (row) => row.unwind_info?.size_of_prolog,
	},
	{
		key: 'codes',
		title: 'Unwind codes',
		width: '7rem',
		align: 'end',
		mono: true,
		value: (row) => row.unwind_info?.unwind_codes.length,
		sortValue: (row) => row.unwind_info?.unwind_codes.length,
	},
	{
		key: 'version',
		title: 'Version',
		width: '5rem',
		align: 'end',
		mono: true,
		value: (row) => row.unwind_info?.version,
	},
	{
		key: 'frame',
		title: 'Frame register',
		minWidth: '9rem',
		mono: true,
		value: (row) => {
			const info = row.unwind_info
			if (!info?.frame_register) return null
			return `${registers[info.frame_register] ?? info.frame_register} + ${hex(info.frame_offset * 16)}`
		},
	},
])

const total = props.functions.length
const status = computed(() =>
	props.state.query.trim()
		? `${count(rows.value.length)} of ${count(total)} runtime functions`
		: `${count(total)} runtime ${total === 1 ? 'function' : 'functions'}`,
)

const flagTotals = computed(() =>
	unwindFlags.map((flag) => ({
		...flag,
		count: props.functions.filter((row) => (row.unwind_info?.flags ?? 0) & flag.bit).length,
	})),
)
const unreadable = props.functions.filter((row) => !row.unwind_info).length
</script>

<template>
	<ViewPage
		fill
		title="Exceptions"
		description="The x64 runtime function table: each code range and the unwind data the system uses to walk the stack during exception handling."
	>
		<!-- The facts belong to the heading; the filter sits last, next to the table it narrows. -->
		<template v-if="total" #toolbar>
			<dl class="flex min-w-0 basis-full flex-wrap items-start gap-x-6 gap-y-2 pt-1 pb-1">
				<div v-for="flag in flagTotals" :key="flag.bit" class="min-w-0">
					<dt class="text-caption text-secondary">{{ flag.title }}</dt>
					<dd class="num font-mono text-data">{{ count(flag.count) }}</dd>
				</div>
				<div v-if="unreadable" class="min-w-0">
					<dt class="text-caption text-secondary">Unreadable unwind info</dt>
					<dd class="num font-mono text-data text-warning">{{ count(unreadable) }}</dd>
				</div>
			</dl>
			<FilterInput v-model="state.query" label="Filter runtime functions" placeholder="0x1a2f0" />
			<p class="num pb-1 text-caption text-secondary" role="status">{{ status }}</p>
		</template>

		<EmptyState v-if="!total" title="No runtime functions in this file">
			The exception directory is present but holds no entries.
		</EmptyState>
		<template v-else>
			<div class="min-h-0 flex-1">
				<DataTable v-model:sort="state.sort" fill :rows="rows" :columns="columns" label="Runtime functions">
					<template #cell-flags="{ row }">
						<span v-if="row.unwind_info" class="inline-flex gap-1">
							<template v-for="flag in unwindFlags" :key="flag.bit">
								<Tag v-if="row.unwind_info.flags & flag.bit" mono>{{ flag.name }}</Tag>
							</template>
							<span v-if="!(row.unwind_info.flags & 0x7)" class="text-secondary">None</span>
						</span>
						<Tag v-else tone="warning">Unreadable</Tag>
					</template>
					<template #empty>
						<EmptyState :title="`No runtime functions match '${state.query.trim()}'`">
							The filter looks for part of an address, or for the function that contains an RVA.
							<template #actions>
								<Button data-size="sm" @click="state.query = ''">Clear filter</Button>
							</template>
						</EmptyState>
					</template>
				</DataTable>
			</div>
		</template>
	</ViewPage>
</template>
