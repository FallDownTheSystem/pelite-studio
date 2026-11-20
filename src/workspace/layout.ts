export type WorkspaceDirection = 'row' | 'column'

export interface WorkspacePaneNode {
	type: 'pane'
	id: number
	tabs: number[]
	selected: number | undefined
}

export interface WorkspaceSplitNode {
	type: 'split'
	id: number
	direction: WorkspaceDirection
	ratio: number
	first: WorkspaceNode
	second: WorkspaceNode
}

export type WorkspaceNode = WorkspacePaneNode | WorkspaceSplitNode

export interface WorkspaceSize {
	width: number
	height: number
}

export interface WorkspaceBounds extends WorkspaceSize {
	x: number
	y: number
}

export interface WorkspaceFloatingWindow {
	viewId: number
	bounds: WorkspaceBounds
	layer: number
}

export type WorkspaceFocus = { type: 'pane' | 'window'; id: number }

export const minSplitRatio = 0.15
export const maxSplitRatio = 0.85

/** Workspace placement and focus. The host owns view IDs and their content. */
export class WorkspaceLayout {
	nextNodeId = 1
	root: WorkspaceNode
	lastPaneId: number
	focused: WorkspaceFocus
	windows: WorkspaceFloatingWindow[] = []
	nextLayer = 1

	constructor() {
		this.root = this.createPane()
		this.lastPaneId = this.root.id
		this.focused = { type: 'pane', id: this.root.id }
	}

	get panes(): WorkspacePaneNode[] {
		const collect = (node: WorkspaceNode): WorkspacePaneNode[] =>
			node.type === 'pane' ? [node] : [...collect(node.first), ...collect(node.second)]
		return collect(this.root)
	}

	get activeViewId(): number | undefined {
		return this.focused.type === 'window'
			? this.focused.id
			: this.panes.find((pane) => pane.id === this.focused.id)?.selected
	}

	createPane(): WorkspacePaneNode {
		return { type: 'pane', id: this.nextNodeId++, tabs: [], selected: undefined }
	}

	focusPane(paneId: number) {
		this.lastPaneId = paneId
		if (this.focused.type !== 'pane' || this.focused.id !== paneId) {
			this.focused = { type: 'pane', id: paneId }
		}
	}

	focusWindow(floating: WorkspaceFloatingWindow) {
		if (this.focused.type === 'window' && this.focused.id === floating.viewId) return
		floating.layer = this.nextLayer++
		this.focused = { type: 'window', id: floating.viewId }
	}

	open(viewId: number, afterViewId?: number) {
		if (this.activate(viewId)) return
		const panes = this.panes
		const source =
			afterViewId === undefined ? undefined : panes.find((item) => item.tabs.includes(afterViewId))
		const pane = source ?? panes.find((item) => item.id === this.lastPaneId) ?? panes[0]
		if (source && afterViewId !== undefined) {
			pane.tabs.splice(pane.tabs.indexOf(afterViewId) + 1, 0, viewId)
		} else {
			pane.tabs.push(viewId)
		}
		pane.selected = viewId
		this.focusPane(pane.id)
	}

	activate(viewId: number): boolean {
		const pane = this.panes.find((item) => item.tabs.includes(viewId))
		if (pane) {
			pane.selected = viewId
			this.focusPane(pane.id)
			return true
		}
		const floating = this.windows.find((item) => item.viewId === viewId)
		if (!floating) return false
		this.focusWindow(floating)
		return true
	}

	/** Move a tab to an insertion index in the destination's current tab order. */
	moveTab(viewId: number, paneId: number, index: number): boolean {
		const panes = this.panes
		const source = panes.find((pane) => pane.tabs.includes(viewId))
		const target = panes.find((pane) => pane.id === paneId)
		if (!source || !target || !Number.isInteger(index) || index < 0 || index > target.tabs.length) {
			return false
		}
		if (source === target) {
			const from = source.tabs.indexOf(viewId)
			const to = index > from ? index - 1 : index
			if (from === to) return false
			source.tabs.splice(from, 1)
			source.tabs.splice(to, 0, viewId)
		} else {
			this.removeTab(source, viewId)
			target.tabs.splice(index, 0, viewId)
			target.selected = viewId
			this.focusPane(target.id)
			this.closeEmptyPane(source.id)
		}
		return true
	}

