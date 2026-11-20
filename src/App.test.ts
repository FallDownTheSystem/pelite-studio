import { existsSync, readFileSync } from 'node:fs'
import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createAgent } from '@ui-sdk/vue/agent'
import { expect, test } from 'vite-plus/test'
import App from './App.vue'

// A real PE file keeps the parser in the test. Windows ships this one; other systems skip these tests.
const sample = 'C:/Windows/System32/notepad.exe'

const agent = createAgent()

function components() {
	return agent.snapshot().filter((entry) => !entry.offPage && entry.component !== 'more')
}

async function openSample() {
	const user = userEvent.setup({ pointerEventsCheck: 0 })
	const { container } = render(App)
	await screen.findByRole('button', { name: /Choose file/ })
	const input = container.querySelector<HTMLInputElement>('input[type=file]')!
	await user.upload(input, new File([readFileSync(sample)], 'notepad.exe'))
	await screen.findByRole('tab', { name: 'Summary' }, { timeout: 10_000 })
}

test('the open screen offers one named way to choose a file', async () => {
	render(App)
	await screen.findByRole('button', { name: /Choose file/ })
	const entries = components()
	for (const entry of entries) {
		expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
	}
	expect(entries.map((entry) => entry.label)).toContain('Open a PE file')
})

test.skipIf(!existsSync(sample))(
	'an agent can find the controls of an open file and move around it',
	async () => {
		await openSample()

		const entries = components()
		for (const entry of entries) {
			expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
		}
		const labels = entries.map((entry) => entry.label)
		for (const label of ['Views', 'Open views', 'Go to view or address', 'Close file', 'Open imports']) {
			expect(labels, `${label} is missing from the snapshot`).toContain(label)
		}
		expect(
			labels.filter((label) => label === 'Go to view or address'),
			'two controls share one name',
		).toHaveLength(1)

		const imports = await agent.act({ steps: [{ ref: 'Open imports', action: 'press' }] })
		expect(imports.ok, imports.error?.message).toBe(true)
		await screen.findByRole('tab', { name: 'Imports' })

		const back = await agent.act({ steps: [{ ref: 'Open views', action: 'setValue', args: ['Summary'] }] })
		expect(back.ok, back.error?.message).toBe(true)
		await waitFor(() =>
			expect(screen.getByRole('tab', { name: 'Summary' }).getAttribute('aria-selected')).toBe('true'),
		)

		const palette = await agent.act({ steps: [{ ref: 'Go to view or address', action: 'press' }] })
		expect(palette.ok, palette.error?.message).toBe(true)
		await screen.findByRole('dialog', { name: 'Go to view or address' })
	},
)

// Split, float and duplicate are only in the tab menu, which opens from a context gesture on a tab.
test.skipIf(!existsSync(sample))('an agent can find the tab menu by name', async () => {
	await openSample()
	const menus = components().filter((item) => item.component === 'menu')
	expect(menus.map((entry) => entry.label)).toContain('Tab actions')
})
