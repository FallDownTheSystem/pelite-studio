<script setup lang="ts">
import {
	FileInput,
	FileInputDropzone,
	type FileInputValueChangeDetails,
	type FileRejection,
} from '@ui-sdk/vue/file-input'
import { disconnectAgent, setAgentHost } from '@/agent/link'
import { errorMessage } from '@/lib/format'
import { duration, easeIconSwap } from '@/lib/motion'
import { confirm, toast } from '@/lib/overlays'
import { PeDocument } from '@/pe/document'
import { fetchLinkedFile, linkedFile } from '@/pe/linked'
import { loadPelite, type Pelite } from '@/pe/pelite'
import type { StatusTone } from '@/pe/view'
import AppHeader from '@/shell/AppHeader.vue'
import AppOverlays from '@/shell/AppOverlays.vue'
import OpenScreen from '@/shell/OpenScreen.vue'
import StatusBar from '@/shell/StatusBar.vue'
import WorkspaceScreen from '@/shell/WorkspaceScreen.vue'

// CSS transitions read the same durations as motion-v, from the root so teleported overlays get them too.
for (const [name, seconds] of Object.entries(duration)) {
	const kebab = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
	document.documentElement.style.setProperty(`--motion-${kebab}`, `${seconds * 1000}ms`)
}
document.documentElement.style.setProperty('--ease-icon-swap', `cubic-bezier(${easeIconSwap.join(', ')})`)

const compactMedia = useMediaQuery('(max-width: 40rem), (orientation: portrait) and (max-width: 64rem)')

const pelite = shallowRef<Pelite | null>(null)
const loadError = ref('')
const doc = shallowRef<PeDocument | null>(null)
const docKey = ref(0)
const opening = ref(false)
const fetching = ref(false)
const openError = ref('')
const sidebarOpen = ref(true)
const workspace = useTemplateRef('workspace')

const status = reactive<{ tone: StatusTone; text: string; detail: string }>({
	tone: 'busy',
	text: 'Loading',
	detail: 'Starting the PE parser…',
})

function setStatus(tone: StatusTone, text: string, detail = '') {
	status.tone = tone
	status.text = text
	status.detail = detail
}

async function start() {
	loadError.value = ''
	setStatus('busy', 'Loading', 'Starting the PE parser…')
	try {
		pelite.value = markRaw(await loadPelite())
		setStatus('ready', 'Ready', 'Choose a file to inspect.')
	} catch (error) {
		console.error('Failed to initialize pelite:', error)
		loadError.value = 'The PE parser did not load. Check your connection and reload the page.'
		setStatus('error', 'Parser not loaded', loadError.value)
	}
}

/** Opens the file that the address of the page names, so a link or a frame can show one file. */
async function openLinked() {
	const linked = linkedFile(location.search, location.href)
	if (!linked) return
	fetching.value = true
	setStatus('busy', 'Fetching file', linked.name)
	let file: File
	try {
		file = await fetchLinkedFile(linked)
	} catch (error) {
		openError.value = `${linked.name} could not be fetched from ${linked.url.host} (${errorMessage(error)}). Check the address, and that its site lets this page read the file.`
		setStatus('error', 'File not opened', openError.value)
		return
	} finally {
		fetching.value = false
	}
	await openFile(file)
}

onMounted(async () => {
	await start()
	if (pelite.value) await openLinked()
})

useTitle(computed(() => (doc.value ? `${doc.value.file.name} · PeLite Studio` : 'PeLite Studio')))

async function canDiscard(action: string): Promise<boolean> {
	if (!doc.value?.dirty) return true
	return confirm({
		title: `${action} and discard fact changes?`,
		description:
			'Facts are kept in memory only. Changes you did not export as a factmap are lost when the file closes.',
		confirmLabel: 'Discard changes',
		cancelLabel: 'Keep file open',
	})
}

