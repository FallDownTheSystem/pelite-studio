<script setup lang="ts">
import IconFolderOpen from '~icons/lucide/folder-open'
import IconLoader from '~icons/lucide/loader-circle'
import { Button } from '@ui-sdk/vue/button'
import { FileInputTrigger } from '@ui-sdk/vue/file-input'

defineProps<{
	/** The parser has loaded and a file can be opened. */
	ready: boolean
	opening: boolean
	loadError: string
	openError: string
}>()

defineEmits<{ retry: [] }>()

/**
 * The `MZ` signature, marked the same in the bytes and in the text column. While a file is
 * dragged over the page the block turns accent-tinted, so the mark turns solid to stay visible.
 */
const signature =
	'bg-accent-subtle text-primary outline-2 outline-accent-subtle transition-[background-color,color,outline-color] duration-(--motion-fast) ease-[ease] group-data-dragging/app:bg-accent group-data-dragging/app:text-on-accent group-data-dragging/app:outline-accent'

/** The start of every PE file: the DOS header, with its `MZ` signature first. */
const headerRows = [
	{
		offset: '00000000',
		bytes: ['4D', '5A', '90', '00', '03', '00', '00', '00', '04', '00', '00', '00', 'FF', 'FF', '00', '00'],
		text: 'MZ..............',
	},
	{
		offset: '00000010',
		bytes: ['B8', '00', '00', '00', '00', '00', '00', '00', '40', '00', '00', '00', '00', '00', '00', '00'],
		text: '........@.......',
	},
	{
		offset: '00000020',
		bytes: ['00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00'],
		text: '................',
	},
	{
		offset: '00000030',
		bytes: ['00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '80', '00', '00', '00'],
		text: '................',
	},
]
</script>

<template>
	<section
		class="flex min-w-0 flex-1 overflow-auto"
		aria-labelledby="open-title"
		:aria-busy="!ready || opening"
	>
		<div class="m-auto flex w-full max-w-2xl flex-col items-center gap-8 px-6 py-10 text-center">
			<!--
				The drop target is the whole page; this block only shows where a file lands. Its colors
				follow a drag in and out, which a pointer can do several times in a second, so they ease.
			-->
			<div
				class="w-full overflow-hidden rounded-lg border border-dashed border-strong bg-sunken px-4 py-5 transition-[background-color,border-color] duration-(--motion-fast) ease-[ease] select-none group-data-dragging/app:border-solid group-data-dragging/app:border-accent group-data-dragging/app:bg-accent-subtle"
				aria-hidden="true"
			>
				<div
					class="mx-auto w-max max-w-full font-mono text-data text-disabled transition-colors duration-(--motion-fast) ease-[ease] group-data-dragging/app:text-secondary"
				>
					<div v-for="row in headerRows" :key="row.offset" class="flex gap-4 whitespace-pre">
						<span class="max-sm:hidden">{{ row.offset }}</span>
						<span class="flex gap-[1ch]">
							<span
								v-for="(byte, index) in row.bytes"
								:key="index"
								:class="[
									row.offset === '00000000' && index < 2 ? signature : '',
									index === 8 ? 'ms-[1ch]' : '',
								]"
								>{{ byte }}</span
							>
						</span>
						<span class="max-sm:hidden"
							><span v-if="row.offset === '00000000'" :class="signature">MZ</span
							>{{ row.offset === '00000000' ? row.text.slice(2) : row.text }}</span
						>
					</div>
				</div>
			</div>

			<div class="flex w-full flex-col items-center gap-6">
				<div class="flex flex-col items-center gap-2">
					<h1 id="open-title" class="text-title font-semibold text-balance">
						<span class="group-data-dragging/app:hidden">Open a Windows binary</span>
						<span class="hidden group-data-dragging/app:inline">Drop the file to open it</span>
					</h1>
					<p class="max-w-[52ch] text-pretty text-secondary">
						Drop an .exe, .dll or .sys file anywhere on this page, or choose one. The file is read in this
						browser tab and never leaves your device.
					</p>
				</div>

				<div v-if="loadError" class="flex w-full flex-col items-center gap-3">
					<Notice tone="danger" class="w-full text-start">{{ loadError }}</Notice>
					<Button data-variant="solid" @click="$emit('retry')">Load the parser again</Button>
				</div>
				<div v-else class="flex w-full flex-col items-center gap-3">
					<FileInputTrigger data-variant="solid" class="h-9 px-4">
						<IconLoader v-if="!ready || opening" class="size-4 motion-safe:animate-spin" aria-hidden="true" />
						<IconFolderOpen v-else class="size-4" aria-hidden="true" />
						{{ opening ? 'Opening file…' : ready ? 'Choose file…' : 'Loading parser…' }}
					</FileInputTrigger>
					<Notice v-if="openError" tone="danger" enter class="w-full text-start">{{ openError }}</Notice>
				</div>
			</div>
		</div>
	</section>
</template>
