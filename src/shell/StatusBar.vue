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
			<a
				class="grid size-5 place-items-center rounded-sm hover:text-primary"
				href="https://github.com/FallDownTheSystem/pelite-studio"
				target="_blank"
				rel="noopener noreferrer"
				aria-label="PeLite Studio on GitHub (opens in a new tab)"
				title="PeLite Studio on GitHub"
			>
				<!-- The icon set has no brand marks, so the GitHub mark is drawn here. -->
				<svg class="size-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
					<path
						d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
					/>
				</svg>
			</a>
		</div>
	</footer>
</template>
