<script setup lang="ts">
import IconCheck from '~icons/lucide/check'
import IconCopy from '~icons/lucide/copy'
import { Tooltip, TooltipContent, TooltipTrigger } from '@ui-sdk/vue/tooltip'

/** Copies `value` to the clipboard. `label` names what is copied: "Copy SHA-256". */
const props = defineProps<{ value: string; label: string }>()

const { copy, copied } = useClipboard({ copiedDuring: 1600, legacy: true })
</script>

<template>
	<Tooltip :close-on-press="false" type="label">
		<TooltipTrigger
			type="button"
			:aria-label="label"
			data-variant="ghost"
			data-size="sm"
			data-icon-only
			@click="copy(props.value)"
		>
			<!-- Both icons stay mounted in one cell so the swap can cross-fade both ways. -->
			<span class="grid place-items-center *:col-start-1 *:row-start-1" aria-hidden="true">
				<IconCheck class="icon-swap size-4 text-success" :data-hidden="copied ? undefined : ''" />
				<IconCopy class="icon-swap size-4" :data-hidden="copied ? '' : undefined" />
			</span>
		</TooltipTrigger>
		<TooltipContent side="top" :side-offset="6">{{ copied ? 'Copied' : label }}</TooltipContent>
	</Tooltip>
	<span class="sr-only" role="status">{{ copied ? 'Copied' : '' }}</span>
</template>

<style scoped>
/* The copied mark confirms the press; reduced motion keeps only the fade. */
.icon-swap {
	transition-property: opacity, scale, filter;
	transition-duration: var(--motion-icon-swap);
	transition-timing-function: var(--ease-icon-swap);
}

.icon-swap[data-hidden] {
	opacity: 0;
	scale: 0.25;
	filter: blur(4px);
}

@media (prefers-reduced-motion: reduce) {
	.icon-swap[data-hidden] {
		scale: 1;
		filter: none;
	}
}
</style>
