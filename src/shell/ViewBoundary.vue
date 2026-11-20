<script setup lang="ts">
import { Button } from '@ui-sdk/vue/button'
import { errorMessage } from '@/lib/format'

/**
 * Keeps a failure inside the view that caused it. Views read unchecked data from a file
 * that can be malformed on purpose, so one view that throws must not take the tabs, the
 * sidebar and the other views down with it.
 */
const props = defineProps<{ title: string }>()

const emit = defineEmits<{ error: [detail: string] }>()

const failure = ref('')
const attempt = ref(0)

onErrorCaptured((error) => {
	console.error(`${props.title} failed:`, error)
	failure.value = errorMessage(error)
	emit('error', failure.value)
	// Handled here: the error must not reach the workspace's own render.
	return false
})

function retry() {
	failure.value = ''
	attempt.value++
}
</script>

<template>
	<div v-if="failure" class="px-4 pt-4 @2xl:px-6">
		<Notice tone="danger" :title="`${title} stopped because of an error`">
			<p class="wrap-anywhere">{{ failure }}</p>
			<p>The other views still work. Show the view again, or close its tab.</p>
			<template #actions>
				<Button data-size="sm" @click="retry">Show view again</Button>
			</template>
		</Notice>
	</div>
	<slot v-else :key="attempt" />
</template>
