<script setup lang="ts">
import IconCheck from '~icons/lucide/check'
import IconChevronDown from '~icons/lucide/chevron-down'
import { Button } from '@ui-sdk/vue/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@ui-sdk/vue/field'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectItemIndicator,
	SelectTrigger,
	SelectValue,
} from '@ui-sdk/vue/select'
import { Textarea } from '@ui-sdk/vue/textarea'
import { factKinds, type FactsDatabase } from '@/pe/facts'
import { layerLabel, newFact, saveFact, saveLayerText } from './model'

/**
 * The open draft of the selected layer: one fact record, or the layer's complete factmap text.
 * Both drafts live on the database, so they survive switching modes and closing the tab.
 */
const props = defineProps<{ db: FactsDatabase }>()
const db = props.db

/** The record's first letter names its kind; a draft that does not start with one has none yet. */
const kind = computed({
	get: () => {
		const letter = db.editor.trim().charAt(0).toUpperCase()
		return factKinds.some((item) => item.id === letter) ? letter : null
	},
	set: (value: string | null) => {
		if (value) newFact(db, value)
	},
})

const example = computed(() => {
	const text = factKinds.find((item) => item.id === kind.value)?.example
	return kind.value === 'D' && db.pointerWidth === 32 ? text?.replace('x86_64', 'x86') : text
})

const kindItems = factKinds.map((item) => ({ value: item.id, label: item.name }))
</script>

<template>
	<form
		v-if="db.editorLayer >= 0"
		class="flex min-w-0 flex-col gap-3"
		:aria-label="db.editIndex < 0 ? 'Add fact' : 'Edit fact'"
		@submit.prevent="saveFact(db)"
	>
		<div class="flex min-w-0 flex-wrap items-center gap-2">
			<h4 class="min-w-0 font-medium text-primary">
				{{ db.editIndex < 0 ? 'Add a fact to' : `Edit fact ${db.editIndex + 1} of` }}
				'{{ layerLabel(db.layers[db.editorLayer]) }}'
			</h4>
			<Tag tone="warning">Unsaved draft</Tag>
		</div>
		<Field v-if="db.editIndex < 0">
			<FieldLabel>Kind</FieldLabel>
			<Select v-model:value="kind" :items="kindItems" placeholder="Choose a kind">
				<SelectTrigger class="w-48 max-w-full">
					<SelectValue />
					<IconChevronDown class="ms-auto size-4 shrink-0 text-secondary" aria-hidden="true" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem v-for="item in factKinds" :key="item.id" :value="item.id" :label="item.name">
						<span class="flex min-w-0 flex-col">
							<span>{{ item.name }}</span>
							<span class="font-mono text-data text-secondary" translate="no">{{ item.example }}</span>
						</span>
						<SelectItemIndicator><IconCheck class="size-4" aria-hidden="true" /></SelectItemIndicator>
					</SelectItem>
				</SelectContent>
			</Select>
			<FieldDescription>Choosing a kind replaces the record with its example.</FieldDescription>
		</Field>
		<Field>
			<FieldLabel>Fact record</FieldLabel>
			<Textarea
				v-model:value="db.editor"
				class="min-h-16 max-w-3xl resize-y font-mono text-data"
				rows="3"
				required
				spellcheck="false"
				autocapitalize="none"
				autocorrect="off"
				autocomplete="off"
				:placeholder="example"
			/>
			<FieldDescription class="max-w-[75ch]">
				<template v-if="example">
					Example: <code class="font-mono text-data" translate="no">{{ example }}</code>.
				</template>
				RVA uses x-prefixed hex. Quote names and comments as JSON strings. Types follow binfact syntax.
				Function metadata is opaque text; alignment is a power-of-two exponent. A validation error keeps your
				draft.
			</FieldDescription>
			<FieldError match="valueMissing">Enter a fact record, like Cx1000 "Entry point".</FieldError>
		</Field>
		<Notice v-if="db.error" tone="danger">{{ db.error }}</Notice>
		<div class="flex flex-wrap gap-2">
			<Button type="submit" data-variant="solid">Apply fact</Button>
			<Button @click="db.resetEditor()">Discard draft</Button>
		</div>
	</form>

	<form
		v-else-if="db.bulk"
		class="flex min-w-0 flex-col gap-3"
		aria-label="Edit layer text"
		@submit.prevent="saveLayerText(db)"
	>
		<div class="flex min-w-0 flex-wrap items-center gap-2">
			<h4 class="min-w-0 font-medium text-primary">
				Edit the factmap of '{{ layerLabel(db.layers[db.bulkLayer]) }}'
			</h4>
			<Tag tone="warning">Unsaved draft</Tag>
		</div>
		<Field>
			<FieldLabel>Factmap text</FieldLabel>
			<Textarea
				v-model:value="db.bulkText"
				class="min-h-40 max-w-4xl resize-y font-mono text-data"
				rows="14"
				required
				spellcheck="false"
				autocapitalize="none"
				autocorrect="off"
				autocomplete="off"
			/>
			<FieldDescription class="max-w-[75ch]">
				Keep #factmap on the first line. Applying validates the complete layer before it replaces the stored
				one. Record order and duplicates are kept; file comments and formatting are discarded.
			</FieldDescription>
			<FieldError match="valueMissing">Enter the factmap text, starting with #factmap.</FieldError>
		</Field>
		<Notice v-if="db.error" tone="danger">{{ db.error }}</Notice>
		<div class="flex flex-wrap gap-2">
			<Button type="submit" data-variant="solid">Apply layer text</Button>
			<Button @click="db.resetEditor()">Discard draft</Button>
		</div>
	</form>
</template>
