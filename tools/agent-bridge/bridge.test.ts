// @vitest-environment node
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterAll, beforeAll, expect, test } from 'vite-plus/test'
import { WebSocket } from 'ws'

/*
 * Runs the real bridge program with a real MCP client on one side and a stand-in for the
 * page on the other, so the test covers the whole path of a tool call.
 */
const port = 47990 + Math.floor(Math.random() * 500)
const code = 'TESTCODE'
const origin = 'http://localhost:5173'

let client: Client

beforeAll(async () => {
	client = new Client({ name: 'bridge-test', version: '0.0.0' })
	await client.connect(
		new StdioClientTransport({
			command: process.execPath,
			args: [resolve(process.cwd(), 'tools/agent-bridge/bridge.mjs')],
			env: { ...process.env, PELITE_AGENT_PORT: String(port), PELITE_AGENT_CODE: code } as Record<
				string,
				string
			>,
			stderr: 'ignore',
		}),
	)
})

afterAll(() => client.close())

function text(result: Awaited<ReturnType<Client['callTool']>>): string {
	return (result.content as { text: string }[])[0].text
}

function connectPage(options: { code?: string; origin?: string } = {}) {
	const socket = new WebSocket(`ws://127.0.0.1:${port}/?code=${options.code ?? code}`, {
		origin: options.origin ?? origin,
	})
	const opened = new Promise<void>((done, fail) => {
		socket.once('open', done)
		socket.once('error', fail)
	})
	const closed = new Promise<number>((done) => socket.once('close', done))
	return { socket, opened, closed }
}

test('lists the tools of the page and of the bridge', async () => {
	const { tools } = await client.listTools()
	expect(tools.map((tool) => tool.name)).toEqual([
		'snapshot',
		'act',
		'query',
		'list_views',
		'read_view',
		'open_view',
		'open_file',
	])
})

test('without a page, a tool call says how to connect and gives the code', async () => {
	const result = await client.callTool({ name: 'list_views', arguments: {} })
	expect(result.isError).toBe(true)
	expect(text(result)).toContain(code)
})

test('a page with a wrong code or from another site is refused', async () => {
	expect(await connectPage({ code: 'WRONGCODE' }).closed).toBe(4401)
	expect(await connectPage({ origin: 'https://evil.example' }).closed).toBe(4403)
})

test('a tool call goes to the page and its answer comes back', async () => {
	const page = connectPage()
	await page.opened
	page.socket.on('message', (data, isBinary) => {
		if (isBinary) return
		const call = JSON.parse(String(data))
		const reply =
			call.tool === 'read_view'
				? { id: call.id, result: { view: call.args.view, limit: call.args.limit } }
				: { id: call.id, error: 'No file is open.' }
		page.socket.send(JSON.stringify(reply))
	})

	const read = await client.callTool({ name: 'read_view', arguments: { view: 'imports', limit: 5 } })
	expect(read.isError).toBeFalsy()
	expect(JSON.parse(text(read))).toEqual({ view: 'imports', limit: 5 })

	const failed = await client.callTool({ name: 'open_view', arguments: { view: 'imports' } })
	expect(failed.isError).toBe(true)
	expect(text(failed)).toBe('No file is open.')

	page.socket.close()
	await page.closed
})

test('open_file sends the bytes of the file after the call', async () => {
	const page = connectPage()
	await page.opened
	let call: { id: number; args: { name: string }; binary: boolean } | undefined
	page.socket.on('message', (data, isBinary) => {
		if (!isBinary) {
			call = JSON.parse(String(data))
			return
		}
		const bytes = data as Buffer
		page.socket.send(
			JSON.stringify({ id: call!.id, result: { opened: call!.args.name, size: bytes.length } }),
		)
	})

	const path = resolve(process.cwd(), 'package.json')
	const result = await client.callTool({ name: 'open_file', arguments: { path } })
	expect(result.isError).toBeFalsy()
	expect(JSON.parse(text(result)).opened).toBe('package.json')
	expect(call?.binary).toBe(true)

	const relative = await client.callTool({ name: 'open_file', arguments: { path: 'package.json' } })
	expect(relative.isError).toBe(true)

	page.socket.close()
	await page.closed
})
