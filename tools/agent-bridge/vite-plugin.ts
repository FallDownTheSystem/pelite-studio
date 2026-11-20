import { fileURLToPath } from 'node:url'
import { build, type Plugin } from 'vite-plus'
import { bridgeFileName } from '../../src/agent/setup'

const entry = fileURLToPath(new URL('./bridge.mjs', import.meta.url))

/** Bundles the bridge and everything it imports into one file that needs only Node to run. */
export async function bundleBridge(): Promise<string> {
	const result = await build({
		configFile: false,
		logLevel: 'error',
		ssr: { noExternal: true },
		build: {
			ssr: entry,
			write: false,
			minify: false,
			target: 'node20',
			rolldownOptions: { output: { format: 'es', codeSplitting: false } },
		},
	})
	const outputs = Array.isArray(result) ? result : [result]
	const chunks = outputs.flatMap((item) => ('output' in item ? item.output : []))
	const code = chunks.find((chunk) => chunk.type === 'chunk' && chunk.isEntry)
	if (!code || code.type !== 'chunk' || chunks.filter((chunk) => chunk.type === 'chunk').length !== 1) {
		throw new Error('The agent bridge did not bundle into one file.')
	}
	return code.code
}

/**
 * Publishes the bridge next to the site, so a person can download the program that matches
 * the page they use. The dev server builds it on the first request; a build emits it.
 */
export function agentBridge(): Plugin {
	let cached: Promise<string> | undefined
	return {
		name: 'pelite-studio:agent-bridge',
		async generateBundle() {
			if (this.environment.name !== 'client') return
			this.emitFile({ type: 'asset', fileName: bridgeFileName, source: await bundleBridge() })
		},
		configureServer(server) {
			server.watcher.add(entry)
			server.watcher.on('change', (file) => {
				if (file.replaceAll('\\', '/') === entry.replaceAll('\\', '/')) cached = undefined
			})
			server.middlewares.use((request, response, next) => {
				if (request.url?.split('?')[0] !== `${server.config.base}${bridgeFileName}`) return next()
				cached ??= bundleBridge()
				cached.then(
					(code) => {
						response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
						response.end(code)
					},
					(error: unknown) => {
						cached = undefined
						next(error)
					},
				)
			})
		},
	}
}
