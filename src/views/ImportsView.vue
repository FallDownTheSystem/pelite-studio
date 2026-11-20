<script lang="ts">
import type { PeDocument } from '@/pe/document'
import type { ViewContent } from '@/pe/view'
import { unwrap } from '@/pe/pelite'
import type { SortState } from '@/components/ui/table'
import type { PeImportDescriptor, PeImportEntry } from '@/vendor/pelite/pelite.js'

export interface ImportRow {
	/** Stable across filtering and sorting: library index and entry index. */
	id: string
	library: number
	entry: PeImportEntry
}

export interface ImportsData {
	descriptors: PeImportDescriptor[]
	rows: ImportRow[]
	state: { query: string; library: string | number | undefined; sort: SortState | undefined }
}

export function prepare(doc: PeDocument): ViewContent<ImportsData> {
	const descriptors = unwrap(doc.peFile.imports())
	if (descriptors === null) throw new Error('The import directory is unavailable.')
	const rows = descriptors.flatMap((descriptor, library) =>
		(descriptor.imports ?? []).map((entry, index) => ({ id: `${library}:${index}`, library, entry })),
	)
	return {
		data: {
			descriptors,
			rows,
			state: reactive({ query: '', library: 'all', sort: undefined }),
		},
	}
}
</script>

<script setup lang="ts">
import { Button } from '@ui-sdk/vue/button'
import { defineColumns, monoWidth } from '@/components/ui/table'
import { count, hex, hexOrZero, timestamp } from '@/lib/format'

const props = defineProps<{ data: ImportsData }>()
const state = props.data.state
const descriptors = props.data.descriptors

function libraryName(index: number): string {
	return descriptors[index]?.dll_name ?? 'DLL name unavailable'
}

function symbolName(entry: PeImportEntry): string | null {
	return entry.import?.ByName?.name ?? null
}

const query = computed(() => state.query.trim().toLowerCase())

/** Libraries whose name matches keep all their functions, as a library search would expect. */
const matchingLibraries = computed(() => {
	const text = query.value
	return new Set(
		descriptors.flatMap((descriptor, index) =>
			text && (descriptor.dll_name ?? '').toLowerCase().includes(text) ? [index] : [],
		),
	)
})

const matches = computed(() => {
	const text = query.value
	if (!text) return props.data.rows
	return props.data.rows.filter((row) => {
		if (matchingLibraries.value.has(row.library)) return true
		const symbol = row.entry.import
		return [
			symbol?.ByName?.name ?? '',
			hex(row.entry.address),
			String(symbol?.ByName?.hint ?? ''),
			String(symbol?.ByOrdinal?.ord ?? ''),
		].some((value) => value.toLowerCase().includes(text))
	})
})

const matchCounts = computed(() => {
	const counts = new Map<number, number>()
	for (const row of matches.value) counts.set(row.library, (counts.get(row.library) ?? 0) + 1)
	return counts
})

interface LibraryRow {
	key: 'all' | number
	count: number
}

const libraryRows = computed<LibraryRow[]>(() => {
	const filtering = !!query.value
	const libraries = descriptors.flatMap((_, index): LibraryRow[] => {
		const matched = matchCounts.value.get(index) ?? 0
		const keep = !filtering || matched > 0 || matchingLibraries.value.has(index) || state.library === index
		return keep ? [{ key: index, count: matched }] : []
	})
	return [{ key: 'all', count: matches.value.length }, ...libraries]
})

const libraryColumns = defineColumns<LibraryRow>([
	{
		key: 'library',
		title: 'Library',
		minWidth: '8rem',
		value: (row) => (row.key === 'all' ? 'All libraries' : libraryName(row.key)),
	},
	{
		key: 'count',
		title: 'Functions',
		width: '6rem',
		align: 'end',
		mono: true,
		value: (row) => count(row.count),
	},
])

const selectedLibrary = computed(() => (typeof state.library === 'number' ? state.library : undefined))
const selectedDescriptor = computed(() =>
	selectedLibrary.value === undefined ? undefined : descriptors[selectedLibrary.value],
)

const functionRows = computed(() =>
	selectedLibrary.value === undefined
		? matches.value
		: matches.value.filter((row) => row.library === selectedLibrary.value),
)

