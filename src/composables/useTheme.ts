const storageKey = 'color-scheme'

type Theme = 'light' | 'dark'

const systemDark = usePreferredDark()
const saved = ref<Theme | null>(readSaved())

function readSaved(): Theme | null {
	try {
		const value = localStorage.getItem(storageKey)
		return value === 'light' || value === 'dark' ? value : null
	} catch {
		return null
	}
}

/** Every themed element would otherwise run its color transition at once. */
function withoutTransitions(apply?: () => void) {
	const root = document.documentElement
	root.classList.add('no-transitions')
	apply?.()
	void root.offsetHeight
	requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('no-transitions')))
}

// A page that follows the system flips with no code of ours running, so the guard hangs off the change.
watch(
	systemDark,
	() => {
		if (!saved.value) withoutTransitions()
	},
	{ flush: 'sync' },
)

/**
 * The page follows the system until the user picks a theme. The pick lives in
 * `data-theme` on <html>, which `index.html` also applies before first paint.
 */
export function useTheme() {
	const theme = computed<Theme>(() => saved.value ?? (systemDark.value ? 'dark' : 'light'))

	function set(next: Theme) {
		withoutTransitions(() => {
			saved.value = next
			document.documentElement.dataset.theme = next
			try {
				localStorage.setItem(storageKey, next)
			} catch {
				// Private windows can refuse storage; the theme still applies for this visit.
			}
		})
	}

	function toggle() {
		set(theme.value === 'dark' ? 'light' : 'dark')
	}

	return { theme, set, toggle }
}
