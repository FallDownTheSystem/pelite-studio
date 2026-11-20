import type { MenuController } from '@ui-sdk/vue/menu'
import { inject, type Component, type InjectionKey } from 'vue'
import type { WorkspaceLayout, WorkspaceSize } from './layout'

export interface WorkspaceViewInfo {
	id: number
	title: string
	/** A 16px icon component, shown in the tab and the window title. */
	icon: Component
	preferredWindowSize?: WorkspaceSize
}

/** Where a dragged tab lands on a pane body: an edge splits the pane, the center moves the tab in. */
export type WorkspaceDropZone = 'start' | 'end' | 'top' | 'bottom' | 'center'

/** How a floating window leaves: back into a tab, or closed with its view. */
export type WorkspaceWindowExit = 'dock' | 'close'

/** What WorkspaceArea shares with the panes, tab bars and windows inside it. */
export interface WorkspaceContext {
	layout: WorkspaceLayout
	/** MIME type of a tab drag, unique to one area so tabs never cross into another area. */
	tabDragType: string
	view(id: number): WorkspaceViewInfo | undefined
	/** The view being dragged from a tab bar of this area, if any. */
	draggedView(): number | undefined
	/** The drawn width of the dragged tab, so a tab bar can open a gap that fits it. */
	draggedTabWidth(): number
	/** The dragged view once its tab is drawn as lifted out of its bar. Reactive. */
	liftedView(): number | undefined
	startTabDrag(event: DragEvent, id: number): void
	registerOutlet(key: string, element: HTMLElement): void
	unregisterOutlet(key: string, element: HTMLElement): void
	select(id: number): void
	close(id: number): void
	moveTab(paneId: number, id: number, index: number): void
	dropOnPane(paneId: number, id: number, zone: WorkspaceDropZone): void
	closePane(paneId: number): void
	/** The tab menu, opened with the tab's view ID as its payload. */
	tabMenu: MenuController<number>
}

export const workspaceContextKey: InjectionKey<WorkspaceContext> = Symbol('workspace')

export function useWorkspace(): WorkspaceContext {
	const context = inject(workspaceContextKey)
	if (!context) throw new Error('Workspace parts must be rendered inside WorkspaceArea')
	return context
}

/** Outlet key of a view docked in a pane; each pane has one outlet per tab. */
export function paneOutletKey(paneId: number, viewId: number): string {
	return `pane-${paneId}-${viewId}`
}

export function windowOutletKey(viewId: number): string {
	return `window-${viewId}`
}
