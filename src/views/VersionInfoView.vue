<script lang="ts">
import type { PeDocument } from '@/pe/document'
import type { ViewContent } from '@/pe/view'
import type { PeVersionInfo } from '@/vendor/pelite/pelite.js'
import { unwrap } from '@/pe/pelite'

export interface VersionInfoData {
	version: PeVersionInfo
}

export function isAvailable(doc: PeDocument): boolean {
	const version = doc.peFile.resourcesVersionInfo()
	return version !== null && !(version instanceof Error)
}

export function prepare(doc: PeDocument): ViewContent<VersionInfoData> {
	const version = unwrap(doc.peFile.resourcesVersionInfo())
	if (version === null) throw new Error('No version information resource was found.')
	return { data: { version } }
}
</script>

<script setup lang="ts">
import { count } from '@/lib/format'
import { defineColumns } from '@/components/ui/table'
import {
	fileDate,
	fileTypeName,
	flagNames,
	osName,
	parseTranslation,
	subtypeName,
	type Translation,
} from './version-info/decode'

const props = defineProps<{ data: VersionInfoData }>()

interface FixedRow {
	field: string
	value: number | string
	meaning: string | undefined
}

const vsSignature = 0xfeef04bd

const fixedRows = computed<FixedRow[]>(() => {
	const fixed = props.data.version.fixed
	if (!fixed) return []
	const number = (key: string) => (typeof fixed[key] === 'number' ? (fixed[key] as number) : undefined)
	const type = number('dwFileType')
	return Object.entries(fixed).map(([field, value]) => {
		let meaning: string | undefined
		if (typeof value === 'number') {
			switch (field) {
				case 'dwSignature':
					meaning = value === vsSignature ? 'Valid VS_FIXEDFILEINFO signature' : 'Unexpected signature'
					break
				case 'dwFileFlagsMask':
					meaning = `Valid bits: ${flagNames(value)}`
					break
				case 'dwFileFlags':
					meaning = flagNames(value & (number('dwFileFlagsMask') ?? 0xffffffff))
					break
				case 'dwFileOS':
					meaning = osName(value)
					break
				case 'dwFileType':
					meaning = fileTypeName(value)
					break
				case 'dwFileSubtype':
					meaning = type === undefined ? undefined : subtypeName(type, value)
					break
				case 'dwFileDateMS':
					meaning = `File date: ${fileDate(value, number('dwFileDateLS') ?? 0)}`
					break
				case 'dwFileDateLS':
					meaning = 'Low 32 bits of the file date'
					break
			}
		} else if (field === 'dwFileVersion' || field === 'dwProductVersion' || field === 'dwStrucVersion') {
			meaning = field === 'dwStrucVersion' ? 'Structure version' : 'Binary version number'
		}
		return { field, value, meaning }
	})
})

/** Every table on this page opens with a 12rem column, so the tables stacked below line up. */
const fixedColumns = defineColumns<FixedRow>([
	{ key: 'field', title: 'Field', width: '12rem', mono: true, value: (row) => row.field },
	{
		key: 'value',
		title: 'Value',
		width: '12rem',
		mono: true,
		value: (row) =>
			typeof row.value === 'number' && row.value !== 0 ? `0x${row.value.toString(16)}` : String(row.value),
	},
	{ key: 'meaning', title: 'Meaning', wrap: true, value: (row) => row.meaning },
])

interface StringTable {
	translation: Translation
	rows: { name: string; value: string }[]
}

const tables = computed<StringTable[]>(() =>
	Object.entries(props.data.version.strings).map(([key, strings]) => ({
		translation: parseTranslation(key),
		rows: Object.entries(strings).map(([name, value]) => ({ name, value })),
	})),
)

const stringColumns = defineColumns<{ name: string; value: string }>([
	{ key: 'name', title: 'Name', width: '12rem', mono: true, value: (row) => row.name },
	{ key: 'value', title: 'Value', wrap: true, value: (row) => row.value },
])

function tableTitle(translation: Translation): string {
	return translation.languageName
		? `Strings: ${translation.languageName}`
		: `Strings: language ${translation.languageHex}`
}

function tableMeta(translation: Translation): string {
	const codePage = translation.codePageName
		? `${translation.codePage}, ${translation.codePageName}`
		: translation.codePage
	return `Language ${translation.languageHex}, code page ${codePage}`
}

const translations = computed(() => props.data.version.langs.map(parseTranslation))

const translationColumns = defineColumns<Translation>([
	{ key: 'language', title: 'Language ID', width: '12rem', mono: true, value: (row) => row.languageHex },
	{ key: 'language-name', title: 'Language', value: (row) => row.languageName },
	{ key: 'code-page', title: 'Code page', mono: true, align: 'end', value: (row) => row.codePage },
	{ key: 'code-page-name', title: 'Encoding', value: (row) => row.codePageName },
])

const fixed = computed(() => props.data.version.fixed)
const fileVersion = computed(() => fixed.value?.dwFileVersion)
const productVersion = computed(() => fixed.value?.dwProductVersion)
</script>

<template>
	<ViewPage
		title="Version info"
		description="The VS_VERSIONINFO resource: binary version numbers the loader and installers compare, and the strings Explorer shows in a file's properties."
	>
		<ViewSection title="Fixed file information">
			<div v-if="fixed" class="flex flex-col gap-4">
				<dl
					v-if="fileVersion !== undefined || productVersion !== undefined"
					class="flex flex-wrap gap-x-8 gap-y-2"
				>
					<div v-if="fileVersion !== undefined" class="flex min-w-0 flex-col gap-0.5">
						<dt class="text-caption text-secondary">File version</dt>
						<dd class="num font-mono text-heading font-medium text-primary" translate="no">
							{{ fileVersion }}
						</dd>
					</div>
					<div v-if="productVersion !== undefined" class="flex min-w-0 flex-col gap-0.5">
						<dt class="text-caption text-secondary">Product version</dt>
						<dd class="num font-mono text-heading font-medium text-primary" translate="no">
							{{ productVersion }}
						</dd>
					</div>
				</dl>
				<div class="-mx-4 @2xl:-mx-6">
					<DataTable
						:rows="fixedRows"
						:columns="fixedColumns"
						label="Fixed file information"
						:row-key="(row) => row.field"
					/>
				</div>
			</div>
			<p v-else class="text-secondary">This version resource has no fixed file information block.</p>
		</ViewSection>

		<ViewSection
			v-for="table in tables"
			:key="table.translation.key"
			:title="tableTitle(table.translation)"
			:meta="tableMeta(table.translation)"
			flush
		>
			<DataTable
				:rows="table.rows"
				:columns="stringColumns"
				:label="`Version strings ${table.translation.key}`"
				:row-key="(row) => row.name"
				:empty="'This string table is empty'"
			/>
		</ViewSection>
		<ViewSection v-if="!tables.length" title="Strings">
			<p class="text-secondary">This version resource has no string tables.</p>
		</ViewSection>

		<ViewSection
			v-if="translations.length"
			title="Translations"
			:meta="`${count(translations.length)} ${translations.length === 1 ? 'translation' : 'translations'}`"
			description="Language and code page pairs the file declares in VarFileInfo."
			flush
		>
			<DataTable
				:rows="translations"
				:columns="translationColumns"
				label="Version translations"
				:row-key="(row) => row.key"
			/>
		</ViewSection>
	</ViewPage>
</template>
