import { expect, test } from 'vite-plus/test'
import { parseAddress } from './address'

test('reads prefixed hex and plain decimal', () => {
	expect(parseAddress('0x1F40')).toBe(0x1f40n)
	expect(parseAddress(' 0X10 ')).toBe(16n)
	expect(parseAddress('8000')).toBe(8000n)
	expect(parseAddress('0x1400_0100')).toBe(0x14000100n)
	expect(parseAddress('0xffffffffffffffff')).toBe(0xffffffffffffffffn)
})

test('refuses text that is not one number', () => {
	for (const text of ['', '0x', '1F40', 'kernel32', '-5', '0x10 0x20', '1.5']) {
		expect(parseAddress(text), text).toBeNull()
	}
})
