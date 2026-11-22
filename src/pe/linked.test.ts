import { expect, test } from 'vite-plus/test'
import { linkedFile } from './linked'

const page = 'https://studio.example/app/'

test('reads the address like a link on the page', () => {
	const relative = linkedFile('?file=samples/zlib1.dll', page)
	expect(relative?.url.href).toBe('https://studio.example/app/samples/zlib1.dll')
	expect(relative?.name).toBe('zlib1.dll')

	const other = linkedFile(`?file=${encodeURIComponent('https://files.example/a/my%20lib.dll?v=2')}`, page)
	expect(other?.url.href).toBe('https://files.example/a/my%20lib.dll?v=2')
	expect(other?.name).toBe('my lib.dll')
})

test('takes the name to show from the address when it gives one', () => {
	const linked = linkedFile('?file=assets/zlib1-Bx3kd9.dll&name=zlib1.dll', page)
	expect(linked?.name).toBe('zlib1.dll')
	expect(linkedFile('?file=https://files.example/', page)?.name).toBe('file')
})

test('names no file without a web address', () => {
	expect(linkedFile('', page)).toBeNull()
	expect(linkedFile('?file=', page)).toBeNull()
	for (const address of ['javascript:alert(1)', 'data:text/plain,MZ', 'blob:https://studio.example/1']) {
		expect(linkedFile(`?file=${encodeURIComponent(address)}`, page), address).toBeNull()
	}
})