const functionBox = useTemplateRef<HTMLElement>('functionBox')
const { width: functionBoxWidth } = useElementSize(functionBox)
const remPixels = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

const longestLibrary = descriptors.reduce(
	(longest, _, index) => Math.max(longest, libraryName(index).length),
	0,
)
const longestSymbol = props.data.rows.reduce(
	(longest, row) => Math.max(longest, symbolName(row.entry)?.length ?? 0),
	0,
)

/**
 * The library list is wide enough for its longest name (API set names reach 45 characters)
 * plus the count column, edge padding and scrollbar, so names do not truncate; at most 40%
 * of the view keeps room for the functions.
 */
const libraryPaneWidth = `${Math.max(20, longestLibrary * 0.45 + 9.5)}rem`

/**
 * The library and name columns are as wide as their longest values, so the numbers sit beside
 * the names instead of across a wide panel; they give way when the panel is narrow.
 */
const functionWidths = computed(() => {
	const panel = functionBoxWidth.value / remPixels
	// Ordinal, hint and the smallest IAT RVA column.
	const numbers = 5.5 + 5.5 + 7
	const library = selectedLibrary.value === undefined ? monoWidth(longestLibrary, panel / 3, 10) : 0
	return { library: `${library}rem`, name: `${monoWidth(longestSymbol, panel - numbers - library, 12)}rem` }
})

// The last column takes the remaining width, so there is never a gap inside the row.
const functionColumns = computed(() =>
	defineColumns<ImportRow>([
		...(selectedLibrary.value === undefined
			? [
					{
						key: 'library',
						title: 'Library',
						width: functionWidths.value.library,
						mono: true,
						value: (row: ImportRow) => libraryName(row.library),
						sortValue: (row: ImportRow) => libraryName(row.library),
					},
				]
			: []),
		{
			key: 'name',
			title: 'Name',
			width: functionWidths.value.name,
			mono: true,
			value: (row) => symbolName(row.entry),
			sortValue: (row) => symbolName(row.entry),
		},
		{
			key: 'ordinal',
			title: 'Ordinal',
			width: '5.5rem',
			align: 'end',
			mono: true,
			value: (row) => row.entry.import?.ByOrdinal?.ord,
			sortValue: (row) => row.entry.import?.ByOrdinal?.ord,
		},
		{
			key: 'hint',
			title: 'Hint',
			width: '5.5rem',
			align: 'end',
			mono: true,
			value: (row) => row.entry.import?.ByName?.hint,
			sortValue: (row) => row.entry.import?.ByName?.hint,
		},
		{
			key: 'iat',
			title: 'IAT RVA',
			minWidth: '7rem',
			mono: true,
			kind: 'rva',
			value: (row) => hex(row.entry.address),
			sortValue: (row) => row.entry.address,
		},
	]),
)

function importTimestamp(seconds: number): string {
	if (seconds === 0) return 'Not bound'
	if (seconds === 0xffffffff) return 'Bound (see the bound import directory)'
	return `Bound at ${timestamp(seconds)}`
}

const total = props.data.rows.length
const status = computed(() =>
	query.value
		? `${count(matches.value.length)} of ${count(total)} imports`
		: `${count(total)} ${total === 1 ? 'import' : 'imports'} from ${count(descriptors.length)} ${descriptors.length === 1 ? 'library' : 'libraries'}`,
)

const emptyText = computed(() => {
	if (query.value) return undefined
	const descriptor = selectedDescriptor.value
	if (descriptor?.imports === null) return 'The import lookup table of this library could not be parsed.'
	return 'This library lists no imported functions.'
})
</script>

