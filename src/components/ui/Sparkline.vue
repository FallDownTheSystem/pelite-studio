<script setup lang="ts">
/**
 * A small step chart of values that each cover an equal part of a whole, such as the entropy
 * of consecutive blocks of a section. It has one size for any number of values, so charts in
 * a column compare by shape. The full height is `max`, so charts also compare by level.
 */
const props = defineProps<{
	values: readonly number[]
	max: number
	/** What the chart shows, for a screen reader. Without it the chart is decoration next to its number. */
	label?: string
}>()

// One unit wide per value; the SVG stretches this to the box, so no gaps or uneven bars can appear.
const line = computed(() => {
	const top = (value: number) => props.max - Math.min(Math.max(value, 0), props.max)
	return props.values.map((value, index) => `${index ? 'V' : 'M0,'}${top(value)}H${index + 1}`).join('')
})
</script>

<template>
	<svg
		class="h-4 w-24 shrink-0 overflow-visible border-b border-subtle text-secondary"
		:viewBox="`0 0 ${values.length} ${max}`"
		preserveAspectRatio="none"
		:role="label ? 'img' : undefined"
		:aria-label="label"
		:aria-hidden="label ? undefined : 'true'"
	>
		<path :d="`${line}V${max}H0Z`" fill="currentColor" fill-opacity="0.16" />
		<path
			:d="line"
			fill="none"
			stroke="currentColor"
			stroke-width="1.25"
			stroke-linejoin="round"
			vector-effect="non-scaling-stroke"
		/>
	</svg>
</template>
