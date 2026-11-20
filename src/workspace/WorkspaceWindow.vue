<script setup lang="ts">
import { motion, useReducedMotion } from 'motion-v'
import type { Component, ComponentPublicInstance } from 'vue'
import IconPanelBottomClose from '~icons/lucide/panel-bottom-close'
import IconX from '~icons/lucide/x'
import IconButton from '@/components/ui/IconButton.vue'
import { enterTransition, exitTransition, nearScale } from '@/lib/motion'
import type { WorkspaceBounds } from './layout'
import { trackPointer } from './pointer'
import { windowOutletKey, type WorkspaceWindowExit } from './types'
import WorkspaceOutlet from './WorkspaceOutlet.vue'

type Action = 'move' | 'resize'

const props = defineProps<{
	viewId: number
	title: string
	icon?: Component
	bounds: WorkspaceBounds
	layer: number
	focused: boolean
	/** Where the window grows from when it opens, such as the tab it was floated from. */
	origin?: string
}>()

const emit = defineEmits<{
	'focus-window': []
	bounds: [bounds: WorkspaceBounds, action: Action]
	dock: []
	close: []
}>()

const root = useTemplateRef<ComponentPublicInstance>('root')
const resizeHandle = useTemplateRef<HTMLElement>('resizeHandle')
const reducedMotion = useReducedMotion()

/*
 * A window grows out of the tab it was floated from and shrinks back toward its tab when it
 * docks, so the eye follows the view between the two places. A closed window only fades.
 * The scale stays close to 1: a large surface that starts small reads as zooming, not moving.
 */

const variants = {
	hidden: () => (reducedMotion.value ? { opacity: 0 } : { opacity: 0, scale: nearScale }),
	shown: { opacity: 1, scale: 1, transition: enterTransition },
	leave: (exit: WorkspaceWindowExit | undefined) => ({
		opacity: 0,
		scale: exit === 'dock' && !reducedMotion.value ? nearScale : 1,
		pointerEvents: 'none',
		transition: exitTransition,
	}),
}

function element(): HTMLElement | undefined {
	return root.value?.$el as HTMLElement | undefined
}

function moved(
	{ x, y, width, height }: WorkspaceBounds,
	dx: number,
	dy: number,
	action: Action,
): WorkspaceBounds {
	return action === 'move'
		? { x: x + dx, y: y + dy, width, height }
		: { x, y, width: width + dx, height: height + dy }
}

function drag(event: PointerEvent, action: Action) {
	if (action === 'move' && event.target instanceof Element && event.target.closest('button')) return
	if (event.button !== 0 || !event.isPrimary) return
	;(action === 'move' ? element() : resizeHandle.value)?.focus({ preventScroll: true })
	const start = { ...props.bounds }
	trackPointer(event, (dx, dy) => emit('bounds', moved(start, dx, dy, action), action))
}

function keyMove(event: KeyboardEvent, action: Action) {
	const step = event.shiftKey ? 1 : 10
	let dx = 0
	let dy = 0
	switch (event.key) {
		case 'ArrowLeft':
			dx = -step
			break
		case 'ArrowRight':
			dx = step
			break
		case 'ArrowUp':
			dy = -step
			break
		case 'ArrowDown':
			dy = step
			break
		default:
			return
	}
	event.preventDefault()
	emit('bounds', moved(props.bounds, dx, dy, action), action)
}
</script>

<template>
	<motion.section
		ref="root"
		role="dialog"
		:aria-label="title"
		tabindex="0"
		:data-workspace-window="viewId"
		:variants="variants"
		initial="hidden"
		animate="shown"
		exit="leave"
		class="absolute flex flex-col overflow-hidden rounded-lg bg-page shadow-window focus-visible:-outline-offset-2"
		:class="focused && 'ring-1 ring-accent'"
		:style="{
			left: `${bounds.x}px`,
			top: `${bounds.y}px`,
			width: `${bounds.width}px`,
			height: `${bounds.height}px`,
			zIndex: layer,
			transformOrigin: origin,
		}"
		@pointerdown.capture="emit('focus-window')"
		@focusin="emit('focus-window')"
		@keydown.self="keyMove($event, 'move')"
	>
		<!-- Bounds are physical pixels from the area's top left corner, so the geometry stays physical. -->
		<header
			class="flex h-8 shrink-0 cursor-move touch-none items-center gap-1.5 border-b border-subtle bg-surface ps-3 pe-1 select-none"
			@pointerdown="drag($event, 'move')"
		>
			<component :is="icon" v-if="icon" class="size-4 shrink-0 text-secondary" aria-hidden="true" />
			<h2
				class="m-0 min-w-0 flex-1 truncate text-body font-normal"
				:class="focused ? 'text-primary' : 'text-secondary'"
			>
				{{ title }}
			</h2>
			<div class="flex shrink-0 items-center gap-0.5">
				<IconButton label="Dock window" size="sm" @click="emit('dock')">
					<IconPanelBottomClose class="size-4 shrink-0" aria-hidden="true" />
				</IconButton>
				<IconButton label="Close window" size="sm" @click="emit('close')">
					<IconX class="size-4 shrink-0" aria-hidden="true" />
				</IconButton>
			</div>
		</header>
		<WorkspaceOutlet :target="windowOutletKey(viewId)" />
		<div
			ref="resizeHandle"
			role="group"
			tabindex="0"
			aria-label="Resize window with arrow keys"
			class="absolute right-0 bottom-0 z-1 grid size-6 cursor-nwse-resize touch-none place-items-end rounded-br-lg p-1 text-secondary hover:text-primary focus-visible:-outline-offset-2"
			@pointerdown="drag($event, 'resize')"
			@keydown="keyMove($event, 'resize')"
		>
			<svg class="pointer-events-none size-2.5" viewBox="0 0 10 10" aria-hidden="true">
				<path
					d="M9 1 1 9M9 5 5 9"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
				/>
			</svg>
		</div>
	</motion.section>
</template>
