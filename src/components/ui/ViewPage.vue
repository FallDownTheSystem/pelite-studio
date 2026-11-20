<script setup lang="ts">
import IconInfo from '~icons/lucide/info'
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverTitle,
	PopoverTrigger,
} from '@ui-sdk/vue/popover'

/**
 * The frame every view starts from: a title row, an optional toolbar, then the body.
 *
 * - default: the body scrolls with the view panel and is padded. For pages of sections.
 * - `fill`: the page takes the panel's height and the body gets all of the rest without
 *   padding, so one child (a `fill` DataTable, a hex dump) can scroll by itself.
 */
defineProps<{
	title: string
	/** One sentence under the title. Leave it out when the title says enough. */
	description?: string
	fill?: boolean
}>()
</script>

<template>
	<!-- `--page-inset` matches the padding below; a DataTable that reaches the page edge uses it. -->
	<article
		data-view-page
		class="flex min-w-0 flex-col [--page-inset:1rem] @2xl:[--page-inset:1.5rem]"
		:class="fill ? 'h-full min-h-0' : 'min-h-full'"
	>
		<header
			class="flex min-w-0 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-4 @2xl:px-6"
			:class="fill ? 'border-b border-subtle pb-3' : 'pb-6'"
		>
			<div class="min-w-0 flex-1 basis-48">
				<!--
					In a narrow panel the description would push the data several lines down, so it moves
					behind a button beside the title. The button is real and focusable: keyboard and touch
					reach the same text that the paragraph shows at wider sizes.
				-->
				<div class="flex min-w-0 items-center gap-1">
					<h2 class="text-heading font-semibold text-primary">{{ title }}</h2>
					<Popover v-if="description || $slots.description">
						<PopoverTrigger
							class="shrink-0 @md:hidden"
							data-variant="ghost"
							data-size="sm"
							data-icon-only
							aria-label="About this view"
						>
							<IconInfo class="size-4" aria-hidden="true" />
						</PopoverTrigger>
						<PopoverContent side="bottom" align="start" :side-offset="4" class="max-w-80">
							<PopoverTitle>{{ title }}</PopoverTitle>
							<PopoverDescription class="text-pretty">
								<slot name="description">{{ description }}</slot>
							</PopoverDescription>
						</PopoverContent>
					</Popover>
				</div>
				<p v-if="description || $slots.description" class="mt-0.5 text-pretty text-secondary @max-md:hidden">
					<slot name="description">{{ description }}</slot>
				</p>
			</div>
			<div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center gap-2">
				<slot name="actions" />
			</div>
			<div v-if="$slots.toolbar" class="flex min-w-0 basis-full flex-wrap items-end gap-x-3 gap-y-2">
				<slot name="toolbar" />
			</div>
		</header>
		<div v-if="fill" class="flex min-h-0 min-w-0 flex-1 flex-col">
			<slot />
		</div>
		<div v-else class="flex min-w-0 flex-col gap-8 px-4 pb-8 @2xl:px-6">
			<slot />
		</div>
	</article>
</template>
