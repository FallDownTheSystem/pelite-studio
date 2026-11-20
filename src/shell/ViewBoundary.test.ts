import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { defineComponent, h } from 'vue'
import { expect, test, vi } from 'vite-plus/test'
import ViewBoundary from './ViewBoundary.vue'

test('a view that throws shows a notice, and the page around it stays', async () => {
	vi.spyOn(console, 'error').mockImplementation(() => {})
	let broken = true
	const View = defineComponent(() => {
		if (broken) throw new Error('Bad section table')
		return () => h('p', 'Sections')
	})
	const Page = defineComponent(
		() => () =>
			h('div', [h('h1', 'Workspace'), h(ViewBoundary, { title: 'Section headers' }, () => h(View))]),
	)
	render(Page)

	const alert = await screen.findByRole('alert')
	expect(alert.textContent).toContain('Section headers stopped because of an error')
	expect(alert.textContent).toContain('Bad section table')
	expect(screen.getByRole('heading', { name: 'Workspace' })).toBeTruthy()

	broken = false
	await userEvent.click(screen.getByRole('button', { name: 'Show view again' }))
	expect(await screen.findByText('Sections')).toBeTruthy()
	expect(screen.queryByRole('alert')).toBeNull()
})
