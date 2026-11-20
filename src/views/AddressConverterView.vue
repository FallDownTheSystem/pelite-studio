<script lang="ts">
import { reactive } from 'vue'
import type { PeDocument } from '@/pe/document'
import { unwrap } from '@/pe/pelite'
import type { AddressKind, ViewContent } from '@/pe/view'

export interface AddressConverterState {
	/** The field the user typed in last; it drives the other two. */
	source: AddressKind
	input: string
	/** Errors show once the field is left or Enter is pressed, never while typing. */
	checked: boolean
}

export interface AddressConverterData {
	doc: PeDocument
	imageSize: number
	state: AddressConverterState
}

export function prepare(doc: PeDocument): ViewContent<AddressConverterData> {
	const header = unwrap(doc.peFile.optionalHeader())
	return {
		data: {
			doc,
			imageSize: header.SizeOfImage,
			state: reactive<AddressConverterState>({ source: 'rva', input: '', checked: false }),
		},
		// Meant to float beside other views, so it opens small.
		preferredWindowSize: { width: 320, height: 320 },
	}
}
</script>

<script setup lang="ts">
import { Field, FieldError, FieldLabel } from '@ui-sdk/vue/field'
import { Input } from '@ui-sdk/vue/input'
import { errorMessage, hex } from '@/lib/format'
import { addressToRva } from '@/pe/view'

const props = defineProps<{ data: AddressConverterData }>()

const state = props.data.state

const fields: { kind: AddressKind; label: string }[] = [
	{ kind: 'rva', label: 'RVA' },
	{ kind: 'va', label: 'VA' },
	{ kind: 'fo', label: 'File offset' },
]

interface Conversion {
	values: Record<AddressKind, string>
	error: string | undefined
}

const conversion = computed((): Conversion => {
	const { source, input } = state
	const values: Record<AddressKind, string> = { rva: '', va: '', fo: '', [source]: input }
	const text = input.trim()
	if (!text) return { values, error: undefined }
	const invalid = (error: string): Conversion => ({ values, error })
	const { doc, imageSize } = props.data
	const fileSize = doc.file.size
	try {
		if (!/^(?:0x[\da-f]+|\d+)$/i.test(text)) {
			return invalid('Enter a number in decimal or as hex with 0x, such as 0x1000.')
		}
		const value = BigInt(text)
		if (value > (source === 'va' ? 0xffffffffffffffffn : 0xffffffffn)) {
			return invalid(
				source === 'va'
					? 'A VA fits in 64 bits. Enter a smaller number.'
					: 'This fits in 32 bits only. Enter a smaller number.',
			)
		}
		if (source === 'fo' && value >= BigInt(fileSize)) {
			return invalid(`The file ends at ${hex(fileSize)}. Enter an offset below that.`)
		}

		const peFile = doc.peFile
		// Pelite treats VA zero as a null pointer, even for an image based at zero.
		const rva =
			source === 'va' && value === 0n && peFile.rvaToVa(0) === 0n
				? 0
				: addressToRva(doc, { kind: source, value })
		if (rva >= imageSize) {
			return invalid(`This is outside the image, which ends at RVA ${hex(imageSize)} (SizeOfImage).`)
		}

		const va = source === 'va' ? value : peFile.rvaToVa(rva)
		const fo = source === 'fo' ? Number(value) : peFile.rvaToFileOffset(rva)
		if (source !== 'rva') values.rva = hex(rva)
		if (source !== 'va' && !(va instanceof Error)) values.va = hex(va)
		if (source !== 'fo' && !(fo instanceof Error) && fo < fileSize) values.fo = hex(fo)
		return { values, error: undefined }
	} catch (error) {
		return invalid(`${errorMessage(error)}. Check that the address is inside the image.`)
	}
})

function edit(kind: AddressKind, value: string) {
	state.source = kind
	state.input = value
	state.checked = false
}

function errorFor(kind: AddressKind): string | undefined {
	return state.checked && state.source === kind ? conversion.value.error : undefined
}

/** Says why a converted field stayed empty, so a blank does not read as a failure. */
function noteFor(kind: AddressKind): string | undefined {
	const { values, error } = conversion.value
	if (error || kind === state.source || !state.input.trim() || values[kind]) return
	return kind === 'fo' ? 'Zero-fill: this address has no bytes in the file.' : 'No address in this space.'
}
</script>

<template>
	<ViewPage
		title="Address converter"
		description="Converts between RVA, VA and file offset. Type in any field."
	>
		<div class="flex max-w-sm flex-col gap-2">
			<Field
				v-for="field in fields"
				:key="field.kind"
				:invalid="errorFor(field.kind) ? true : undefined"
				class="grid grid-cols-[4.5rem_minmax(0,1fr)_1.75rem] items-center gap-x-2 gap-y-1"
			>
				<FieldLabel>{{ field.label }}</FieldLabel>
				<Input
					:value="conversion.values[field.kind]"
					class="num min-w-0 font-mono"
					:placeholder="state.input.trim() ? undefined : field.kind === 'va' ? '0x180001000' : '0x1000'"
					spellcheck="false"
					autocapitalize="none"
					autocorrect="off"
					autocomplete="off"
					translate="no"
					@value-change="(value: string) => edit(field.kind, value)"
					@blur="state.checked = state.source === field.kind || state.checked"
					@keydown.enter="state.checked = true"
				/>
				<span class="flex size-7 items-center justify-center">
					<CopyButton
						v-if="conversion.values[field.kind] && !errorFor(field.kind)"
						:value="conversion.values[field.kind]"
						:label="`Copy ${field.label === 'File offset' ? 'file offset' : field.label}`"
					/>
				</span>
				<FieldError v-if="errorFor(field.kind)" match class="col-start-2 col-span-2">{{
					errorFor(field.kind)
				}}</FieldError>
				<p v-else-if="noteFor(field.kind)" class="col-start-2 col-span-2 text-caption text-secondary">
					{{ noteFor(field.kind) }}
				</p>
			</Field>
		</div>
	</ViewPage>
</template>
