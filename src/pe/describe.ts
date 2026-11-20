import type { PeHeaders } from './pelite'

const machines: Record<number, string> = {
	0x14c: 'x86',
	0x8664: 'x64',
	0xaa64: 'ARM64',
	0x1c0: 'ARM',
	0x1c4: 'ARMv7',
	0x200: 'IA-64',
	0xebc: 'EFI bytecode',
	0x5032: 'RISC-V 32',
	0x5064: 'RISC-V 64',
}

const fileDll = 0x2000
const subsystemNative = 1

export interface ImageDescription {
	/** `PE32` or `PE32+`. */
	format: string
	machine: string
	/** `DLL`, `Driver` or `Executable`. */
	type: string
	is64Bit: boolean
}

/** The three facts a reader wants about a binary before anything else. */
export function describeImage(headers: PeHeaders): ImageDescription {
	const { FileHeader, OptionalHeader } = headers.NtHeaders
	const is64Bit = OptionalHeader.Magic === 0x20b
	const type =
		FileHeader.Characteristics & fileDll
			? 'DLL'
			: OptionalHeader.Subsystem === subsystemNative
				? 'Driver'
				: 'Executable'
	return {
		format: is64Bit ? 'PE32+' : 'PE32',
		machine: machines[FileHeader.Machine] ?? `machine 0x${FileHeader.Machine.toString(16)}`,
		type,
		is64Bit,
	}
}

/** Machines the bundled disassembler understands. */
export function canDisassemble(headers: PeHeaders): boolean {
	return [0x14c, 0x8664].includes(headers.NtHeaders.FileHeader.Machine)
}
