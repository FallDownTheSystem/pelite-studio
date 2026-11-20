<script lang="ts">
import { markRaw, reactive } from 'vue'
import type { PeDocument } from '@/pe/document'
import { unwrap } from '@/pe/pelite'
import type { ViewContent } from '@/pe/view'
import type { PeSectionHeader, ScannerMatch } from '@/vendor/pelite/pelite.js'

export interface ScannerResults {
	matches: ScannerMatch[]
	limit: number
}

export interface ScannerState {
	pattern: string
	/** `code` for the parser's default (executable sections), else a section index. */
	section: string
	limit: string
	patternError: string | undefined
	limitError: string | undefined
	results: ScannerResults | undefined
	busy: boolean
}

export interface ScannerData {
	doc: PeDocument
	sections: PeSectionHeader[]
	state: ScannerState
}

export function prepare(doc: PeDocument): ViewContent<ScannerData> {
	const sections = unwrap(doc.peFile.sectionHeaders())
	const state = reactive<ScannerState>({
		pattern: '',
		section: 'code',
		limit: '1000',
		patternError: undefined,
		limitError: undefined,
		results: undefined,
		busy: false,
	})
	return {
		data: { doc, sections: markRaw(sections), state },
		get titleSuffix() {
			return state.pattern.trim() || null
		},
	}
}
</script>

<script setup lang="ts">
import IconExternalLink from '~icons/lucide/external-link'
import IconLoaderCircle from '~icons/lucide/loader-circle'
import IconScanSearch from '~icons/lucide/scan-search'
import { Button } from '@ui-sdk/vue/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@ui-sdk/vue/field'
import { Input } from '@ui-sdk/vue/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui-sdk/vue/select'
import IconChevronDown from '~icons/lucide/chevron-down'
import type { Column } from '@/components/ui/table'
import { count, errorMessage, hex } from '@/lib/format'
import { useWorkspace } from '@/pe/view'

const props = defineProps<{ data: ScannerData }>()

const state = props.data.state
const workspace = useWorkspace()

const sectionItems = computed(() => [
	{ value: 'code', label: 'Code sections (default)' },
	...props.data.sections.map((section, index) => ({
		value: String(index),
		label: section.Name || `Section ${index + 1}`,
	})),
])

const section = computed({
	get: () => state.section,
	set: (value: string | null) => {
		state.section = value ?? 'code'
	},
})

function slotHex(value: number): string {
	return hex(value >>> 0, 8)
}

const columns = computed((): Column<ScannerMatch>[] => {
	const captures = state.results?.matches[0]?.save.length ?? 0
	const list: Column<ScannerMatch>[] = [
		{
			key: 'index',
			title: '#',
			width: '5rem',
			align: 'end',
			mono: true,
			value: (_, index) => count(index + 1),
		},
	]
	for (let slot = 0; slot < captures; slot++) {
		list.push({
			key: `save-${slot}`,
			title: slot === 0 ? 'Match RVA' : `Save ${slot}`,
			width: slot === captures - 1 ? undefined : '9rem',
			minWidth: '9rem',
			mono: true,
			kind: slot === 0 ? 'rva' : undefined,
			value: (row) => slotHex(row.save[slot]),
		})
	}
	return list
})

const resultText = computed(() => {
	const results = state.results
	if (!results) return ''
	const found = results.matches.length
	return found === 0 ? 'No matches' : `${count(found)} ${found === 1 ? 'match' : 'matches'}`
})

const limitReached = computed(() => {
	const results = state.results
	return !!results && results.limit > 0 && results.matches.length >= results.limit
})

async function scan() {
	if (state.busy) return
	state.patternError = undefined
	state.limitError = undefined
	state.results = undefined
	const pattern = state.pattern.trim()
	if (!pattern) {
		state.patternError = 'Enter a pattern to scan, such as 55 8B EC.'
		return
	}
	const limitText = state.limit.trim()
	const limit = Number(limitText)
	if (limitText === '' || !Number.isSafeInteger(limit) || limit < 0) {
		state.limitError = 'Enter a whole number of 0 or more. 0 means no limit.'
		return
	}
	state.busy = true
	workspace.setStatus('busy', 'Scanning', pattern)
	// The scan blocks the main thread; let the busy state paint first.
	await nextTick()
	await new Promise(requestAnimationFrame)
	try {
		const sectionIndex = state.section === 'code' ? undefined : Number(state.section)
		const matches = unwrap(props.data.doc.peFile.scannerMatches(pattern, sectionIndex, { limit }))
		state.results = markRaw({ matches, limit })
		workspace.setStatus('ready', 'Ready', `Scan found ${resultText.value.toLowerCase()}`)
	} catch (error) {
		state.patternError = `${errorMessage(error).replace(/\.+$/, '')}. Check the pattern against the syntax reference.`
		workspace.setStatus('ready', 'Ready', props.data.doc.file.name)
	} finally {
		state.busy = false
	}
}
</script>

