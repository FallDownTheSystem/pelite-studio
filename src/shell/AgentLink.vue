<script setup lang="ts">
import IconBot from '~icons/lucide/bot'
import { Button } from '@ui-sdk/vue/button'
import { Field, FieldDescription, FieldLabel } from '@ui-sdk/vue/field'
import { Input } from '@ui-sdk/vue/input'
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverTitle,
	PopoverTrigger,
} from '@ui-sdk/vue/popover'
import IconCheck from '~icons/lucide/check'
import IconCopy from '~icons/lucide/copy'
import IconDownload from '~icons/lucide/download'
import { agentLink, connectAgent, defaultAgentPort, disconnectAgent } from '@/agent/link'
import { bridgeFileName, setupPrompt } from '@/agent/setup'

/**
 * The switch for the local agent bridge. The page never connects by itself: the person gives
 * the pairing code that the agent shows, so no other site can stand in for this page.
 */
const code = ref('')
const port = ref(String(defaultAgentPort))

const portNumber = computed(() => {
	const value = Number(port.value)
	return Number.isInteger(value) && value > 0 && value < 65536 ? value : null
})
const canConnect = computed(() => code.value.trim().length > 0 && portNumber.value !== null)
const connected = computed(() => agentLink.status === 'connected')

function connect() {
	if (canConnect.value) connectAgent(code.value, portNumber.value!)
}

const bridgeUrl = new URL(bridgeFileName, document.baseURI).href
const { copy, copied } = useClipboard({ copiedDuring: 1600, legacy: true })

function copyPrompt() {
	void copy(setupPrompt(new URL(document.baseURI)))
}
</script>

<template>
	<Popover>
		<PopoverTrigger
			data-variant="ghost"
			data-size="sm"
			class="h-5 gap-1 px-1.5"
			:class="connected ? 'text-accent' : 'text-secondary'"
		>
			<IconBot class="size-3.5" aria-hidden="true" />
			{{ connected ? 'Agent connected' : 'Agent' }}
		</PopoverTrigger>
		<!-- Focus starts on the code field: the setup above it is used once, the code on every run. -->
		<PopoverContent
			side="top"
			align="end"
			:side-offset="6"
			initial-focus="[data-autofocus]"
			class="flex w-80 flex-col gap-3"
		>
			<PopoverTitle>Local agent</PopoverTitle>
			<PopoverDescription class="text-pretty">
				An AI agent on this computer can read the open file and operate this page through the PeLite Studio
				agent bridge. What it reads goes to the model that the agent uses.
			</PopoverDescription>
			<template v-if="connected">
				<p class="m-0 text-body text-primary" role="status">Connected on port {{ agentLink.port }}.</p>
				<div class="flex justify-end">
					<Button @click="disconnectAgent">Disconnect</Button>
				</div>
			</template>
			<section
				v-else
				class="flex flex-col gap-2 rounded-md bg-sunken p-3"
				aria-labelledby="agent-setup-title"
			>
				<h3 id="agent-setup-title" class="m-0 text-body font-medium text-primary">
					First time on this computer
				</h3>
				<p class="m-0 text-caption text-pretty text-secondary">
					Your agent needs the bridge program. Paste the setup prompt into your agent and it installs the
					program itself. You can also download the file and add it to your agent by hand.
				</p>
				<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
					<Button data-size="sm" @click="copyPrompt">
						<IconCheck v-if="copied" class="size-3.5 text-success" aria-hidden="true" />
						<IconCopy v-else class="size-3.5" aria-hidden="true" />
						{{ copied ? 'Prompt copied' : 'Copy setup prompt' }}
					</Button>
					<a
						class="inline-flex items-center gap-1 rounded-sm text-caption text-accent underline underline-offset-2"
						:href="bridgeUrl"
						:download="bridgeFileName"
					>
						<IconDownload class="size-3.5" aria-hidden="true" />
						Download the bridge
					</a>
				</div>
				<span class="sr-only" role="status">{{ copied ? 'Setup prompt copied' : '' }}</span>
			</section>
			<form v-if="!connected" class="flex flex-col gap-3" @submit.prevent="connect">
				<Field>
					<FieldLabel>Pairing code</FieldLabel>
					<Input
						v-model="code"
						class="font-mono uppercase"
						autocomplete="off"
						autocapitalize="characters"
						spellcheck="false"
						placeholder="XXXXXXXX"
						data-autofocus
					/>
					<FieldDescription
						>The agent tells you this code when it tries to use PeLite Studio.</FieldDescription
					>
				</Field>
				<Field class="w-28">
					<FieldLabel>Port</FieldLabel>
					<Input v-model="port" class="num font-mono" inputmode="numeric" autocomplete="off" />
				</Field>
				<p v-if="agentLink.status === 'failed'" class="m-0 text-body text-pretty text-danger" role="alert">
					{{ agentLink.message }}
				</p>
				<div class="flex justify-end">
					<Button
						type="submit"
						data-variant="solid"
						:disabled="!canConnect || agentLink.status === 'connecting'"
					>
						{{ agentLink.status === 'connecting' ? 'Connecting…' : 'Connect' }}
					</Button>
				</div>
			</form>
		</PopoverContent>
	</Popover>
</template>
