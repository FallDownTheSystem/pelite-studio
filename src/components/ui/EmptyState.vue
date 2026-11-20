<script setup lang="ts">
/**
 * What a region shows when it has nothing to show. Say what is missing in the title,
 * why or what to do in the body, and offer one action in the `actions` slot when there is one.
 */
defineProps<{ title: string }>()
</script>

<template>
	<div class="flex min-h-40 flex-1 flex-col items-center justify-center gap-1 px-6 py-10 text-center">
		<p class="font-medium text-primary">{{ title }}</p>
		<p v-if="$slots.default" class="max-w-[48ch] text-pretty text-secondary"><slot /></p>
		<div v-if="$slots.actions" class="mt-3 flex flex-wrap items-center justify-center gap-2">
			<slot name="actions" />
		</div>
	</div>
</template>
