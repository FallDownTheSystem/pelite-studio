import { expect, test } from 'vite-plus/test'
import { WorkspaceLayout } from './layout'

function withTabs(...ids: number[]) {
	const layout = new WorkspaceLayout()
	for (const id of ids) layout.open(id)
	return layout
}

test('a new view opens as the selected tab of the focused pane', () => {
	const layout = withTabs(1, 2)
	expect(layout.panes).toHaveLength(1)
	expect(layout.panes[0].tabs).toEqual([1, 2])
	expect(layout.activeViewId).toBe(2)
})

test('a duplicate opens next to its source', () => {
	const layout = withTabs(1, 2)
	layout.open(3, 1)
	expect(layout.panes[0].tabs).toEqual([1, 3, 2])
})

test('opening a view that is open only brings it forward', () => {
	const layout = withTabs(1, 2)
	layout.open(1)
	expect(layout.panes[0].tabs).toEqual([1, 2])
	expect(layout.activeViewId).toBe(1)
})

test('split moves one tab into a new pane and keeps the rest', () => {
	const layout = withTabs(1, 2)
	const pane = layout.panes[0]
	expect(layout.split(pane.id, 'row', 2)).toBe(true)
	expect(layout.panes.map((item) => item.tabs)).toEqual([[1], [2]])
})

test('splitWith can put the moved tab first', () => {
	const layout = withTabs(1, 2)
	expect(layout.splitWith(layout.panes[0].id, 'column', 2, true)).toBe(true)
	expect(layout.panes.map((item) => item.tabs)).toEqual([[2], [1]])
})

test('splitWith refuses to split a pane with its only tab', () => {
	const layout = withTabs(1)
	expect(layout.splitWith(layout.panes[0].id, 'row', 1)).toBe(false)
	expect(layout.panes).toHaveLength(1)
})

test('split refuses a pane with one tab, because it would leave an empty pane', () => {
	const layout = withTabs(1)
	expect(layout.split(layout.panes[0].id, 'column', 1)).toBe(false)
	expect(layout.panes.map((item) => item.tabs)).toEqual([[1]])
})

test('closing the last tab of a split pane removes the pane', () => {
	const layout = withTabs(1, 2)
	layout.split(layout.panes[0].id, 'row', 2)
	expect(layout.close(2)).toBe(true)
	expect(layout.panes.map((item) => item.tabs)).toEqual([[1]])
	expect(layout.activeViewId).toBe(1)
})

test('a floated view leaves its pane and returns when docked', () => {
	const layout = withTabs(1, 2)
	expect(layout.float(2)).toBe(true)
	expect(layout.panes[0].tabs).toEqual([1])
	expect(layout.activeViewId).toBe(2)
	expect(layout.dock(2)).toBe(true)
	expect(layout.panes.flatMap((item) => item.tabs).sort()).toEqual([1, 2])
})
