import { reactive } from 'vue'
import { PeDocument } from '@/pe/document'
import { createViewMenu } from '@/pe/registry'
import { agent } from './index'
import { toPlain } from './plain'
import { agentViews, readForAgent } from './views'

/**
 * The page's end of the local agent bridge (`tools/agent-bridge/bridge.mjs`). The page connects
 * only when the person asks for it and gives the pairing code that the bridge shows the agent.
 */

export const defaultAgentPort = 47821

/** What the bridge needs from the app. `App.vue` provides it. */
export interface AgentHost {
	doc(): PeDocument | null
	/** Opens a file. Resolves with an error text, or null when the file is open. */
	openFile(file: File): Promise<string | null>
	openView(id: string, input?: unknown): void
}

export type AgentLinkStatus = 'off' | 'connecting' | 'connected' | 'failed'

export const agentLink = reactive<{ status: AgentLinkStatus; message: string; port: number }>({
	status: 'off',
	message: '',
	port: defaultAgentPort,
})

let host: AgentHost | null = null
let socket: WebSocket | null = null

export function setAgentHost(next: AgentHost | null) {
	host = next
}

interface Call {
	id: number
	tool: string
	args: Record<string, unknown>
	binary?: boolean
}

const maxResult = 400_000

/**
 * Views keep the document and handles into the parser's memory in their data, for their own
 * use. To an agent these are noise: a handle is one number that means nothing outside the page.
 */
function isInternal(value: object): boolean {
	if (value instanceof PeDocument) return true
	const keys = Object.keys(value)
	return keys.length === 1 && (keys[0] === 'p' || keys[0] === '__wbg_ptr')
}

/** An agent thinks of an address in hex and may send it as text; the views take a number. */
function viewInput(given: unknown): Record<string, unknown> {
	const input = { ...(given as Record<string, unknown> | undefined) }
	if (typeof input.rva === 'string') {
		const rva = Number(input.rva)
		if (!Number.isInteger(rva) || rva < 0) throw new Error('"rva" must be a number or a "0x" string.')
		input.rva = rva
	}
	return input
}

function openDoc(): PeDocument {
	const doc = host?.doc()
	if (!doc) throw new Error('No file is open. Open one with open_file, or ask the person to open one.')
	return doc
}

function findView(doc: PeDocument, id: unknown) {
	const view = createViewMenu(doc)
		.flatMap((group) => group.views)
		.find((item) => item.id === id)
	if (!view) throw new Error(`There is no view "${String(id)}". list_views gives the ids.`)
	if (!view.available) throw new Error(`This file has no data for the view "${view.id}".`)
	return view
}

async function run(call: Call, bytes?: ArrayBuffer): Promise<unknown> {
	const { tool, args } = call
	switch (tool) {
		case 'snapshot':
			return agent.snapshot()
		case 'query':
			return agent.query(args as Parameters<typeof agent.query>[0])
		case 'act':
			return agent.act(args as Parameters<typeof agent.act>[0])
		case 'list_views': {
			const doc = host?.doc()
			if (!doc) return { file: null, views: [] }
			const views = createViewMenu(doc).flatMap((group) => group.views)
			return {
				file: { name: doc.file.name, size: doc.file.size },
				// A view the file has no data for is only named: its note would cost words for nothing.
				views: views
					.filter((view) => view.available)
					.map((view) => ({ id: view.id, title: view.title, ...agentViews[view.id] })),
				notInThisFile: views.filter((view) => !view.available).map((view) => view.id),
			}
		}
		case 'read_view': {
			const doc = openDoc()
			const view = findView(doc, args.view)
			const input = viewInput(args.input)
			const content = view.prepare(doc, input as never)
			let data = readForAgent(view.id, content.data, doc, input)
			if (typeof args.pick === 'string') {
				// One part of a large view, so an agent that needs one table does not pay for all of them.
				const parts = (data ?? {}) as Record<string, unknown>
				if (!(args.pick in parts)) {
					throw new Error(
						`"${view.id}" has no part "${args.pick}". Its parts: ${Object.keys(parts).join(', ')}.`,
					)
				}
				data = { [args.pick]: parts[args.pick] }
			}
			const plain = toPlain(data, {
				offset: args.offset as number | undefined,
				limit: args.limit as number | undefined,
				skip: isInternal,
			})
			const size = JSON.stringify(plain).length
			if (size > maxResult) {
				throw new Error(
					`The data of "${view.id}" is ${size} characters with this limit. Call read_view again with a smaller limit.`,
				)
			}
			return plain
		}
		case 'open_view': {
			const doc = openDoc()
			const view = findView(doc, args.view)
			if (!host) throw new Error('PeLite Studio is not ready.')
			host.openView(view.id, viewInput(args.input))
			return { opened: view.id, title: view.title, input: viewInput(args.input) }
		}
		case 'open_file': {
			if (!host || !bytes) throw new Error('PeLite Studio is not ready to open a file.')
			const name = String(args.name ?? 'file')
			const error = await host.openFile(new File([bytes], name))
			if (error) throw new Error(error)
			return { opened: name, size: bytes.byteLength }
		}
		default:
			throw new Error(`PeLite Studio has no tool "${tool}".`)
	}
}

function closeMessage(event: CloseEvent, wasOpen: boolean): string {
	if (event.code === 4401) return 'The pairing code is not correct. Ask the agent for its code again.'
	if (event.code === 4403) {
		return `The bridge does not accept this site. Start it with PELITE_AGENT_ORIGINS=${location.origin}.`
	}
	if (event.code === 4409) return 'Another PeLite Studio tab took over the connection.'
	if (wasOpen) return 'The agent bridge stopped.'
	return `No agent bridge answers on port ${agentLink.port}. Start your agent first, then try again.`
}

export function connectAgent(code: string, port: number) {
	disconnectAgent()
	agentLink.port = port
	agentLink.status = 'connecting'
	agentLink.message = ''
	let wasOpen = false
	let pending: Call | null = null
	const next = new WebSocket(`ws://127.0.0.1:${port}/?code=${encodeURIComponent(code.trim())}`)
	next.binaryType = 'arraybuffer'
	socket = next

	function answer(call: Call, work: Promise<unknown>) {
		work.then(
			(result) => next.send(JSON.stringify({ id: call.id, result: result ?? null })),
			(error: unknown) =>
				next.send(
					JSON.stringify({ id: call.id, error: error instanceof Error ? error.message : String(error) }),
				),
		)
	}

	next.addEventListener('open', () => {
		wasOpen = true
		agentLink.status = 'connected'
	})
	next.addEventListener('message', (event) => {
		if (typeof event.data !== 'string') {
			// The bytes of a file follow the open_file call that announced them.
			const call = pending
			pending = null
			if (call) answer(call, run(call, event.data as ArrayBuffer))
			return
		}
		const call = JSON.parse(event.data) as Call
		if (call.binary) pending = call
		else answer(call, run(call))
	})
	next.addEventListener('close', (event) => {
		if (socket !== next) return
		socket = null
		agentLink.status = 'failed'
		agentLink.message = closeMessage(event, wasOpen)
	})
}

export function disconnectAgent() {
	const current = socket
	socket = null
	current?.close()
	agentLink.status = 'off'
	agentLink.message = ''
}
