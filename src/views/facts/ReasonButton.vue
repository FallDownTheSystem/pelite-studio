<script setup lang="ts">
import { Tooltip, TooltipContent, TooltipTrigger } from '@ui-sdk/vue/tooltip'

/**
 * A button that stays focusable while it does not apply, with the reason as its tooltip.
 * It is the tooltip's own trigger with `aria-disabled`, as the tooltip docs advise: a natively
 * disabled button never shows its tooltip.
 */
const props = defineProps<{
	/** Why the action does not apply now. Disables it. */
	reason?: string
	variant?: 'solid' | 'ghost' | 'destructive'
	type?: 'button' | 'submit'
}>()

const emit = defineEmits<{ press: [] }>()

function onClick(event: MouseEvent) {
	if (props.reason) {
		event.preventDefault()
		return
	}
	emit('press')
}
</script>

<template>
	<Tooltip :disabled="!reason" type="description">
		<TooltipTrigger
			:type="type ?? 'button'"
			:data-variant="variant"
			:aria-disabled="reason ? 'true' : undefined"
			:data-disabled="reason ? '' : undefined"
			@click="onClick"
		>
			<slot />
		</TooltipTrigger>
		<TooltipContent side="bottom" :side-offset="6">{{ reason }}</TooltipContent>
	</Tooltip>
</template>
