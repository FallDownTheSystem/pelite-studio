<script setup lang="ts">
import { Button } from '@ui-sdk/vue/button'
import { Field, FieldError, FieldLabel } from '@ui-sdk/vue/field'
import { Input } from '@ui-sdk/vue/input'

/**
 * The "Go to RVA" field of Hex Dump and Disassembly. The text stays as typed when it is
 * wrong, and the error shows under it. Extra buttons go in the default slot, after Go.
 */
defineProps<{ error?: string }>()

const model = defineModel<string>({ required: true })

const emit = defineEmits<{ submit: [] }>()
</script>

<template>
	<form class="min-w-0" @submit.prevent="emit('submit')">
		<Field :invalid="error ? true : undefined">
			<FieldLabel>RVA</FieldLabel>
			<div class="flex min-w-0 flex-wrap items-center gap-2">
				<Input
					v-model="model"
					class="w-40 font-mono"
					placeholder="0x1000"
					spellcheck="false"
					autocapitalize="none"
					autocorrect="off"
					autocomplete="off"
					translate="no"
				/>
				<Button type="submit">Go to RVA</Button>
				<slot />
			</div>
			<FieldError v-if="error" match class="max-w-[60ch]">{{ error }}</FieldError>
		</Field>
	</form>
</template>