<template>
	<ViewPage
		title="Scanner"
		fill
		description="Finds byte patterns in the file's sections and captures values at each match. Headers are not scanned."
	>
		<template #toolbar>
			<!--
				In a wide panel the fields share the form's rows (label, control, description, error),
				so every control and the button sit on one line whatever text each field carries.
			-->
			<form
				class="grid w-full grid-cols-1 items-start gap-4 @2xl:grid-cols-[minmax(14rem,28rem)_13rem_8rem_auto] @2xl:gap-x-3 @2xl:gap-y-1.5"
				@submit.prevent="scan"
			>
				<Field
					class="@2xl:row-span-4 @2xl:grid @2xl:grid-rows-subgrid"
					:invalid="state.patternError ? true : undefined"
				>
					<FieldLabel>Pattern</FieldLabel>
					<Input
						v-model="state.pattern"
						class="font-mono"
						placeholder="55 8B EC"
						spellcheck="false"
						autocapitalize="none"
						autocorrect="off"
						autocomplete="off"
						translate="no"
					/>
					<FieldDescription>
						Hex bytes, <code class="font-mono">?</code> for any byte, <code class="font-mono">'</code> to save
						the position.
						<a
							class="inline-flex items-center gap-0.5 text-accent underline decoration-accent-border underline-offset-2 hover:decoration-solid"
							href="https://docs.rs/pelite/latest/pelite/pattern/fn.parse.html"
							target="_blank"
							rel="noopener noreferrer"
							>Pattern syntax<IconExternalLink class="size-3 shrink-0" aria-hidden="true" /><span
								class="sr-only"
							>
								(opens in a new tab)</span
							></a
						>
					</FieldDescription>
					<FieldError v-if="state.patternError" match>{{ state.patternError }}</FieldError>
				</Field>
				<Field class="@2xl:row-span-4 @2xl:grid @2xl:grid-rows-subgrid">
					<FieldLabel>Section</FieldLabel>
					<Select v-model:value="section" :items="sectionItems">
						<SelectTrigger>
							<SelectValue />
							<IconChevronDown class="size-4 shrink-0 text-secondary" aria-hidden="true" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem v-for="item in sectionItems" :key="item.value" :value="item.value">
								<span :class="item.value === 'code' ? '' : 'font-mono'" translate="no">{{ item.label }}</span>
							</SelectItem>
						</SelectContent>
					</Select>
				</Field>
				<Field
					class="@2xl:row-span-4 @2xl:grid @2xl:grid-rows-subgrid"
					:invalid="state.limitError ? true : undefined"
				>
					<FieldLabel>Match limit</FieldLabel>
					<Input v-model="state.limit" class="num" inputmode="numeric" autocomplete="off" />
					<FieldDescription>0 means no limit.</FieldDescription>
					<FieldError v-if="state.limitError" match>{{ state.limitError }}</FieldError>
				</Field>
				<Button
					type="submit"
					data-variant="solid"
					class="justify-self-start @2xl:col-start-4 @2xl:row-start-2"
					:aria-busy="state.busy || undefined"
				>
					<IconLoaderCircle
						v-if="state.busy"
						class="size-4 shrink-0 motion-safe:animate-spin"
						aria-hidden="true"
					/>
					<IconScanSearch v-else class="size-4 shrink-0" aria-hidden="true" />
					Scan sections
				</Button>
			</form>
		</template>
		<div class="flex min-h-0 flex-1 flex-col" :aria-busy="state.busy || undefined">
			<p
				class="flex shrink-0 flex-wrap gap-x-4 gap-y-1 border-b border-subtle px-4 py-2 text-secondary @2xl:px-6"
				:class="state.results ? '' : 'sr-only'"
				role="status"
			>
				<span class="font-medium text-primary">{{ resultText }}</span>
				<span v-if="limitReached"
					>The limit is reached, so more matches may exist. Raise the match limit to see them.</span
				>
			</p>
			<EmptyState v-if="state.busy" title="Scanning…">The scan runs over every selected section.</EmptyState>
			<EmptyState v-else-if="!state.results" title="Scan for a byte pattern">
				Enter a byte pattern and scan to list every place it occurs, for example
				<code class="font-mono text-primary" translate="no">55 8B EC</code> for a 32-bit function prologue.
			</EmptyState>
			<EmptyState v-else-if="!state.results.matches.length" title="No matches for this pattern">
				Check the bytes, use <code class="font-mono">?</code> for bytes that vary, or choose another section.
			</EmptyState>
			<DataTable
				v-else
				class="min-h-0 flex-1"
				fill
				:rows="state.results.matches"
				:columns="columns"
				label="Scanner matches"
			/>
		</div>
	</ViewPage>
</template>
