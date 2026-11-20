<script setup lang="ts">
import IconCircleAlert from '~icons/lucide/circle-alert'
import IconCircleCheck from '~icons/lucide/circle-check'
import IconLoader from '~icons/lucide/loader-circle'
import source from '@/vendor/pelite/pelite-source.json'
import { agentLink } from '@/agent/link'
import type { StatusTone } from '@/pe/view'
import AgentLink from './AgentLink.vue'

defineProps<{
	tone: StatusTone
	text: string
	detail: string
}>()

const revision = source.revision.slice(0, 7)
</script>

<template>
	<footer
		class="flex h-7 shrink-0 items-center gap-3 border-t border-subtle bg-surface px-3 text-caption text-secondary"
	>
		<div class="flex min-w-0 items-center gap-1.5" role="status" aria-atomic="true">
			<IconLoader
				v-if="tone === 'busy'"
				class="size-3.5 shrink-0 text-secondary motion-safe:animate-spin"
				aria-hidden="true"
			/>
			<IconCircleAlert
				v-else-if="tone === 'error'"
				class="size-3.5 shrink-0 text-danger"
				aria-hidden="true"
			/>
			<IconCircleCheck v-else class="size-3.5 shrink-0 text-success" aria-hidden="true" />
			<span class="shrink-0 font-medium text-primary">{{ text }}</span>
			<span v-if="detail" class="truncate" :title="detail">{{ detail }}</span>
		</div>
		<div class="ms-auto flex shrink-0 items-center gap-3 max-sm:hidden">
			<AgentLink />
			<!-- With an agent connected, file content can reach a model, so the claim no longer holds. -->
			<span v-if="agentLink.status !== 'connected'">Files stay on this device</span>
			<a
				class="rounded-sm font-mono"
				:href="`${source.repository}/tree/${source.revision}`"
				target="_blank"
				rel="noopener noreferrer"
				:aria-label="`pelite revision ${revision}, source on GitHub (opens in a new tab)`"
				>pelite {{ revision }}</a
			>
		</div>
	</footer>
</template>
