<script setup lang="ts">
import { Tooltip, TooltipContent, TooltipShortcut, TooltipTrigger } from '@ui-sdk/vue/tooltip'

/**
 * A square button that holds only an icon. The label names it for screen readers
 * and shows as its tooltip. `shortcut` only displays the keys; bind them elsewhere.
 */
defineOptions({ inheritAttrs: false })

withDefaults(
	defineProps<{
		label: string
		shortcut?: string
		variant?: 'ghost' | 'outline' | 'solid'
		size?: 'sm' | 'md'
		side?: 'top' | 'bottom' | 'left' | 'right'
		disabled?: boolean
	}>(),
	{ variant: 'ghost', size: 'md', side: 'bottom' },
)
</script>

<template>
	<Tooltip :shortcut="shortcut" type="label">
		<TooltipTrigger
			v-bind="$attrs"
			type="button"
			:aria-label="label"
			:data-variant="variant === 'outline' ? undefined : variant"
			:data-size="size === 'sm' ? 'sm' : undefined"
			data-icon-only
			:disabled="disabled"
		>
			<slot />
		</TooltipTrigger>
		<TooltipContent :side="side" :side-offset="6">
			{{ label }}
			<TooltipShortcut v-if="shortcut" class="ms-2 text-[0.6875rem] opacity-70" />
		</TooltipContent>
	</Tooltip>
</template>
