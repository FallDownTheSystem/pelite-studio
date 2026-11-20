import IconBug from '~icons/lucide/bug'
import IconBinary from '~icons/lucide/binary'
import IconArrowLeftRight from '~icons/lucide/arrow-left-right'
import IconCpu from '~icons/lucide/cpu'
import IconFileCode from '~icons/lucide/file-code'
import IconFileDigit from '~icons/lucide/file-digit'
import IconFileText from '~icons/lucide/file-text'
import IconFingerprint from '~icons/lucide/fingerprint'
import IconFolderTree from '~icons/lucide/folder-tree'
import IconGauge from '~icons/lucide/gauge'
import IconImage from '~icons/lucide/image'
import IconLayers from '~icons/lucide/layers'
import IconLogIn from '~icons/lucide/log-in'
import IconLogOut from '~icons/lucide/log-out'
import IconMoveVertical from '~icons/lucide/move-vertical'
import IconScanSearch from '~icons/lucide/scan-search'
import IconShieldCheck from '~icons/lucide/shield-check'
import IconSlidersHorizontal from '~icons/lucide/sliders-horizontal'
import IconTable from '~icons/lucide/table-2'
import IconTag from '~icons/lucide/tag'
import IconTriangleAlert from '~icons/lucide/triangle-alert'
import IconWaypoints from '~icons/lucide/waypoints'
import AddressConverterView, * as addressConverter from '@/views/AddressConverterView.vue'
import BaseRelocationsView, * as baseRelocations from '@/views/BaseRelocationsView.vue'
import DebugDirectoryView, * as debugDirectory from '@/views/DebugDirectoryView.vue'
import DisasmView, * as disasm from '@/views/DisasmView.vue'
import DosHeaderView, * as dosHeader from '@/views/DosHeaderView.vue'
import ExceptionsView, * as exceptions from '@/views/ExceptionsView.vue'
import ExportsView, * as exports from '@/views/ExportsView.vue'
import FactsView, * as facts from '@/views/FactsView.vue'
import HexDumpView, * as hexDump from '@/views/HexDumpView.vue'
import IconsCursorsView, * as iconsCursors from '@/views/IconsCursorsView.vue'
import ImportsView, * as imports from '@/views/ImportsView.vue'
import LoadConfigView, * as loadConfig from '@/views/LoadConfigView.vue'
import ManifestView, * as manifest from '@/views/ManifestView.vue'
import NtHeadersView, * as ntHeaders from '@/views/NtHeadersView.vue'
import ResourcesView, * as resources from '@/views/ResourcesView.vue'
import RichStructureView, * as richStructure from '@/views/RichStructureView.vue'
import ScannerView, * as scanner from '@/views/ScannerView.vue'
import SectionHeadersView, * as sectionHeaders from '@/views/SectionHeadersView.vue'
import SecurityView, * as security from '@/views/SecurityView.vue'
import SummaryView, * as summary from '@/views/SummaryView.vue'
import TlsView, * as tls from '@/views/TlsView.vue'
import VersionInfoView, * as versionInfo from '@/views/VersionInfoView.vue'
import type { PeDocument } from './document'
import type { PrepareView, ViewAvailability, ViewDefinition, ViewGroup } from './view'

/** Indexes into the optional header's data directory table. */
export const directoryIndex = {
	exports: 0,
	imports: 1,
	resources: 2,
	exceptions: 3,
	security: 4,
	baseRelocations: 5,
	debug: 6,
	tls: 9,
	loadConfig: 10,
} as const

function hasDirectory(index: number): ViewAvailability {
	return (_doc, headers) => !!headers?.DataDirectory[index]?.VirtualAddress
}

/** Each view types its own input; the registry hands inputs through without inspecting them. */
function prepareOf(module: { prepare: (doc: PeDocument, input?: never) => unknown }): PrepareView {
	return module.prepare as PrepareView
}