/** Resolves with the reason the file did not open, or null when it is open. */
async function openFile(file: File): Promise<string | null> {
	const library = pelite.value
	if (!library) return 'The PE parser is not loaded yet.'
	if (opening.value) return 'Another file is opening.'
	if (!(await canDiscard(`Open ${file.name}`))) return 'The person kept the current file open.'
	opening.value = true
	openError.value = ''
	setStatus('busy', 'Opening file', file.name)
	let next: PeDocument
	try {
		const bytes = new Uint8Array(await file.arrayBuffer())
		next = new PeDocument(file, bytes, library)
	} catch (error) {
		// A read failure is an exception from the browser; a parse failure is one from pelite.
		openError.value =
			error instanceof DOMException
				? `${file.name} could not be read. Check that the file still exists and try again.`
				: `${file.name} is not a PE file that the parser supports (${errorMessage(error)}). Choose an .exe, .dll or .sys file.`
		setStatus('error', 'File not opened', openError.value)
		if (doc.value) toast.error('File not opened', { description: openError.value })
		return openError.value
	} finally {
		opening.value = false
	}
	doc.value?.dispose()
	doc.value = next
	docKey.value++
	if (compactMedia.value) sidebarOpen.value = false
	setStatus('ready', 'Ready', file.name)
	return null
}

setAgentHost({
	doc: () => doc.value,
	openFile,
	openView: (id, input) => workspace.value?.openView(id, input),
})
onBeforeUnmount(() => {
	disconnectAgent()
	setAgentHost(null)
})

function onFiles(files: File[], details: FileInputValueChangeDetails) {
	// The input is only a way in: it never keeps a file, so the same file can be picked again.
	details.cancel()
	if (files[0]) void openFile(files[0])
}

function onReject(rejected: FileRejection[]) {
	if (!rejected.length) return
	openError.value = 'Open one file at a time.'
	setStatus('error', 'File not opened', openError.value)
	if (doc.value) toast.error('File not opened', { description: openError.value })
}

async function closeFile() {
	if (!doc.value || !(await canDiscard('Close file'))) return
	doc.value.dispose()
	doc.value = null
	openError.value = ''
	setStatus('ready', 'Ready', 'Choose a file to inspect.')
}

// The dialog above cannot run during unload, so the browser's own prompt guards a reload.
useEventListener(window, 'beforeunload', (event) => {
	if (doc.value?.dirty) event.preventDefault()
})

onBeforeUnmount(() => doc.value?.dispose())
</script>

<template>
	<FileInput
		class="group/app isolate flex h-dvh w-full max-w-none min-w-0 flex-col gap-0 bg-page text-primary"
		aria-label="Open a PE file"
		:value="[]"
		:disabled="!pelite || opening || fetching"
		@value-change="onFiles"
		@reject="onReject"
	>
		<AppHeader
			:doc="doc"
			:sidebar-open="sidebarOpen"
			@toggle-sidebar="sidebarOpen = !sidebarOpen"
			@close-file="closeFile"
			@open-palette="workspace?.openPalette()"
		/>
		<main class="flex min-h-0 min-w-0 flex-1">
			<WorkspaceScreen
				v-if="doc"
				:key="docKey"
				ref="workspace"
				v-model:sidebar-open="sidebarOpen"
				:doc="doc"
				:compact="compactMedia"
				@status="setStatus"
				@close-file="closeFile"
			/>
			<OpenScreen
				v-else
				:ready="!!pelite"
				:opening="opening || fetching"
				:load-error="loadError"
				:open-error="openError"
				@retry="start"
			/>
		</main>
		<StatusBar :tone="status.tone" :text="status.text" :detail="status.detail" />
		<!--
			Takes file drops anywhere on the page. It only shows while a file is dragged over an open workspace,
			and fades so that a drag passing over the window does not flash it.
		-->
		<FileInputDropzone
			target="document"
			class="pointer-events-none fixed inset-0 z-40 place-items-center bg-scrim transition-[opacity,visibility] duration-(--motion-exit) ease-(--ease-out) not-data-dragging:invisible not-data-dragging:opacity-0 data-dragging:duration-(--motion-enter)"
			:class="doc ? 'grid' : 'hidden'"
		>
			<p class="rounded-lg bg-raised px-5 py-3 text-heading font-semibold shadow-window">
				Drop to open the file in place of {{ doc?.file.name }}
			</p>
		</FileInputDropzone>
		<AppOverlays />
	</FileInput>
</template>