	split(paneId: number, direction: WorkspaceDirection, viewId?: number): boolean {
		const pane = this.panes.find((item) => item.id === paneId)
		viewId ??= pane?.selected
		if (!pane || viewId === undefined || !pane.tabs.includes(viewId)) return false
		// The tab moves into the new pane, so the old pane must keep at least one tab.
		if (pane.tabs.length < 2) return false
		const second = this.createPane()
		second.selected = viewId
		second.tabs.push(viewId)
		this.removeTab(pane, viewId)
		this.replaceNode(paneId, {
			type: 'split',
			id: this.nextNodeId++,
			direction,
			ratio: 0.5,
			first: pane,
			second,
		})
		this.focusPane(second.id)
		return true
	}

	/**
	 * Split a pane in two and put a view, taken from any pane, alone in the new half:
	 * before the pane (left or top) when `before`, after it otherwise.
	 */
	splitWith(paneId: number, direction: WorkspaceDirection, viewId: number, before = false): boolean {
		const panes = this.panes
		const target = panes.find((item) => item.id === paneId)
		const source = panes.find((item) => item.tabs.includes(viewId))
		if (!target || !source || (source === target && target.tabs.length === 1)) return false
		const created = this.createPane()
		created.tabs.push(viewId)
		created.selected = viewId
		this.removeTab(source, viewId)
		this.replaceNode(paneId, {
			type: 'split',
			id: this.nextNodeId++,
			direction,
			ratio: 0.5,
			first: before ? created : target,
			second: before ? target : created,
		})
		if (source !== target) this.closeEmptyPane(source.id)
		this.focusPane(created.id)
		return true
	}

	float(viewId: number, { width, height }: WorkspaceSize = { width: 640, height: 460 }): boolean {
		const pane = this.panes.find((item) => item.tabs.includes(viewId))
		if (!pane) return false
		// Each new window steps down and across from the last; the first clears the 32px tab bar.
		const step = (this.windows.length % 6) * 24
		const floating = { viewId, bounds: { x: 24 + step, y: 40 + step, width, height }, layer: 0 }
		this.focusPane(pane.id)
		this.removeTab(pane, viewId)
		this.closeEmptyPane(pane.id)
		this.windows.push(floating)
		this.focusWindow(this.windows[this.windows.length - 1])
		return true
	}

	dock(viewId: number): boolean {
		const index = this.windows.findIndex((item) => item.viewId === viewId)
		if (index < 0) return false
		this.windows.splice(index, 1)
		this.open(viewId)
		return true
	}

	close(viewId: number): boolean {
		const pane = this.panes.find((item) => item.tabs.includes(viewId))
		if (pane) {
			this.removeTab(pane, viewId)
			this.closeEmptyPane(pane.id)
			return true
		}
		const index = this.windows.findIndex((item) => item.viewId === viewId)
		if (index < 0) return false
		this.windows.splice(index, 1)
		if (this.focused.type === 'window' && this.focused.id === viewId) {
			this.focusPane(this.lastPaneId)
			if (this.activeViewId === undefined && this.windows.length) {
				const front = this.windows.reduce((a, b) => (a.layer > b.layer ? a : b))
				this.focusWindow(front)
			}
		}
		return true
	}

	closeEmptyPane(paneId: number): boolean {
		const panes = this.panes
		const index = panes.findIndex((pane) => pane.id === paneId)
		if (index < 0 || panes.length === 1 || panes[index].tabs.length) return false
		const neighbor = panes[index + 1] ?? panes[index - 1]
		this.replaceNode(paneId)
		if (this.lastPaneId === paneId) this.lastPaneId = neighbor.id
		if (this.focused.type === 'pane' && this.focused.id === paneId) this.focusPane(neighbor.id)
		return true
	}

	removeTab(pane: WorkspacePaneNode, viewId: number) {
		const index = pane.tabs.indexOf(viewId)
		pane.tabs.splice(index, 1)
		if (pane.selected === viewId) pane.selected = pane.tabs[Math.min(index, pane.tabs.length - 1)]
	}

	replaceNode(id: number, replacement?: WorkspaceNode) {
		const replace = (node: WorkspaceNode): WorkspaceNode | undefined => {
			if (node.id === id) return replacement
			if (node.type === 'pane') return node
			const first = replace(node.first)
			const second = replace(node.second)
			if (!first || !second) return first ?? second
			return first === node.first && second === node.second ? node : { ...node, first, second }
		}
		this.root = replace(this.root) ?? this.createPane()
	}
}

export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value))
}

export function boundWindow(bounds: WorkspaceBounds, area: WorkspaceSize): WorkspaceBounds {
	const width = clamp(bounds.width, Math.min(240, area.width), area.width)
	const height = clamp(bounds.height, Math.min(160, area.height), area.height)
	return {
		x: clamp(bounds.x, 0, area.width - width),
		y: clamp(bounds.y, 0, area.height - height),
		width,
		height,
	}
}