export const viewGroups: ViewGroup[] = [
	{
		id: 'general',
		title: undefined,
		views: [
			{
				id: 'summary',
				title: 'Summary',
				icon: IconGauge,
				singleton: true,
				component: SummaryView,
				prepare: prepareOf(summary),
			},
		],
	},
	{
		id: 'headers',
		title: 'Headers',
		views: [
			{
				id: 'dos',
				title: 'DOS header',
				icon: IconFileDigit,
				singleton: true,
				component: DosHeaderView,
				prepare: prepareOf(dosHeader),
			},
			{
				id: 'nt',
				title: 'NT headers',
				icon: IconFileText,
				singleton: true,
				component: NtHeadersView,
				prepare: prepareOf(ntHeaders),
			},
			{
				id: 'sections',
				title: 'Section headers',
				icon: IconTable,
				singleton: true,
				component: SectionHeadersView,
				prepare: prepareOf(sectionHeaders),
			},
			{
				id: 'rich',
				title: 'Rich structure',
				icon: IconFingerprint,
				singleton: true,
				component: RichStructureView,
				prepare: prepareOf(richStructure),
				isAvailable: richStructure.isAvailable,
			},
			{
				id: 'exports',
				title: 'Exports',
				icon: IconLogOut,
				singleton: true,
				component: ExportsView,
				prepare: prepareOf(exports),
				isAvailable: hasDirectory(directoryIndex.exports),
			},
			{
				id: 'imports',
				title: 'Imports',
				icon: IconLogIn,
				singleton: true,
				component: ImportsView,
				prepare: prepareOf(imports),
				isAvailable: hasDirectory(directoryIndex.imports),
			},
			{
				id: 'exceptions',
				title: 'Exceptions',
				icon: IconTriangleAlert,
				singleton: true,
				component: ExceptionsView,
				prepare: prepareOf(exceptions),
				isAvailable: hasDirectory(directoryIndex.exceptions),
			},
			{
				id: 'security',
				title: 'Security directory',
				icon: IconShieldCheck,
				singleton: true,
				component: SecurityView,
				prepare: prepareOf(security),
				isAvailable: hasDirectory(directoryIndex.security),
			},
			{
				id: 'relocations',
				title: 'Base relocations',
				icon: IconMoveVertical,
				singleton: true,
				component: BaseRelocationsView,
				prepare: prepareOf(baseRelocations),
				isAvailable: hasDirectory(directoryIndex.baseRelocations),
			},
			{
				id: 'debug',
				title: 'Debug directory',
				icon: IconBug,
				singleton: true,
				component: DebugDirectoryView,
				prepare: prepareOf(debugDirectory),
				isAvailable: hasDirectory(directoryIndex.debug),
			},
			{
				id: 'tls',
				title: 'TLS directory',
				icon: IconWaypoints,
				singleton: true,
				component: TlsView,
				prepare: prepareOf(tls),
				isAvailable: hasDirectory(directoryIndex.tls),
			},
			{
				id: 'load-config',
				title: 'Load configuration',
				icon: IconSlidersHorizontal,
				singleton: true,
				component: LoadConfigView,
				prepare: prepareOf(loadConfig),
				isAvailable: hasDirectory(directoryIndex.loadConfig),
			},
		],
	},
	{
		id: 'resources',
		title: 'Resources',
		views: [
			{
				id: 'resources',
				title: 'Resources',
				icon: IconFolderTree,
				singleton: true,
				component: ResourcesView,
				prepare: prepareOf(resources),
				isAvailable: hasDirectory(directoryIndex.resources),
			},
			{
				id: 'version',
				title: 'Version info',
				icon: IconTag,
				singleton: true,
				component: VersionInfoView,
				prepare: prepareOf(versionInfo),
				isAvailable: versionInfo.isAvailable,
			},
			{
				id: 'manifest',
				title: 'Manifest',
				icon: IconFileCode,
				singleton: true,
				component: ManifestView,
				prepare: prepareOf(manifest),
				isAvailable: manifest.isAvailable,
			},
			{
				id: 'icons-cursors',
				title: 'Icons and cursors',
				icon: IconImage,
				singleton: true,
				component: IconsCursorsView,
				prepare: prepareOf(iconsCursors),
				isAvailable: iconsCursors.isAvailable,
			},
		],
	},
	{
		id: 'analysis',
		title: 'Analysis',
		views: [
			{
				id: 'facts',
				title: 'Facts',
				icon: IconLayers,
				singleton: true,
				component: FactsView,
				prepare: prepareOf(facts),
			},
			{
				id: 'address-converter',
				title: 'Address converter',
				icon: IconArrowLeftRight,
				singleton: true,
				component: AddressConverterView,
				prepare: prepareOf(addressConverter),
			},
			{
				id: 'hex-dump',
				title: 'Hex dump',
				icon: IconBinary,
				singleton: false,
				component: HexDumpView,
				prepare: prepareOf(hexDump),
			},
			{
				id: 'disasm',
				title: 'Disassembly',
				icon: IconCpu,
				singleton: false,
				component: DisasmView,
				prepare: prepareOf(disasm),
				isAvailable: disasm.isAvailable,
			},
			{
				id: 'scanner',
				title: 'Scanner',
				icon: IconScanSearch,
				singleton: false,
				component: ScannerView,
				prepare: prepareOf(scanner),
			},
		],
	},
]

export interface ViewMenuEntry extends ViewDefinition {
	available: boolean
}

export interface ViewMenuGroup {
	id: string
	title: string | undefined
	views: ViewMenuEntry[]
}

/** Availability depends only on the file, so it is evaluated once for each opened document. */
export function createViewMenu(doc: PeDocument): ViewMenuGroup[] {
	const result = doc.peFile.headers()
	const headers = result instanceof Error ? undefined : result
	return viewGroups.map((group) => ({
		...group,
		views: group.views.map((view) => ({
			...view,
			available: view.isAvailable?.(doc, headers) ?? true,
		})),
	}))
}
