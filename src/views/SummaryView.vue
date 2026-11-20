<script lang="ts">
import type { PeDocument } from '@/pe/document'
import type { ViewContent } from '@/pe/view'
import { summarize, type SummaryData } from './summary/analysis'

export type { SummaryData }

export function prepare(doc: PeDocument): ViewContent<SummaryData> {
	return { data: summarize(doc) }
}
</script>

<script setup lang="ts">
import { Button } from '@ui-sdk/vue/button'
import { Meter, MeterIndicator, MeterTrack } from '@ui-sdk/vue/meter'
import { byteCount, byteSize, count, hex, hexOrZero } from '@/lib/format'
import { useWorkspace } from '@/pe/view'
import { defineColumns } from '@/components/ui/table'
import type { SummarySection } from './summary/analysis'
import SectionLayout from './summary/SectionLayout.vue'

const props = defineProps<{ data: SummaryData }>()

const { openView } = useWorkspace()

const optional = computed(() => props.data.headers.NtHeaders.OptionalHeader)

const warnings = computed(() => props.data.findings.filter((finding) => finding.level === 'warning').length)

/** Warnings lead, so the reader meets what most needs a look first; the order within a level is kept. */
const orderedFindings = computed(() => [
	...props.data.findings.filter((finding) => finding.level === 'warning'),
	...props.data.findings.filter((finding) => finding.level !== 'warning'),
])
const findingsMeta = computed(() => {
	const total = props.data.findings.length
	const notes = total - warnings.value
	return [
		warnings.value && `${count(warnings.value)} ${warnings.value === 1 ? 'warning' : 'warnings'}`,
		notes && `${count(notes)} ${notes === 1 ? 'note' : 'notes'}`,
	]
		.filter(Boolean)
		.join(', ')
})

