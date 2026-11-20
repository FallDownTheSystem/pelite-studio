<script setup lang="ts">
import IconCheck from '~icons/lucide/check'
import IconChevronDown from '~icons/lucide/chevron-down'
import { Button } from '@ui-sdk/vue/button'
import { Field, FieldError, FieldLabel } from '@ui-sdk/vue/field'
import { Input } from '@ui-sdk/vue/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectItemIndicator,
	SelectTrigger,
	SelectValue,
} from '@ui-sdk/vue/select'
import { factKinds, type FactsDatabase } from '@/pe/facts'
import { hasFilters, parseRva, resetFilters } from './model'

/**
 * Search, kind, section and an inclusive RVA range over the combined records. The range is
 * free text, checked when a field loses focus or on Enter; a bad entry stays in its field
 * with the reason below and the last valid range keeps filtering.
 */
const props = defineProps<{ db: FactsDatabase }>()
const db = props.db

const kind = computed({
	get: () => db.kind || 'all',
	set: (value: string | null) => {
		db.kind = !value || value === 'all' ? '' : value
		db.page = 0
	},
})

const section = computed({
	get: () => db.section || 'all',
	set: (value: string | null) => {
		db.section = !value || value === 'all' ? '' : value
		db.page = 0
	},
})

const query = computed({
	get: () => db.query,
	set: (value: string) => {
		db.query = value
		db.page = 0
	},
})

const kindItems = [
	{ value: 'all', label: 'All kinds' },
	...factKinds.map((item) => ({ value: item.id, label: item.name })),
]

const sectionItems = computed(() => [
	{ value: 'all', label: 'All sections' },
	...db.headers.SectionHeaders.map((item, index) => ({
		value: String(index),
		label: item.Name || `Section ${index + 1}`,
	})),
])

const from = ref(db.from)
const to = ref(db.to)
const fromError = ref('')
const toError = ref('')

// The address map and Clear filters write the range directly.
watch(
	() => [db.from, db.to] as const,
	([nextFrom, nextTo]) => {
		from.value = nextFrom
		to.value = nextTo
		fromError.value = ''
		toError.value = ''
	},
)

function check(text: string): { value: number | undefined; error: string } {
	if (!text.trim()) return { value: undefined, error: '' }
	try {
		return { value: parseRva(text), error: '' }
	} catch (error) {
		return { value: undefined, error: error instanceof Error ? error.message : String(error) }
	}
}

function applyRange() {
	const start = check(from.value)
	const end = check(to.value)
	fromError.value = start.error
	toError.value = end.error
	if (start.error || end.error) return
	if ((start.value ?? 0) > (end.value ?? 0xffffffff)) {
		toError.value = 'Enter an end at or after the start.'
		return
	}
	if (db.from !== from.value.trim() || db.to !== to.value.trim()) {
		db.from = from.value.trim()
		db.to = to.value.trim()
		db.page = 0
	}
}

function clear() {
	resetFilters(db)
	fromError.value = ''
	toError.value = ''
}

const filtering = computed(() => hasFilters(db) || !!from.value || !!to.value)
</script>

<template>
	<!-- The spacers stand in for a field label above the controls that have none, so every input lines up. -->
	<div class="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2">
		<div class="flex w-56 max-w-full flex-col gap-[calc(var(--ui-spacing)*1.5)]">
			<span class="invisible text-caption leading-5" aria-hidden="true">Search</span>
			<FilterInput v-model="query" label="Search facts" placeholder="entry" />
		</div>
		<Field class="w-36">
			<FieldLabel>Kind</FieldLabel>
			<Select v-model:value="kind" :items="kindItems">
				<SelectTrigger class="w-full">
					<SelectValue />
					<IconChevronDown class="ms-auto size-4 shrink-0 text-secondary" aria-hidden="true" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem v-for="item in kindItems" :key="item.value" :value="item.value">
						{{ item.label }}
						<SelectItemIndicator><IconCheck class="size-4" aria-hidden="true" /></SelectItemIndicator>
					</SelectItem>
				</SelectContent>
			</Select>
		</Field>
		<Field class="w-36">
			<FieldLabel>Section</FieldLabel>
			<Select v-model:value="section" :items="sectionItems">
				<SelectTrigger class="w-full">
					<SelectValue class="truncate" translate="no" />
					<IconChevronDown class="ms-auto size-4 shrink-0 text-secondary" aria-hidden="true" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem v-for="item in sectionItems" :key="item.value" :value="item.value">
						<span :class="item.value === 'all' ? '' : 'font-mono text-data'" translate="no">{{
							item.label
						}}</span>
						<SelectItemIndicator><IconCheck class="size-4" aria-hidden="true" /></SelectItemIndicator>
					</SelectItem>
				</SelectContent>
			</Select>
		</Field>
		<form class="contents" novalidate @submit.prevent="applyRange">
			<Field class="w-36" :invalid="fromError ? true : undefined">
				<FieldLabel>From RVA</FieldLabel>
				<Input
					v-model="from"
					class="num font-mono"
					placeholder="0x00001000"
					spellcheck="false"
					autocapitalize="none"
					autocorrect="off"
					autocomplete="off"
					@blur="applyRange"
					@keydown.enter.prevent="applyRange"
				/>
				<FieldError v-if="fromError" match>{{ fromError }}</FieldError>
			</Field>
			<Field class="w-36" :invalid="toError ? true : undefined">
				<FieldLabel>To RVA</FieldLabel>
				<Input
					v-model="to"
					class="num font-mono"
					placeholder="0x0000ffff"
					spellcheck="false"
					autocapitalize="none"
					autocorrect="off"
					autocomplete="off"
					@blur="applyRange"
					@keydown.enter.prevent="applyRange"
				/>
				<FieldError v-if="toError" match>{{ toError }}</FieldError>
			</Field>
		</form>
		<div v-if="filtering" class="flex flex-col gap-[calc(var(--ui-spacing)*1.5)]">
			<span class="invisible text-caption leading-5" aria-hidden="true">Clear</span>
			<Button data-variant="ghost" @click="clear">Clear filters</Button>
		</div>
	</div>
</template>
