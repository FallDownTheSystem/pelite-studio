<script setup lang="ts">
import IconBinary from '~icons/lucide/binary'
import IconCopy from '~icons/lucide/copy'
import IconCpu from '~icons/lucide/cpu'
import {
	createMenuController,
	Menu,
	MenuContent,
	MenuGroup,
	MenuGroupLabel,
	MenuItem,
	MenuItemIcon,
	MenuSeparator,
} from '@ui-sdk/vue/menu'
import { hex } from '@/lib/format'
import {
	addressKindNames,
	addressTargets,
	describeTarget,
	parseAddress,
	type AddressTarget,
} from '@/pe/address'
import type { PeDocument } from '@/pe/document'
import type { AddressKind, AddressValue } from '@/pe/view'

/**
 * The menu behind every address in the workspace: a right click (or Shift+F10) on a number,
 * or a press on an AddressText. A cell marked with `data-kind` says which address space its
 * number is in; a bare or selected number is offered under every reading that fits the image.
 */
const props = defineProps<{ doc: PeDocument }>()

const emit = defineEmits<{ open: [viewer: string, input: { rva: number }] }>()

interface Payload {
	value: bigint
	groups: { kind: AddressKind; title: string; targets: AddressTarget[] }[]
	/** Set when the address is outside the mapped image, for example in the overlay. */
	unmapped?: AddressKind
}

const menu = createMenuController<Payload>()
const AddressMenuContent = MenuContent<Payload>
const { copy } = useClipboard({ legacy: true })

function payloadFor(value: bigint, kinds?: readonly AddressKind[]): Payload | null {
	const targets = addressTargets(props.doc, value, kinds)
	if (!targets.length) return null
	const groups: Payload['groups'] = []
	for (const target of targets) {
		let group = groups.find((item) => item.kind === target.kind)
		if (!group) {
			group = { kind: target.kind, title: describeTarget(target, value), targets: [] }
			groups.push(group)
		}
		group.targets.push(target)
	}
	return { value, groups }
}

function show(anchor: Element | { x: number; y: number }, payload: Payload) {
	void menu.open({ payload, anchor })
}

function openFor(anchor: Element | { x: number; y: number }, address: AddressValue) {
	const value = BigInt(address.value)
	// A press on an address must always answer, also when no viewer can show the place.
	show(anchor, payloadFor(value, [address.kind]) ?? { value, groups: [], unmapped: address.kind })
}

/** Reads the number under the pointer, or under keyboard focus. Leaves the browser's menu alone when there is none. */
function openFromEvent(event: MouseEvent) {
	if (event.ctrlKey || !(event.target instanceof Element)) return
	const target = event.target
	if (target.closest('[role="menu"], input, textarea')) return
	// A focused table row stands for its first address cell.
	const cell = target.closest('[data-kind]') ?? target.closest('td') ?? target.querySelector('[data-kind]')
	// Editable text keeps the browser's menu, but the listings use a caret and still mark their addresses.
	if (!cell?.hasAttribute('data-kind') && target.closest('[contenteditable]:not([contenteditable="false"])'))
		return
	let text = cell?.textContent ?? (target.childElementCount === 0 ? target.textContent : '')
	let kind = cell?.getAttribute('data-kind') ?? undefined
	const selection = document.getSelection()
	// Only use the selection when the pointer is over it, not a stale selection elsewhere.
	if (selection && !selection.isCollapsed && selection.rangeCount) {
		const rects = Array.from(selection.getRangeAt(0).getClientRects())
		const inside = rects.some(
			(rect) =>
				event.clientX >= rect.left &&
				event.clientX <= rect.right &&
				event.clientY >= rect.top &&
				event.clientY <= rect.bottom,
		)
		if (inside) {
			text = selection.toString()
			if (!cell?.contains(selection.anchorNode) || !cell.contains(selection.focusNode)) kind = undefined
		}
	}
	const value = parseAddress(text ?? '')
	if (value === null) return
	const kinds = kind === 'rva' || kind === 'va' || kind === 'fo' ? [kind as AddressKind] : undefined
	const payload = payloadFor(value, kinds)
	if (!payload) return
	event.preventDefault()
	// A keyboard-made contextmenu event has no pointer position.
	const fromKeyboard = event.clientX === 0 && event.clientY === 0
	show(fromKeyboard ? (cell ?? target) : { x: event.clientX, y: event.clientY }, payload)
}

function onAction(value: string) {
	const payload = menu.getPayload()
	if (!payload) return
	if (value === 'copy') {
		void copy(hex(payload.value))
		return
	}
	const [kind, viewer] = value.split(':')
	const target = payload.groups
		.find((group) => group.kind === kind)
		?.targets.find((item) => item.viewer === viewer)
	if (target) emit('open', target.viewer, { rva: target.rva })
}

defineExpose({ openFor, openFromEvent })
</script>

<template>
	<Menu :controller="menu" @action="onAction">
		<AddressMenuContent v-slot="{ state }" align="start" :side-offset="4" aria-label="Address actions">
			<template v-for="(group, index) in state.payload?.groups ?? []" :key="group.kind">
				<MenuSeparator v-if="index > 0" />
				<MenuGroup>
					<MenuGroupLabel class="num block font-mono first-letter:uppercase" translate="no">{{
						group.title
					}}</MenuGroupLabel>
					<MenuItem
						v-for="target in group.targets"
						:key="target.viewer"
						:value="`${group.kind}:${target.viewer}`"
						:aria-label="`Open in ${target.viewerTitle} as ${addressKindNames[group.kind]}`"
					>
						<MenuItemIcon>
							<IconCpu v-if="target.viewer === 'disasm'" class="size-4" aria-hidden="true" />
							<IconBinary v-else class="size-4" aria-hidden="true" />
						</MenuItemIcon>
						Open in {{ target.viewerTitle }}
					</MenuItem>
				</MenuGroup>
			</template>
			<MenuGroup v-if="state.payload?.unmapped">
				<MenuGroupLabel class="num block font-mono first-letter:uppercase" translate="no">
					{{ addressKindNames[state.payload.unmapped] }} {{ hex(state.payload.value) }}
				</MenuGroupLabel>
				<p class="max-w-56 px-2 pb-1 text-caption text-secondary">
					This address is outside the mapped image, so Hex dump and Disassembly cannot show it.
				</p>
			</MenuGroup>
			<MenuSeparator />
			<MenuItem value="copy">
				<MenuItemIcon><IconCopy class="size-4" aria-hidden="true" /></MenuItemIcon>
				Copy address
			</MenuItem>
		</AddressMenuContent>
	</Menu>
</template>