/** PE timestamps of 0 and 0xffffffff are placeholders, and reproducible builds store a hash here. */
const timestampText = computed(() => {
	const value = props.data.timestamp
	if (value === 0 || value === 0xffffffff) return 'Unspecified'
	return new Date(value * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC')
})

const hashes = computed(() => [
	{ key: 'md5', label: 'MD5', value: props.data.hashes.md5 },
	{ key: 'sha256', label: 'SHA-256', value: props.data.hashes.sha256 },
	{ key: 'imphash', label: 'Import hash', value: props.data.hashes.imphash },
])

/** Label beside value in a narrow panel, label above value once the grid has columns. */
const fieldClass =
	'grid min-w-0 grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-x-3 @md:flex @md:flex-col @md:items-stretch @md:gap-0.5'

const certificateBytes = computed(() => props.data.overlay.size - props.data.overlay.outsideCertificate)

function permissions(section: SummarySection): string {
	return `${section.read ? 'R' : '-'}${section.write ? 'W' : '-'}${section.execute ? 'X' : '-'}`
}

function permissionWords(section: SummarySection): string {
	const words = [section.read && 'read', section.write && 'write', section.execute && 'execute'].filter(
		Boolean,
	)
	return words.length ? words.join(', ') : 'no access'
}

const entropyFormat = { minimumFractionDigits: 2, maximumFractionDigits: 2 }

function entropyLabel(_value: number, details: { formatted: string }): string {
	return `${details.formatted} of 8 bits per byte`
}

function sampleRange(samples: number[]): string {
	return `${Math.min(...samples).toFixed(2)} to ${Math.max(...samples).toFixed(2)}`
}

/**
 * Widths keep the columns together on a wide panel; the distribution takes what is left.
 * The entry point is marked beside the section name rather than in a column of its own,
 * which would be empty in every row but one.
 */
const sectionColumns = defineColumns<SummarySection>([
	{ key: 'name', title: 'Name', width: '10rem', mono: true, value: (row) => row.name },
	{
		key: 'rva',
		title: 'RVA',
		width: '7rem',
		mono: true,
		kind: 'rva',
		value: (row) => hexOrZero(row.header.VirtualAddress),
	},
	{
		key: 'virtual',
		title: 'Virtual size',
		width: '7rem',
		mono: true,
		align: 'end',
		value: (row) => hexOrZero(row.header.VirtualSize),
	},
	{
		key: 'raw',
		title: 'Raw size',
		width: '7rem',
		mono: true,
		align: 'end',
		value: (row) => hexOrZero(row.header.SizeOfRawData),
	},
	{ key: 'access', title: 'Access', width: '5rem', value: permissions },
	{ key: 'entropy', title: 'Entropy', width: '11rem', value: (row) => row.entropy?.toFixed(2) },
	{
		key: 'samples',
		title: 'Distribution',
		value: (row) => (row.samples.length ? sampleRange(row.samples) : null),
	},
])

const importsMeta = computed(
	() =>
		`${count(props.data.imports.functions)} functions from ${count(props.data.imports.libraries)} libraries`,
)

const libraryColumns = defineColumns<{ name: string; functions: number }>([
	{ key: 'name', title: 'Library', mono: true, value: (row) => row.name, sortValue: (row) => row.name },
	{
		key: 'functions',
		title: 'Functions',
		width: '7rem',
		mono: true,
		align: 'end',
		value: (row) => count(row.functions),
		sortValue: (row) => row.functions,
	},
])

/**
 * A scroll box inside the scrolling page traps the wheel, so the library table grows with the page.
 * Only a list long enough to need virtualizing becomes a fill table, which needs a height: about
 * fourteen rows, with the full list one click away in Imports.
 */
const longLibraryList = computed(() => props.data.imports.byLibrary.length > 50)
const libraryHeight = `${14 * 28 + 34}px`
</script>

<template>
	<ViewPage
		title="Summary"
		description="What this file is at a glance, with the signals that deserve a closer look."
	>
		<!-- A report read line by line: past this width the eye loses the row between label and value. -->
		<div class="flex max-w-7xl min-w-0 flex-col gap-8">
			<ViewSection title="Findings" :meta="findingsMeta || undefined">
				<ul v-if="data.findings.length" class="flex flex-col gap-1" aria-label="Findings">
					<li v-for="(finding, position) in orderedFindings" :key="position">
						<Notice :tone="finding.level">
							<span class="sr-only">{{ finding.level === 'warning' ? 'Warning:' : 'Note:' }}</span>
							{{ finding.message }}
						</Notice>
					</li>
				</ul>
				<p v-else class="text-secondary">No findings from these lightweight checks.</p>
			</ViewSection>

			<ViewSection title="Identity">
				<template #actions>
					<Button data-variant="ghost" data-size="sm" @click="openView('nt')">Open NT headers</Button>
				</template>
				<dl class="grid grid-cols-1 gap-x-8 gap-y-3 @md:grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-4">
					<div :class="fieldClass">
						<dt class="text-caption text-secondary">Format</dt>
						<dd class="text-primary">{{ data.format }}</dd>
					</div>
					<div :class="fieldClass">
						<dt class="text-caption text-secondary">Machine</dt>
						<dd class="text-primary" translate="no">{{ data.machine }}</dd>
					</div>
					<div :class="fieldClass">
						<dt class="text-caption text-secondary">Type</dt>
						<dd class="text-primary">{{ data.type }}</dd>
					</div>
					<div :class="fieldClass">
						<dt class="text-caption text-secondary">Subsystem</dt>
						<dd class="text-primary" translate="no">{{ data.subsystem }}</dd>
					</div>
					<div :class="fieldClass">
						<dt class="text-caption text-secondary">Entry point</dt>
						<dd class="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-primary">
							<span v-if="data.entrySection" class="font-mono text-data" translate="no"
								>{{ data.entrySection.Name }}:</span
							>
							<AddressText kind="rva" :value="optional.AddressOfEntryPoint" />
							<span v-if="!data.entrySection" class="text-secondary">No section</span>
						</dd>
					</div>
					<div :class="fieldClass">
						<dt class="text-caption text-secondary">Image base</dt>
						<dd class="text-primary"><AddressText kind="va" :value="optional.ImageBase" /></dd>
					</div>
					<div :class="fieldClass">
						<dt class="text-caption text-secondary">File size</dt>
						<dd class="num text-primary">
							{{ byteCount(data.fileSize) }}
							<span class="text-secondary">({{ byteSize(data.fileSize) }})</span>
						</dd>
					</div>
					<div :class="fieldClass">
						<dt class="text-caption text-secondary">Image size</dt>
						<dd class="num text-primary">
							{{ byteCount(optional.SizeOfImage) }}
							<span class="text-secondary">({{ byteSize(optional.SizeOfImage) }})</span>
						</dd>
					</div>
					<div :class="fieldClass">
						<dt class="text-caption text-secondary">Timestamp (self-reported)</dt>
						<dd class="num text-primary">
							{{ timestampText }}
							<span class="font-mono text-data text-secondary" translate="no">{{
								hexOrZero(data.timestamp)
							}}</span>
						</dd>
					</div>
					<div :class="fieldClass">
						<dt class="text-caption text-secondary">Checksum</dt>
						<dd class="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-primary">
							<span class="num font-mono text-data" translate="no">{{ hexOrZero(data.checksum) }}</span>
							<span :class="data.checksumState === 'Does not match' ? 'text-warning' : 'text-secondary'">{{
								data.checksumState
							}}</span>
							<span
								v-if="data.checksumState === 'Does not match' && data.computedChecksum !== undefined"
								class="text-secondary"
							>
								(computed
								<span class="num font-mono text-data" translate="no">{{ hex(data.computedChecksum) }}</span>)
							</span>
						</dd>
					</div>
					<div :class="fieldClass">
						<dt class="text-caption text-secondary">Overlay</dt>
						<dd class="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-primary">
							<span class="num">{{ byteCount(data.overlay.size) }}</span>
							<span class="text-secondary">at file offset</span>
							<AddressText v-if="data.overlay.size > 0" kind="fo" :value="data.overlay.offset" />
							<span v-else class="num font-mono text-data" translate="no">{{
								hexOrZero(data.overlay.offset)
							}}</span>
							<span v-if="certificateBytes > 0" class="text-secondary">
								({{
									certificateBytes === data.overlay.size
										? 'all of it is the certificate table'
										: `${byteCount(certificateBytes)} of it is the certificate table`
								}})
							</span>
						</dd>
					</div>
					<div :class="fieldClass">
						<dt class="text-caption text-secondary">Certificate table</dt>
						<dd class="text-primary">{{ data.certificate ? 'Present (not validated)' : 'Not present' }}</dd>
					</div>
					<div :class="fieldClass">
						<dt class="text-caption text-secondary">CLR (.NET)</dt>
						<dd class="text-primary">{{ data.clr ? 'Present' : 'Not present' }}</dd>
					</div>
					<div :class="fieldClass">
						<dt class="text-caption text-secondary">TLS callbacks</dt>
						<dd class="num text-primary">
							{{ data.tlsCallbacks === null ? 'Unavailable' : count(data.tlsCallbacks) }}
						</dd>
					</div>
					<!-- Always label above: a path beside a label column breaks into fragments in a narrow panel. -->
					<div v-if="data.pdbPath !== undefined" class="col-span-full flex min-w-0 flex-col gap-0.5">
						<dt class="text-caption text-secondary">PDB path</dt>
						<dd v-if="data.pdbPath === null" class="text-primary">Unavailable</dd>
						<dd v-else class="flex min-w-0 items-start gap-1">
							<span class="min-w-0 py-0.5 font-mono text-data wrap-anywhere text-primary" translate="no">{{
								data.pdbPath
							}}</span>
							<CopyButton :value="data.pdbPath" label="Copy PDB path" />
						</dd>
					</div>
				</dl>
			</ViewSection>

			<ViewSection title="Hashes">
				<!-- One grid for all rows, so the values start in one column and the copy buttons stand in the next. -->
				<dl
					class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-1 gap-y-2 @md:grid-cols-[7.5rem_minmax(0,max-content)_auto] @md:gap-y-1"
				>
					<div
						v-for="hash in hashes"
						:key="hash.key"
						class="col-span-full grid grid-cols-subgrid items-start"
					>
						<dt class="col-span-full text-caption text-secondary @md:col-span-1 @md:py-1 @md:pe-2">
							{{ hash.label }}
						</dt>
						<dd class="col-span-2 grid grid-cols-subgrid items-start">
							<template v-if="hash.value">
								<span class="min-w-0 py-0.5 font-mono text-data wrap-anywhere text-primary" translate="no">{{
									hash.value
								}}</span>
								<CopyButton :value="hash.value" :label="`Copy ${hash.label}`" />
							</template>
							<span v-else class="col-span-2 py-0.5 text-secondary"
								>Unavailable, because the imports could not be fully parsed</span
							>
						</dd>
					</div>
				</dl>
			</ViewSection>

			<ViewSection
				title="Declared mitigations"
				description="Security features the image opts into through its DLL characteristics. The loader decides what it enforces."
			>
				<dl class="flex flex-wrap gap-x-6 gap-y-2">
					<div v-for="item in data.mitigations" :key="item.flag" class="flex items-center gap-2">
						<dt class="text-primary">{{ item.name }}</dt>
						<dd>
							<Tag :tone="item.enabled ? 'success' : 'neutral'">{{ item.enabled ? 'Yes' : 'No' }}</Tag>
						</dd>
					</div>
				</dl>
			</ViewSection>

			<ViewSection title="Sections" :meta="`${count(data.sections.length)} sections`">
				<template #actions>
					<Button data-variant="ghost" data-size="sm" @click="openView('sections')"
						>Open section headers</Button
					>
				</template>
				<EmptyState v-if="!data.sections.length" title="No sections in this file">
					The section table is empty, so all code and data live in the headers.
				</EmptyState>
				<div v-else class="flex flex-col gap-4">
					<SectionLayout :data="data" />
					<div class="-mx-4 @2xl:-mx-6">
						<DataTable
							:rows="data.sections"
							:columns="sectionColumns"
							label="Sections"
							:row-key="(row) => row.index"
						>
							<template #cell-name="{ row }">
								<span class="inline-flex items-center gap-2">
									<span v-if="row.name">{{ row.name }}</span>
									<template v-else>
										<span class="text-disabled" aria-hidden="true">-</span>
										<span class="sr-only">Unnamed</span>
									</template>
									<Tag v-if="row.entry" tone="accent" class="font-sans">Entry point</Tag>
								</span>
							</template>
							<template #cell-access="{ row }">
								<Tag mono :tone="row.write && row.execute ? 'warning' : 'neutral'">
									<span aria-hidden="true">{{ permissions(row) }}</span>
									<span class="sr-only">{{ permissionWords(row) }}</span>
								</Tag>
							</template>
							<template #cell-entropy="{ row }">
								<div v-if="row.entropy !== null" class="flex items-center gap-2">
									<Meter
										:value="row.entropy"
										:min="0"
										:max="8"
										:format="entropyFormat"
										:get-value-label="entropyLabel"
										:aria-label="`Entropy of ${row.name}`"
										class="w-16 shrink-0"
									>
										<MeterTrack class="h-1.5">
											<MeterIndicator :class="row.high ? 'bg-warning' : ''" />
										</MeterTrack>
									</Meter>
									<span class="num w-8 font-mono text-data" aria-hidden="true">{{
										row.entropy.toFixed(2)
									}}</span>
									<Tag v-if="row.high" tone="warning">High</Tag>
								</div>
								<template v-else>
									<span class="text-disabled" aria-hidden="true">-</span>
									<span class="sr-only">Unavailable</span>
								</template>
							</template>
							<template #cell-samples="{ row }">
								<Sparkline
									v-if="row.samples.length"
									:values="row.samples"
									:max="8"
									:label="`Entropy across ${row.samples.length} samples, ${sampleRange(row.samples)} bits per byte`"
								/>
								<template v-else>
									<span class="text-disabled" aria-hidden="true">-</span>
									<span class="sr-only">No samples</span>
								</template>
							</template>
						</DataTable>
					</div>
				</div>
			</ViewSection>

			<ViewSection title="Imports" :meta="importsMeta">
				<template #actions>
					<Button data-variant="ghost" data-size="sm" @click="openView('imports')">Open imports</Button>
				</template>
				<div class="flex flex-col gap-4">
					<p v-if="!data.imports.byLibrary.length" class="text-secondary">No parsed imports in this file.</p>
					<!-- Two columns read as pairs only while they stay close, so the table keeps a reading width. -->
					<div
						v-else
						class="-mx-4 flex max-w-3xl flex-col @2xl:-mx-6"
						:class="longLibraryList ? 'h-(--h)' : ''"
						:style="longLibraryList ? { '--h': libraryHeight } : undefined"
					>
						<DataTable
							:fill="longLibraryList"
							:rows="data.imports.byLibrary"
							:columns="libraryColumns"
							label="Imported libraries"
							:row-key="(row) => row.name"
						/>
					</div>
					<div v-if="data.imports.notable.length" class="flex flex-col gap-2">
						<h4 class="font-medium text-primary">Notable imports</h4>
						<p class="text-secondary">
							These imports suggest capabilities to review in context. They do not prove behavior.
						</p>
						<dl class="flex flex-col gap-3">
							<div
								v-for="group in data.imports.notable"
								:key="group.category"
								class="grid grid-cols-1 items-baseline gap-x-4 gap-y-0.5 @xl:grid-cols-[12rem_minmax(0,1fr)]"
							>
								<dt class="text-caption text-secondary">{{ group.category }}</dt>
								<dd>
									<ul class="flex flex-wrap gap-x-4 gap-y-1" :aria-label="group.category">
										<li
											v-for="(symbol, position) in group.symbols"
											:key="`${position}-${symbol}`"
											class="font-mono text-data wrap-anywhere text-primary"
											translate="no"
										>
											{{ symbol }}
										</li>
									</ul>
								</dd>
							</div>
						</dl>
					</div>
				</div>
			</ViewSection>
		</div>
	</ViewPage>
</template>
