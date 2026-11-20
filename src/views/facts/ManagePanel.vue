<script setup lang="ts">
import IconArrowDown from '~icons/lucide/arrow-down'
import IconArrowUp from '~icons/lucide/arrow-up'
import IconCheck from '~icons/lucide/check'
import IconCopy from '~icons/lucide/copy'
import IconDownload from '~icons/lucide/download'
import IconFilePlus from '~icons/lucide/file-plus'
import IconFileText from '~icons/lucide/file-text'
import IconMerge from '~icons/lucide/merge'
import IconPencil from '~icons/lucide/pencil'
import IconPlus from '~icons/lucide/plus'
import IconRedo from '~icons/lucide/redo-2'
import IconTextCursor from '~icons/lucide/text-cursor-input'
import IconTrash from '~icons/lucide/trash-2'
import IconUndo from '~icons/lucide/undo-2'
import IconUpload from '~icons/lucide/upload'
import { Button } from '@ui-sdk/vue/button'
import { Checkbox, CheckboxIndicator } from '@ui-sdk/vue/checkbox'
import { Field, FieldLabel } from '@ui-sdk/vue/field'
import {
	createFileInputController,
	FileInput,
	type FileInputValueChangeDetails,
	type FileRejection,
} from '@ui-sdk/vue/file-input'
import { Input } from '@ui-sdk/vue/input'
import { Toolbar, ToolbarSeparator } from '@ui-sdk/vue/toolbar'
import { defineColumns } from '@/components/ui/table'
import { count } from '@/lib/format'
import { confirm, toast } from '@/lib/overlays'
import type { FactsDatabase, FactsLayer, FactsRow } from '@/pe/facts'
import FactEditor from './FactEditor.vue'
import LayerAction from './LayerAction.vue'
import ReasonButton from './ReasonButton.vue'
import RecordPager from './RecordPager.vue'
import {
	duplicateLayer,
	editFact,
	editLayerText,
	exportLayer,
	importFiles,
	isDrafting,
	kindName,
	layerId,
	layerLabel,
	newFact,
	newLayer,
	pageSize,
	payloadText,
	removeFact,
	renameLayer,
	rvaText,
	sectionName,
	toggleLayer,
} from './model'

/** Layers, their order and names, and the records of the selected layer in stored order. */
const props = defineProps<{
	db: FactsDatabase
	/** The panel is too narrow for text labels in the toolbar. */
	compact: boolean
}>()
const db = props.db

const drafting = computed(() => isDrafting(db))
const editing = computed(() => db.editorLayer >= 0 || db.bulk)

/** Why the layer actions are off, while a draft or an import holds the layers still. */
const busyReason = computed(() =>
	db.busy
		? 'Wait for the import to finish'
		: drafting.value
			? 'Apply or discard the open draft first'
			: undefined,
)
const layerReason = computed(
	() => busyReason.value ?? (db.current ? undefined : 'Create or import a layer first'),
)

const reasons = computed(() => ({
	moveUp: layerReason.value ?? (db.selected <= 0 ? 'This is already the first layer' : undefined),
	moveDown:
		layerReason.value ?? (db.selected >= db.layers.length - 1 ? 'This is already the last layer' : undefined),
	merge:
		layerReason.value ??
		(db.selected === 0 ? 'The first layer has no previous layer to merge into' : undefined),
	undo: busyReason.value ?? (db.past.length ? undefined : 'Nothing to undo'),
	redo: busyReason.value ?? (db.future.length ? undefined : 'Nothing to redo'),
	rename:
		layerReason.value ??
		(db.current && db.rename === db.current.label ? 'Type a different name first' : undefined),
}))

interface LayerRow {
	layer: FactsLayer
	index: number
}

const layerRows = computed<LayerRow[]>(() => db.layers.map((layer, index) => ({ layer, index })))

const selectedLayer = computed({
	get: () => (db.current ? layerId(db.current) : undefined),
	set: (key: string | number | undefined) => {
		if (drafting.value) return
		const index = db.layers.findIndex((layer) => layerId(layer) === key)
		if (index >= 0 && index !== db.selected) db.select(index)
	},
})

