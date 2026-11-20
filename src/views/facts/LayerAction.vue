<script setup lang="ts">
import { ToolbarButton } from '@ui-sdk/vue/toolbar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@ui-sdk/vue/tooltip'

/**
 * A toolbar action with an icon and a text label, or only the icon when the panel is narrow.
 * An action that does not apply stays focusable and says why in its tooltip.
 */
const props = defineProps<{
	label: string
	/** Why the action does not apply now. Disables it. */
	reason?: string
	compact?: boolean
	shortcut?: string
}>()

const emit = defineEmits<{ press: [] }>()

const hint = computed(() => {
	if (!props.reason) return props.label
	return props.compact ? `${props.label}. ${props.reason}` : props.reason
})

function press() {
	if (!props.reason) emit('press')
}
</script>

<template>
	<Tooltip :disabled="!compact && !reason" :shortcut="shortcut" type="description">
		<ToolbarButton
			:disabled="!!reason"
			data-variant="ghost"
			:aria-label="compact ? label : undefined"
			@click="press"
		>
			<template #render="{ props: part }">
				<TooltipTrigger v-bind="part" class="shrink-0">
					<slot />
					<span v-if="!compact">{{ label }}</span>
				</TooltipTrigger>
			</template>
		</ToolbarButton>
		<TooltipContent side="bottom" :side-offset="6">{{ hint }}</TooltipContent>
	</Tooltip>
</template>
