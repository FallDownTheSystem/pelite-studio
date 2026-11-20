<script setup lang="ts">
import IconSearch from '~icons/lucide/search'
import IconX from '~icons/lucide/x'
import { Input, InputClear, InputGroup } from '@ui-sdk/vue/input'

/**
 * A search field for narrowing a list in place. The magnifier marks its purpose, so it
 * carries an accessible label and no visible one. Give `placeholder` an example query.
 */
defineProps<{
	/** Names the field: "Filter imports". */
	label: string
	placeholder?: string
}>()

const model = defineModel<string>({ default: '' })
</script>

<template>
	<InputGroup class="w-64 max-w-full">
		<IconSearch class="size-4 shrink-0 text-secondary" aria-hidden="true" />
		<Input
			v-model="model"
			type="search"
			:aria-label="label"
			:placeholder="placeholder"
			autocomplete="off"
			autocapitalize="none"
			autocorrect="off"
			spellcheck="false"
		/>
		<InputClear :aria-label="`Clear ${label.toLowerCase()}`">
			<IconX class="size-4" aria-hidden="true" />
		</InputClear>
	</InputGroup>
</template>