const layerColumns = defineColumns<LayerRow>([
	{ key: 'order', title: '#', width: '3rem', align: 'end', mono: true, value: (row) => count(row.index + 1) },
	{ key: 'label', title: 'Layer', minWidth: '8rem', value: (row) => layerLabel(row.layer) },
	{
		key: 'facts',
		title: 'Facts',
		width: '4.5rem',
		align: 'end',
		mono: true,
		value: (row) => count(db.rows(row.index).length),
	},
	{
		key: 'visible',
		title: 'In view',
		width: '4.5rem',
		value: (row) => (row.layer.visible ? 'Shown' : 'Hidden'),
	},
	{
		key: 'state',
		title: 'Changes',
		width: '7rem',
		value: (row) => (db.isUnsaved(row.layer) ? 'Not exported' : 'None'),
	},
])

const records = computed(() => db.rows(db.selected))
const pageCount = computed(() => Math.max(1, Math.ceil(records.value.length / pageSize)))
const pageIndex = computed(() => Math.min(db.page, pageCount.value - 1))
const pageRows = computed(() =>
	records.value.slice(pageIndex.value * pageSize, (pageIndex.value + 1) * pageSize),
)

const recordColumns = defineColumns<FactsRow>([
	{
		key: 'index',
		title: '#',
		width: '3.5rem',
		align: 'end',
		mono: true,
		muted: true,
		value: (row) => count(row.index + 1),
	},
	{ key: 'kind', title: 'Kind', width: '7.5rem', value: (row) => kindName(row.kind) },
	{
		key: 'section',
		title: 'Section',
		width: '6rem',
		mono: true,
		muted: true,
		value: (row) => sectionName(db, row.rva),
	},
	{ key: 'rva', title: 'RVA', width: '7.5rem', mono: true, kind: 'rva', value: (row) => rvaText(row.rva) },
	{
		key: 'value',
		title: 'Value or metadata',
		minWidth: '12rem',
		mono: true,
		kind: (row) => (row.kind === 'R' ? 'rva' : undefined),
		value: (row) => payloadText(row),
	},
	{ key: 'actions', title: 'Actions', width: '5rem', value: () => '' },
])

function edit(row: FactsRow) {
	if (!drafting.value) editFact(db, row)
}

async function remove(row: FactsRow) {
	if (drafting.value) return
	const label = layerLabel(db.layers[row.layer])
	const confirmed = await confirm({
		title: `Remove ${kindName(row.kind).toLowerCase()} at ${rvaText(row.rva)}?`,
		description: `The record is removed from layer '${label}'. Undo restores it.`,
		confirmLabel: 'Remove fact',
		cancelLabel: 'Keep fact',
	})
	if (confirmed) removeFact(db, row)
}

async function removeLayer() {
	const layer = db.current
	if (!layer || drafting.value) return
	const facts = db.rows(db.selected).length
	const confirmed = await confirm({
		title: `Delete layer '${layerLabel(layer)}'?`,
		description: `${facts ? `Its ${count(facts)} ${facts === 1 ? 'fact is' : 'facts are'} deleted with it.` : 'The layer holds no facts.'} Undo restores the layer.`,
		confirmLabel: 'Delete layer',
		cancelLabel: 'Keep layer',
	})
	if (confirmed && db.current === layer) db.removeLayer(db.selected)
}

function exportCurrent() {
	const name = exportLayer(db)
	if (name) toast(`Exported ${name}`)
}

const renameId = useId()
const layersTitleId = useId()
const recordsTitleId = useId()

function focusRename() {
	const input = document.getElementById(renameId)
	if (input instanceof HTMLInputElement) {
		input.focus()
		input.select()
	}
}

function rename() {
	if (!reasons.value.rename) renameLayer(db)
}

const importer = createFileInputController()

function onFiles(files: File[], details: FileInputValueChangeDetails) {
	// A batch imports whole or not at all, so one rejected file stops the others too.
	if (details.rejected.length) return
	void importFiles(db, files)
}

function onReject(rejected: FileRejection[]) {
	const names = rejected.map((item) => item.file.name).join(', ')
	db.error = `${names}: choose .factmap, .symtext or .txt files. Nothing was imported.`
}
</script>

