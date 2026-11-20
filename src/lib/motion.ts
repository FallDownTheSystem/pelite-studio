/**
 * The motion values of the app, in one place so that things that move together move alike.
 * Motion here explains where something went (a tab, a pane, a window) or confirms an action.
 * Nothing that is used many times a minute animates.
 */

/** Same curve as `--ease-out` in main.css: fast start, soft landing. */
export const easeOut = [0.23, 1, 0.32, 1] as const

/** Seconds, as motion-v takes them. */
export const duration = {
	/** Press and small feedback, such as a copied mark. */
	fast: 0.16,
	/** A part that enters: a drop zone, a notice, a toast. */
	enter: 0.2,
	/** A part that leaves. Shorter than its entrance, so the interface never waits. */
	exit: 0.14,
	/** A large surface that travels: the sidebar, a window that docks. */
	move: 0.24,
	/** One icon that turns into another in place, such as copy into a check mark. */
	iconSwap: 0.3,
} as const

/** The curve for an icon swap: it settles slower than `easeOut`, so the new icon does not snap in. */
export const easeIconSwap = [0.2, 0, 0, 1] as const

/** A tween for a part that enters. */
export const enterTransition = { duration: duration.enter, ease: easeOut } as const

/** A tween for a part that leaves. */
export const exitTransition = { duration: duration.exit, ease: easeOut } as const

/**
 * A spring without overshoot for layout changes: tabs that make room, panes that resize.
 * A spring keeps its velocity when the target changes mid-flight, which a tween cannot.
 */
export const layoutSpring = { type: 'spring', visualDuration: duration.move, bounce: 0 } as const

/** A preview that follows the pointer, such as a drop zone. It is short: a slower spring would trail the pointer. */
export const trackSpring = { type: 'spring', visualDuration: duration.fast, bounce: 0 } as const

/** The start size of a large surface that grows from its trigger. Never zero: nothing real appears from nothing. */
export const nearScale = 0.96
