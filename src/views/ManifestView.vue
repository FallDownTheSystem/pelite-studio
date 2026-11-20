<script lang="ts">
import type { PeDocument } from '@/pe/document'
import type { ViewContent } from '@/pe/view'
import { unwrap } from '@/pe/pelite'

export interface ManifestData {
	manifest: string
}

export function isAvailable(doc: PeDocument): boolean {
	const manifest = doc.peFile.resourcesManifest()
	return manifest !== null && !(manifest instanceof Error)
}

export function prepare(doc: PeDocument): ViewContent<ManifestData> {
	const manifest = unwrap(doc.peFile.resourcesManifest())
	if (manifest === null) throw new Error('No manifest resource was found.')
	return { data: { manifest } }
}
</script>

<script setup lang="ts">
import { tokenizeXml } from './manifest/highlight'

const props = defineProps<{ data: ManifestData }>()

const tokens = computed(() => tokenizeXml(props.data.manifest))
</script>

<template>
	<ViewPage
		title="Manifest"
		description="The application manifest: XML that declares the requested execution level, DPI awareness and side-by-side assembly dependencies."
	>
		<template #actions>
			<CopyButton :value="data.manifest" label="Copy manifest" />
		</template>
		<!-- The well hugs the longest line, so a short manifest does not leave a wide empty slab. -->
		<pre
			class="scroll-thin w-fit max-w-full overflow-x-auto rounded-md bg-sunken p-3 font-mono text-data whitespace-pre text-primary [tab-size:4]"
			tabindex="0"
			aria-label="Manifest XML"
			translate="no"
		><code><span v-for="(token, index) in tokens" :key="index" :class="token.muted ? 'text-secondary' : undefined">{{ token.text }}</span></code></pre>
	</ViewPage>
</template>
