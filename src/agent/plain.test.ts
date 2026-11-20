import { expect, test } from 'vite-plus/test'
import { toPlain } from './plain'

test('values that JSON cannot carry become plain values', () => {
	const plain = toPlain({
		base: 0x180000000n,
		bytes: new Uint8Array([0x4d, 0x5a, 0x90]),
		when: new Date(0),
		run: () => 1,
		missing: undefined,
		ratio: Number.NaN,
	})
	expect(plain).toEqual({
		base: '0x180000000',
		bytes: { bytes: 3, hex: '4d 5a 90' },
		when: '1970-01-01T00:00:00.000Z',
		missing: null,
		ratio: 'NaN',
	})
	expect(() => JSON.stringify(plain)).not.toThrow()
})

test('a long list comes back as one page with its total', () => {
	const rows = Array.from({ length: 500 }, (_, index) => ({ index }))
	expect(toPlain({ rows }, { offset: 100, limit: 3 })).toEqual({
		rows: { total: 500, offset: 100, items: [{ index: 100 }, { index: 101 }, { index: 102 }] },
	})
	expect(toPlain({ rows: rows.slice(0, 3) }, { limit: 3 })).toEqual({
		rows: [{ index: 0 }, { index: 1 }, { index: 2 }],
	})
})

test('a typed array of values reads as a list of numbers', () => {
	expect(toPlain({ rvas: new Uint32Array([4096, 8192, 12288]) }, { limit: 2 })).toEqual({
		rvas: { total: 3, offset: 0, items: [4096, 8192] },
	})
})

test('a cycle ends, and one object in two places is shown twice', () => {
	const shared = { name: '.text' }
	const root: Record<string, unknown> = { first: shared, second: shared }
	root.self = root
	expect(toPlain(root)).toEqual({ first: { name: '.text' }, second: { name: '.text' }, self: '[circular]' })
})

test('long byte runs and long text are cut and say so', () => {
	const plain = toPlain({ data: new Uint8Array(1000), text: 'a'.repeat(20_005) }) as {
		data: { bytes: number; truncated?: boolean }
		text: string
	}
	expect(plain.data.bytes).toBe(1000)
	expect(plain.data.truncated).toBe(true)
	expect(plain.text.endsWith('[5 more characters]')).toBe(true)
})
