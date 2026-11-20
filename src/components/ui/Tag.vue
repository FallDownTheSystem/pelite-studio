<script setup lang="ts">
/**
 * A small label for a value the reader scans across rows: a flag, a type, a state.
 * It is never clickable and never decoration. Give it text that reads without the color.
 */
withDefaults(
	defineProps<{
		tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
		/** Monospace, for flag names and identifiers taken from the file format. */
		mono?: boolean
	}>(),
	{ tone: 'neutral' },
)
</script>

<template>
	<span
		class="inline-flex h-5 items-center rounded-sm px-1.5 text-caption whitespace-nowrap"
		:class="[
			mono ? 'font-mono' : 'font-medium',
			{
				'bg-pressed text-primary': tone === 'neutral',
				'bg-accent-subtle text-primary': tone === 'accent',
				'bg-success-subtle text-success': tone === 'success',
				'bg-warning-subtle text-warning': tone === 'warning',
				'bg-danger-subtle text-danger': tone === 'danger',
			},
		]"
	>
		<slot />
	</span>
</template>
