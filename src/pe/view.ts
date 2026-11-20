import type { Component, InjectionKey } from 'vue'
import { inject } from 'vue'
import type { WorkspaceSize } from '@/workspace/layout'
import type { PeDocument } from './document'
import type { PeHeaders } from './pelite'

/**
 * What a view shows. `data` reaches the component as its `data` prop without being made reactive,
 * so a view that changes its own state wraps that state in `reactive()` inside `prepare`.
 * `titleSuffix` and `duplicateData` may be getters that read such state.
 */
export interface ViewContent<Data = unknown> {
	data: Data
	titleSuffix?: string | null
	/** Input for `prepare` that reopens this view where it is now. */
	duplicateData?: unknown
	preferredWindowSize?: WorkspaceSize
}

/** Reads everything a view needs from the document. Throws when the data cannot be read. */
export type PrepareView = (doc: PeDocument, input?: never) => ViewContent

export type ViewAvailability = (doc: PeDocument, headers: PeHeaders | undefined) => boolean

export interface ViewDefinition {
	id: string
	title: string
	icon: Component
	/** A singleton view is focused when it is already open; other views open again. */
	singleton: boolean
	component: Component
	prepare: PrepareView
	isAvailable?: ViewAvailability
}

export interface ViewGroup {
	id: string
	title: string | undefined
	views: ViewDefinition[]
}

export type AddressKind = 'rva' | 'va' | 'fo'

export interface AddressValue {
	kind: AddressKind
	value: number | bigint
}

/** Resolve a typed address for viewers that work in the virtual image. */
export function addressToRva(doc: PeDocument, address: AddressValue): number {
	const rva =
		address.kind === 'va'
			? doc.peFile.vaToRva(address.value)
			: address.kind === 'fo'
				? doc.peFile.fileOffsetToRva(Number(address.value))
				: Number(address.value)
	if (rva instanceof Error) throw rva
	return rva
}

export type StatusTone = 'ready' | 'busy' | 'error'

export interface WorkspaceContext {
	readonly doc: PeDocument
	/** Opens a view by its registry id. Singleton views are focused instead of opened twice. */
	openView(id: string, input?: unknown): void
	setStatus(tone: StatusTone, text: string, detail?: string): void
	/** Opens the menu of places an address can be viewed, anchored to an element or a point. */
	showAddressMenu(anchor: Element | { x: number; y: number }, address: AddressValue): void
}

export const workspaceKey: InjectionKey<WorkspaceContext> = Symbol('workspace')

export function useWorkspace(): WorkspaceContext {
	const context = inject(workspaceKey)
	if (!context) throw new Error('useWorkspace() needs a workspace above the component.')
	return context
}