<template>
	<div class="flex min-h-0 min-w-0 flex-1 flex-col">
		<FileInput
			:controller="importer"
			aria-label="Import fact files"
			:value="[]"
			multiple
			accept=".factmap,.symtext,.txt"
			:announcement="() => null"
			class="max-w-none shrink-0 border-b border-subtle px-1.5 py-1.5 @2xl:px-3.5"
			@value-change="onFiles"
			@reject="onReject"
		>
			<!-- The padding above sets each first icon on the page's text edge, past the ghost button's own inset. -->
			<Toolbar aria-label="Layer actions">
				<LayerAction label="New layer" :reason="busyReason" :compact="compact" @press="newLayer(db)">
					<IconFilePlus class="size-4 shrink-0" aria-hidden="true" />
				</LayerAction>
				<LayerAction label="Duplicate" :reason="layerReason" :compact="compact" @press="duplicateLayer(db)">
					<IconCopy class="size-4 shrink-0" aria-hidden="true" />
				</LayerAction>
				<LayerAction label="Rename" :reason="layerReason" :compact="compact" @press="focusRename">
					<IconTextCursor class="size-4 shrink-0" aria-hidden="true" />
				</LayerAction>
				<ToolbarSeparator />
				<LayerAction label="Move up" :reason="reasons.moveUp" :compact="compact" @press="db.move(-1)">
					<IconArrowUp class="size-4 shrink-0" aria-hidden="true" />
				</LayerAction>
				<LayerAction label="Move down" :reason="reasons.moveDown" :compact="compact" @press="db.move(1)">
					<IconArrowDown class="size-4 shrink-0" aria-hidden="true" />
				</LayerAction>
				<LayerAction label="Merge down" :reason="reasons.merge" :compact="compact" @press="db.mergeDown()">
					<IconMerge class="size-4 shrink-0" aria-hidden="true" />
				</LayerAction>
				<LayerAction label="Delete" :reason="layerReason" :compact="compact" @press="removeLayer">
					<IconTrash class="size-4 shrink-0" aria-hidden="true" />
				</LayerAction>
				<ToolbarSeparator />
				<LayerAction label="Import files…" :reason="busyReason" :compact="compact" @press="importer.open()">
					<IconUpload class="size-4 shrink-0" aria-hidden="true" />
				</LayerAction>
				<LayerAction label="Export factmap" :reason="layerReason" :compact="compact" @press="exportCurrent">
					<IconDownload class="size-4 shrink-0" aria-hidden="true" />
				</LayerAction>
				<ToolbarSeparator />
				<LayerAction
					label="Undo"
					shortcut="mod+z"
					:reason="reasons.undo"
					:compact="compact"
					@press="db.undo()"
				>
					<IconUndo class="size-4 shrink-0" aria-hidden="true" />
				</LayerAction>
				<LayerAction
					label="Redo"
					shortcut="mod+shift+z"
					:reason="reasons.redo"
					:compact="compact"
					@press="db.undo(true)"
				>
					<IconRedo class="size-4 shrink-0" aria-hidden="true" />
				</LayerAction>
			</Toolbar>
		</FileInput>

		<div
			class="scroll-thin flex min-h-0 min-w-0 flex-1 flex-col overflow-auto @4xl:flex-row @4xl:overflow-hidden"
		>
			<div
				class="scroll-thin flex min-w-0 shrink-0 flex-col gap-4 border-b border-subtle px-4 py-3 @2xl:px-6 @4xl:w-[26rem] @4xl:overflow-auto @4xl:border-e @4xl:border-b-0"
			>
				<Notice v-if="db.error && !editing" tone="danger">{{ db.error }}</Notice>
				<Notice v-else-if="db.notice && !db.error">{{ db.notice }}</Notice>

				<section class="flex min-w-0 flex-col gap-2" :aria-labelledby="layersTitleId">
					<!-- As tall as the button row beside "Facts in", so the two pane headings share a line. -->
					<div class="flex min-h-7 items-center justify-between gap-4">
						<h3 :id="layersTitleId" class="font-medium text-primary">Layers</h3>
						<p class="num text-caption text-secondary">
							{{ count(db.layers.length) }} {{ db.layers.length === 1 ? 'layer' : 'layers' }}
						</p>
					</div>
					<div class="-mx-4 @2xl:-mx-6">
						<DataTable
							v-model:selected="selectedLayer"
							:rows="layerRows"
							:columns="layerColumns"
							:row-key="(row) => layerId(row.layer)"
							label="Fact layers"
							animate-moves
						>
							<template #cell-label="{ row, value }">
								<span :class="row.layer.label ? '' : 'text-secondary'">{{ value }}</span>
							</template>
							<template #cell-state="{ row, value }">
								<Tag v-if="db.isUnsaved(row.layer)" tone="warning">{{ value }}</Tag>
								<span v-else class="text-secondary">{{ value }}</span>
							</template>
							<template #cell-visible="{ row }">
								<label class="inline-flex items-center gap-2" @click.stop>
									<Checkbox
										:checked="row.layer.visible"
										:disabled="drafting"
										:aria-label="`Show ${layerLabel(row.layer)} in Inspect facts`"
										@checked-change="toggleLayer(db, row.index)"
									>
										<CheckboxIndicator><IconCheck class="size-3" aria-hidden="true" /></CheckboxIndicator>
									</Checkbox>
								</label>
							</template>
							<template #empty>
								<EmptyState title="No layers">
									Create a layer or import a factmap to start recording facts.
									<template #actions>
										<Button data-size="sm" :disabled="!!busyReason" @click="newLayer(db)">New layer</Button>
									</template>
								</EmptyState>
							</template>
						</DataTable>
					</div>
					<p class="text-caption text-secondary">
						Layers apply from first to last. Merge down appends a layer's facts to the layer above it and
						keeps that layer's name. Facts live in memory only: export each layer to keep it.
					</p>
					<p v-if="drafting && db.layers.length" class="text-caption text-secondary">
						Apply or discard the open draft to select another layer.
					</p>
				</section>

				<form v-if="db.current" class="flex min-w-0 items-end gap-2" @submit.prevent="rename">
					<Field class="min-w-0 flex-1" :disabled="drafting">
						<FieldLabel>Layer name</FieldLabel>
						<Input :id="renameId" v-model="db.rename" autocomplete="off" />
					</Field>
					<ReasonButton type="submit" :reason="reasons.rename">Rename layer</ReasonButton>
				</form>
			</div>

			<section
				v-if="db.current"
				class="flex min-w-0 flex-col @4xl:min-h-0 @4xl:flex-1 @4xl:overflow-auto"
				:aria-labelledby="recordsTitleId"
			>
				<div
					class="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-3 pb-2 @2xl:px-6"
				>
					<h3 :id="recordsTitleId" class="min-w-0 font-medium text-primary">
						Facts in '{{ layerLabel(db.current) }}'
					</h3>
					<div class="flex flex-wrap gap-2">
						<ReasonButton :reason="busyReason" :variant="editing ? undefined : 'solid'" @press="newFact(db)">
							<IconPlus class="size-4 shrink-0" aria-hidden="true" />
							Add fact
						</ReasonButton>
						<ReasonButton :reason="busyReason" @press="editLayerText(db)">
							<IconFileText class="size-4 shrink-0" aria-hidden="true" />
							Edit layer text
						</ReasonButton>
					</div>
				</div>
				<div v-if="editing" class="shrink-0 border-b border-subtle px-4 pb-4 @2xl:px-6">
					<FactEditor :db="db" />
				</div>
				<div class="h-[28rem] min-w-0 shrink-0 @4xl:h-auto @4xl:min-h-48 @4xl:flex-1">
					<DataTable
						fill
						:rows="pageRows"
						:columns="recordColumns"
						:row-key="(row) => `${row.layer}:${row.index}`"
						:label="`Facts in ${layerLabel(db.current)}`"
						@activate="edit"
					>
						<template #cell-kind="{ row }">
							<Tag>{{ kindName(row.kind) }}</Tag>
						</template>
						<template #cell-actions="{ row }">
							<span class="flex items-center gap-0.5">
								<IconButton
									size="sm"
									:label="`Edit fact ${row.index + 1}`"
									:disabled="drafting"
									side="left"
									@click="edit(row)"
								>
									<IconPencil class="size-3.5" aria-hidden="true" />
								</IconButton>
								<IconButton
									size="sm"
									:label="`Remove fact ${row.index + 1}`"
									:disabled="drafting"
									side="left"
									@click="remove(row)"
								>
									<IconTrash class="size-3.5" aria-hidden="true" />
								</IconButton>
							</span>
						</template>
						<template #empty>
							<EmptyState title="This layer is empty"
								>Add a fact or edit the layer text to fill it.</EmptyState
							>
						</template>
					</DataTable>
				</div>
				<RecordPager
					:db="db"
					:total="records.length"
					:page-count="pageCount"
					:page-index="pageIndex"
					:noun="records.length === 1 ? 'fact' : 'facts'"
					order="in stored order"
				/>
			</section>
		</div>
	</div>
</template>
