<script setup lang="ts">
import IconChevronLeft from '~icons/lucide/chevron-left'
import IconChevronRight from '~icons/lucide/chevron-right'
import {
	Pagination,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationList,
	PaginationNext,
	PaginationPrevious,
} from '@ui-sdk/vue/pagination'
import { count } from '@/lib/format'
import type { FactsDatabase } from '@/pe/facts'

/** The total, the page and the page links under a record table. Pages count from zero on the database. */
const props = defineProps<{
	db: FactsDatabase
	total: number
	pageCount: number
	pageIndex: number
	/** "records", "facts": what the total counts. */
	noun: string
	order: string
}>()

const page = computed({
	get: () => props.pageIndex + 1,
	set: (value: number) => {
		props.db.page = value - 1
	},
})
</script>

<template>
	<div
		class="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-subtle px-4 py-1 @2xl:px-6"
	>
		<p class="num text-caption text-secondary" role="status">
			{{ count(total) }} {{ noun }}, page {{ count(pageIndex + 1) }} of {{ count(pageCount) }}, {{ order }}
		</p>
		<Pagination
			v-if="pageCount > 1"
			v-model:page="page"
			:page-count="pageCount"
			:siblings="1"
			:boundaries="1"
			aria-label="Record pages"
		>
			<PaginationList v-slot="{ state }" class="flex items-center gap-0.5">
				<PaginationItem>
					<PaginationPrevious data-variant="ghost" data-size="sm" aria-label="Previous page">
						<IconChevronLeft class="size-4" aria-hidden="true" />
					</PaginationPrevious>
				</PaginationItem>
				<PaginationItem v-for="item in state.items" :key="item">
					<PaginationLink
						v-if="typeof item === 'number'"
						data-variant="ghost"
						data-size="sm"
						class="num"
						:page="item"
					/>
					<PaginationEllipsis v-else class="px-1 text-secondary" />
				</PaginationItem>
				<PaginationItem>
					<PaginationNext data-variant="ghost" data-size="sm" aria-label="Next page">
						<IconChevronRight class="size-4" aria-hidden="true" />
					</PaginationNext>
				</PaginationItem>
			</PaginationList>
		</Pagination>
	</div>
</template>
