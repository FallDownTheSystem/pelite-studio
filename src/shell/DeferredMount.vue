<script setup lang="ts">
/**
 * Mounts its content one painted frame after itself. A view that opens then shows its tab and
 * the sidebar's current row in the frame of the click, and its own, slower, first render follows
 * in the next frame instead of holding the whole frame back.
 *
 * The wait is one frame, so nothing stands in for the content: a spinner or skeleton that shows
 * for 16ms reads as a flash, not as progress. Once mounted the content stays mounted.
 */
const props = defineProps<{
	/** Mount at once, for content that appears together with its surroundings. */
	immediate?: boolean
}>()

const ready = ref(props.immediate)

// A background tab pauses animation frames, so a timer makes sure the content still arrives.
const fallbackDelay = 250

onMounted(() => {
	if (ready.value) return
	let timer: ReturnType<typeof setTimeout> | undefined
	const mount = () => {
		clearTimeout(timer)
		ready.value = true
	}
	timer = setTimeout(mount, fallbackDelay)
	// A task queued from the frame callback runs after that frame has painted.
	if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(mount, 0))
})
</script>

<template>
	<slot v-if="ready" />
</template>
