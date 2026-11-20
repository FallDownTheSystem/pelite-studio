import { expect, test } from 'vite-plus/test'
import { setupPrompt } from './setup'

test('the prompt for a local page names the download and needs no origin', () => {
	const prompt = setupPrompt(new URL('http://localhost:5173/'))
	expect(prompt).toContain('http://localhost:5173/pelite-studio-bridge.mjs')
	expect(prompt).not.toContain('PELITE_AGENT_ORIGINS')
	expect(prompt).toContain('3. Tell me')
})

test('the prompt for a hosted page tells the agent to allow that site', () => {
	const prompt = setupPrompt(new URL('https://example.github.io/pelite-studio/'))
	expect(prompt).toContain('https://example.github.io/pelite-studio/pelite-studio-bridge.mjs')
	expect(prompt).toContain('PELITE_AGENT_ORIGINS=https://example.github.io')
	expect(prompt).toContain('4. Tell me')
})
