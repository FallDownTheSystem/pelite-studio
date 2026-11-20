/** The bridge program as the site publishes it. `tools/agent-bridge/vite-plugin.ts` uses the same name. */
export const bridgeFileName = 'pelite-studio-bridge.mjs'

function isLocal(hostname: string): boolean {
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/**
 * The text a person gives to their agent so that the agent installs the bridge itself.
 * It names this site: the bridge refuses a page from a site it was not told about.
 */
export function setupPrompt(page: URL): string {
	const download = new URL(bridgeFileName, page).href
	const steps = [
		`Download ${download} and save it in a permanent place, for example ~/.pelite-studio/${bridgeFileName}. It is one JavaScript file. It needs Node.js 20 or newer and no packages.`,
		`Add it to your MCP configuration as a stdio server named "pelite-studio". The command is "node" and the only argument is the absolute path of the saved file.`,
	]
	if (!isLocal(page.hostname)) {
		steps.push(
			`Give the server the environment variable PELITE_AGENT_ORIGINS=${page.origin}, so that it accepts this site.`,
		)
	}
	steps.push(
		`Tell me if I must restart you to load the server. When it is loaded, call its list_views tool. The call fails and gives a pairing code: tell me that code, and I type it into PeLite Studio.`,
	)
	return [
		`Install the PeLite Studio agent bridge. It is an MCP server that lets you read and operate PeLite Studio, a Windows PE file inspector that runs in my browser at ${page.origin}${page.pathname}.`,
		'',
		...steps.map((step, index) => `${index + 1}. ${step}`),
	].join('\n')
}
