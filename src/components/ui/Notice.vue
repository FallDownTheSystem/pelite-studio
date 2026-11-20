<script setup lang="ts">
import IconCircleAlert from '~icons/lucide/circle-alert'
import IconCircleCheck from '~icons/lucide/circle-check'
import IconInfo from '~icons/lucide/info'
import IconTriangleAlert from '~icons/lucide/triangle-alert'

/**
 * An inline message that stays with the content it is about. The icon and the tone both
 * carry the meaning, so it reads without color. `danger` announces itself as an alert.
 */
const props = withDefaults(
	defineProps<{
		tone?: 'note' | 'success' | 'warning' | 'danger'
		title?: string
		/**
		 * Set when the notice appears because of something the user just did, such as an error
		 * under a form. It then fades in so the content below it does not jump without a cause.
		 * Leave it off for notices that are part of a view from its first render.
		 */
		enter?: boolean
	}>(),
	{ tone: 'note' },
)

const tones = {
	note: { icon: IconInfo, box: 'bg-surface', mark: 'text-secondary' },
	success: { icon: IconCircleCheck, box: 'bg-success-subtle', mark: 'text-success' },
	warning: { icon: IconTriangleAlert, box: 'bg-warning-subtle', mark: 'text-warning' },
	danger: { icon: IconCircleAlert, box: 'bg-danger-subtle', mark: 'text-danger' },
}

const look = computed(() => tones[props.tone])
</script>

<template>
	<div
		class="flex min-w-0 items-start gap-2 rounded-md px-3 py-2"
		:class="[
			look.box,
			enter
				? 'transition-[opacity,translate] duration-(--motion-enter) ease-(--ease-out) starting:opacity-0 motion-safe:starting:-translate-y-1'
				: '',
		]"
		:role="tone === 'danger' ? 'alert' : undefined"
	>
		<component :is="look.icon" class="mt-0.5 size-4 shrink-0" :class="look.mark" aria-hidden="true" />
		<div class="min-w-0 flex-1 wrap-anywhere">
			<p v-if="title" class="font-medium text-primary">{{ title }}</p>
			<div class="text-primary"><slot /></div>
		</div>
		<div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
			<slot name="actions" />
		</div>
	</div>
</template>
