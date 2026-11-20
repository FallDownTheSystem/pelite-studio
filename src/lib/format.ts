const integer = new Intl.NumberFormat('en-US')

/** `0x1a2b`, or zero-padded to `digits` hex digits: `0x00001a2b`. */
export function hex(value: number | bigint, digits = 0): string {
	return `0x${value.toString(16).padStart(digits, '0')}`
}

/** Header fields read better with a plain `0` than with `0x0`. */
export function hexOrZero(value: number | bigint | null | undefined): string {
	if (value == null) return '-'
	return value === 0 || value === 0n ? '0' : hex(value)
}

/** Hex digits a pointer needs in an image of this bitness. */
export function addressDigits(is64Bit: boolean): number {
	return is64Bit ? 16 : 8
}

export function count(value: number): string {
	return integer.format(value)
}

/** `1,024 bytes`. Exact byte counts matter here more than a rounded unit. */
export function byteCount(value: number): string {
	return `${integer.format(value)} ${value === 1 ? 'byte' : 'bytes'}`
}

const sizeUnits = ['B', 'KiB', 'MiB', 'GiB'] as const

/** `1.5 MiB`, for places where the magnitude matters more than the exact count. */
export function byteSize(value: number): string {
	let unit = 0
	let scaled = value
	while (scaled >= 1024 && unit < sizeUnits.length - 1) {
		scaled /= 1024
		unit++
	}
	const digits = unit === 0 || scaled >= 100 ? 0 : 1
	return `${scaled.toFixed(digits)} ${sizeUnits[unit]}`
}

/** Seconds since the Unix epoch, as PE headers store them, in UTC. */
export function timestamp(seconds: number): string {
	if (!seconds) return '-'
	const date = new Date(seconds * 1000)
	if (Number.isNaN(date.getTime())) return '-'
	return `${date.toISOString().replace('T', ' ').slice(0, 19)} UTC`
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
