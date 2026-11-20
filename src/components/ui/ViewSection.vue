<script setup lang="ts">
/** A titled group inside a ViewPage. `flush` lets a table run to the page edges. */
defineProps<{
	title: string
	description?: string
	/** A count or short fact beside the title, like "12 entries". */
	meta?: string
	flush?: boolean
}>()
</script>

<template>
	<section class="flex min-w-0 flex-col gap-2">
		<header class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
			<h3 class="font-semibold text-primary">{{ title }}</h3>
			<span v-if="meta" class="num text-caption text-secondary">{{ meta }}</span>
			<!-- Beside the title, not at the far edge: a section's content can be much narrower than the page. -->
			<div v-if="$slots.actions" class="flex items-center gap-2">
				<slot name="actions" />
			</div>
			<p v-if="description" class="basis-full text-pretty text-secondary">{{ description }}</p>
		</header>
		<div class="min-w-0" :class="flush ? '-mx-4 @2xl:-mx-6' : ''">
			<slot />
		</div>
	</section>
</template>