<template>
	<ViewPage
		fill
		title="Imports"
		description="Functions this image needs from other modules, resolved by the loader through the import address table (IAT)."
	>
		<template v-if="descriptors.length" #toolbar>
			<FilterInput v-model="state.query" label="Filter imports" placeholder="CreateFileW" />
			<p class="num pb-1 text-caption text-secondary" role="status">{{ status }}</p>
		</template>

		<EmptyState v-if="!descriptors.length" title="No imports in this file">
			The import directory is present but lists no libraries.
		</EmptyState>
		<div v-else class="flex min-h-0 flex-1 flex-col @2xl:flex-row">
			<div
				class="h-48 shrink-0 border-b border-subtle @2xl:h-auto @2xl:w-[min(var(--library-pane),40%)] @2xl:border-e @2xl:border-b-0"
				:style="{ '--library-pane': libraryPaneWidth }"
			>
				<DataTable
					v-model:selected="state.library"
					fill
					:rows="libraryRows"
					:columns="libraryColumns"
					:row-key="(row) => row.key"
					label="Libraries"
				>
					<template #cell-library="{ row, value }">
						<span v-if="row.key === 'all'" class="font-medium">{{ value }}</span>
						<span
							v-else
							class="font-mono text-data"
							:class="descriptors[row.key]?.dll_name ? '' : 'text-secondary'"
							>{{ value }}</span
						>
					</template>
					<template #cell-count="{ row, value }">
						<Tag v-if="row.key !== 'all' && descriptors[row.key]?.imports === null" tone="warning"
							>Unreadable</Tag
						>
						<template v-else>{{ value }}</template>
					</template>
				</DataTable>
			</div>

			<div class="flex min-h-0 min-w-0 flex-1 flex-col">
				<dl
					v-if="selectedDescriptor"
					class="flex shrink-0 flex-wrap items-start gap-x-6 gap-y-2 border-b border-subtle px-4 py-3 @2xl:px-6"
					:aria-label="`Import descriptor of ${libraryName(selectedLibrary!)}`"
				>
					<div class="min-w-0">
						<dt class="text-caption text-secondary">Lookup table (OriginalFirstThunk)</dt>
						<dd>
							<AddressText
								v-if="selectedDescriptor.image.OriginalFirstThunk"
								kind="rva"
								:value="selectedDescriptor.image.OriginalFirstThunk"
							/>
							<span v-else class="num font-mono text-data">0</span>
						</dd>
					</div>
					<div class="min-w-0">
						<dt class="text-caption text-secondary">Address table (FirstThunk)</dt>
						<dd>
							<AddressText
								v-if="selectedDescriptor.image.FirstThunk"
								kind="rva"
								:value="selectedDescriptor.image.FirstThunk"
							/>
							<span v-else class="num font-mono text-data">0</span>
						</dd>
					</div>
					<div class="min-w-0">
						<dt class="text-caption text-secondary">Name</dt>
						<dd>
							<AddressText
								v-if="selectedDescriptor.image.Name"
								kind="rva"
								:value="selectedDescriptor.image.Name"
							/>
							<span v-else class="num font-mono text-data">0</span>
						</dd>
					</div>
					<div class="min-w-0">
						<dt class="text-caption text-secondary">TimeDateStamp</dt>
						<dd>
							<span class="num font-mono text-data">{{
								hexOrZero(selectedDescriptor.image.TimeDateStamp)
							}}</span>
							<span class="ms-2 text-secondary">{{
								importTimestamp(selectedDescriptor.image.TimeDateStamp)
							}}</span>
						</dd>
					</div>
					<div class="min-w-0">
						<dt class="text-caption text-secondary">ForwarderChain</dt>
						<dd class="num font-mono text-data">{{ hexOrZero(selectedDescriptor.image.ForwarderChain) }}</dd>
					</div>
				</dl>

				<div ref="functionBox" class="min-h-0 flex-1">
					<DataTable
						v-model:sort="state.sort"
						fill
						:rows="functionRows"
						:columns="functionColumns"
						:row-key="(row) => row.id"
						:label="
							selectedDescriptor
								? `Imports from ${libraryName(selectedLibrary!)}`
								: 'Imports from all libraries'
						"
					>
						<template #cell-name="{ row, value }">
							<template v-if="value">{{ value }}</template>
							<Tag v-else-if="row.entry.import?.ByOrdinal">By ordinal</Tag>
							<Tag v-else tone="warning">Unreadable</Tag>
						</template>
						<template #empty>
							<EmptyState v-if="query" :title="`No imports match '${state.query.trim()}'`">
								The filter looks for part of a function or library name, a hint, an ordinal or an IAT RVA.
								<template #actions>
									<Button data-size="sm" @click="state.query = ''">Clear filter</Button>
								</template>
							</EmptyState>
							<EmptyState v-else title="No imported functions">{{ emptyText }}</EmptyState>
						</template>
					</DataTable>
				</div>
			</div>
		</div>
	</ViewPage>
</template>
