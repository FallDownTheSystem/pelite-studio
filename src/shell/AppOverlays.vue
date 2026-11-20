<script setup lang="ts">
import {
	AlertDialog,
	AlertDialogBackdrop,
	AlertDialogClose,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogTitle,
	type ConfirmOptions,
} from '@ui-sdk/vue/alert-dialog'
import { OverlayHost } from '@ui-sdk/vue/overlays'
import { Toast, ToastClose, ToastDescription, ToastTitle } from '@ui-sdk/vue/toast'
import { confirm, overlays } from '@/lib/overlays'

const ConfirmContent = AlertDialogContent<ConfirmOptions>
</script>

<template>
	<OverlayHost :overlays="overlays">
		<template #toast>
			<Toast>
				<div class="min-w-0 flex-1">
					<ToastTitle />
					<ToastDescription />
				</div>
				<ToastClose aria-label="Dismiss notification" />
			</Toast>
		</template>
	</OverlayHost>
	<AlertDialog :controller="confirm.controller">
		<AlertDialogBackdrop />
		<ConfirmContent v-slot="{ state }">
			<div class="flex flex-col gap-1">
				<AlertDialogTitle>{{ state.payload?.title }}</AlertDialogTitle>
				<AlertDialogDescription v-if="state.payload?.description">
					{{ state.payload.description }}
				</AlertDialogDescription>
			</div>
			<div class="flex flex-wrap justify-end gap-2">
				<AlertDialogClose>{{ state.payload?.cancelLabel ?? 'Cancel' }}</AlertDialogClose>
				<!-- The app asks only before work is lost, so an agent may never give this answer for the person. -->
				<AlertDialogClose
					data-variant="destructive"
					value="confirm"
					:data-agent-confirm="state.payload?.title ?? 'Confirms an action that loses work'"
				>
					{{ state.payload?.confirmLabel ?? 'Confirm' }}
				</AlertDialogClose>
			</div>
		</ConfirmContent>
	</AlertDialog>
</template>

<style>
/* Toasts stand above the status bar (h-7) instead of covering the status they report on. */
[data-slot='toast-region'][data-side='bottom'] {
	bottom: 1.75rem;
}

/* A toast rises from the edge it lives on and leaves the same way, faster than it came. */
[data-slot='toast'] {
	transition-property: opacity, translate;
	transition-duration: var(--motion-enter);
	transition-timing-function: var(--ease-out);

	&[data-ending-style] {
		transition-duration: var(--motion-exit);
	}

	&:is([data-starting-style], [data-ending-style]) {
		opacity: 0;

		@media (prefers-reduced-motion: no-preference) {
			translate: 0 50%;

			[data-side='top'] > * > & {
				translate: 0 -50%;
			}
		}
	}
}
</style>
