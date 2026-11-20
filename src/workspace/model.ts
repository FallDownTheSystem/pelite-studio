import { markRaw, reactive, shallowReactive } from 'vue'
import type { PeDocument } from '@/pe/document'
import type { ViewContent, ViewDefinition } from '@/pe/view'
import { WorkspaceLayout } from './layout'

/** A live content view. Window placement and docking belong to the layout. */
export class WorkspaceView {
	readonly id: number
	readonly definition: ViewDefinition
	readonly content: ViewContent

	constructor(id: number, definition: ViewDefinition, content: ViewContent) {
		this.id = id
		this.definition = markRaw(definition)
		this.content = content
		markRaw(this)
	}

	get kind(): string {
		return this.definition.id
	}

	get displayTitle(): string {
		const suffix = this.content.titleSuffix
		return suffix ? `${this.definition.title} · ${suffix}` : this.definition.title
	}
}

/** Owns the live views for one workspace; IDs are never reused within it. */
export class WorkspaceModel {
	readonly views = shallowReactive<WorkspaceView[]>([])
	readonly layout = reactive(new WorkspaceLayout()) as WorkspaceLayout
	private nextViewId = 1

	get activeViewId(): number | undefined {
		return this.layout.activeViewId
	}

	/** Fetches data before allocating an ID or adding the instance. Throws on failure. */
	createView(
		definition: ViewDefinition,
		doc: PeDocument,
		input?: unknown,
		afterViewId?: number,
	): WorkspaceView {
		const content = definition.prepare(doc, input as never)
		const view = new WorkspaceView(this.nextViewId++, definition, content)
		this.views.push(view)
		this.layout.open(view.id, afterViewId)
		return view
	}

	closeView(id: number): boolean {
		const index = this.views.findIndex((view) => view.id === id)
		if (index < 0) return false
		this.layout.close(id)
		this.views.splice(index, 1)
		return true
	}
}
