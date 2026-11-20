import type { PeResourceData, PeResourceTreeEntry, ResourceName } from '@/vendor/pelite/pelite.js'

/** pelite names the standard types by their RT_ constant with a `#` prefix, like `#ICON`. */
const standardTypes = new Set([
	'CURSOR',
	'BITMAP',
	'ICON',
	'MENU',
	'DIALOG',
	'STRING',
	'FONTDIR',
	'FONT',
	'ACCELERATOR',
	'RCDATA',
	'MESSAGETABLE',
	'GROUP_CURSOR',
	'GROUP_ICON',
	'VERSION',
	'DLGINCLUDE',
	'PLUGPLAY',
	'VXD',
	'ANICURSOR',
	'ANIICON',
	'HTML',
	'MANIFEST',
])

export interface ResourceNode {
	/** Position in the tree, unique even when names repeat or cannot be read. */
	value: string
	label: string
	/** The name as the file stores it: `#1`, `MAINICON`, `#ICON`. */
	name: string | null
	/** Slash-separated path in pelite's resource syntax, or null when a name on the way is unreadable. */
	path: string | null
	/** Names from the root down to this node, as shown in the tree. */
	trail: string[]
	level: number
	data: PeResourceData | null | undefined
	children?: ResourceNode[]
}

export function resourceName(name: ResourceName | null): string | null {
	if (name === null) return null
	return typeof name === 'number' ? `#${name}` : name
}

function displayName(name: string | null, level: number): string {
	if (name === null) return 'Name unavailable'
	if (level === 1 && name.startsWith('#') && standardTypes.has(name.slice(1))) return `RT_${name.slice(1)}`
	return name
}

export function buildResourceTree(entries: PeResourceTreeEntry[]): ResourceNode[] {
	const visit = (list: PeResourceTreeEntry[], parent: ResourceNode | null): ResourceNode[] =>
		list.map((entry, index) => {
			const level = parent ? parent.level + 1 : 1
			const name = resourceName(entry.name)
			const label = displayName(name, level)
			const parentPath = parent ? parent.path : ''
			const node: ResourceNode = {
				value: `${parent?.value ?? ''}/${index}`,
				label,
				name,
				path: parentPath === null || name === null ? null : `${parentPath}/${name}`,
				trail: [...(parent?.trail ?? []), label],
				level,
				data: entry.data,
			}
			if (entry.directory !== undefined) node.children = visit(entry.directory ?? [], node)
			return node
		})
	return visit(entries, null)
}

export function findNode(nodes: ResourceNode[], value: string | null): ResourceNode | undefined {
	if (value === null) return undefined
	for (const node of nodes) {
		if (node.value === value) return node
		if (node.children && value.startsWith(`${node.value}/`)) return findNode(node.children, value)
	}
	return undefined
}

export function branchValues(nodes: ResourceNode[]): string[] {
	return nodes.flatMap((node) => (node.children ? [node.value, ...branchValues(node.children)] : []))
}

export function countLeaves(nodes: ResourceNode[]): number {
	return nodes.reduce((total, node) => total + (node.children ? countLeaves(node.children) : 1), 0)
}

/** The parser hands resource bytes over as base64. */
export function decodeBytes(base64: string): Uint8Array {
	const text = atob(base64)
	const bytes = new Uint8Array(text.length)
	for (let index = 0; index < text.length; index++) bytes[index] = text.charCodeAt(index)
	return bytes
}

export function hexLines(bytes: Uint8Array, limit: number): string[] {
	const lines: string[] = []
	const end = Math.min(bytes.length, limit)
	for (let offset = 0; offset < end; offset += 16) {
		const row = bytes.subarray(offset, Math.min(offset + 16, end))
		const hex = Array.from(row, (byte) => byte.toString(16).padStart(2, '0')).join(' ')
		const ascii = Array.from(row, (byte) =>
			byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.',
		).join('')
		lines.push(`${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(47, ' ')}  ${ascii}`)
	}
	return lines
}

/** Keeps a resource name usable as a file name on every platform. */
export function safeFileName(text: string): string {
	return text.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/^#/, '')
}
