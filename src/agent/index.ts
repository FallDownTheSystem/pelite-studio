import { createAgent, registerTools } from '@ui-sdk/vue/agent'

/**
 * The bridge that lets an AI agent read and operate the controls of the app. It works on the
 * components themselves, so an agent needs no screenshots and no guessed selectors.
 * A control marked `data-agent-confirm` is refused for every agent: a person must press it.
 */
export const agent = createAgent()

/*
 * Publishes the bridge to the agent built into the browser (WebMCP). A browser without
 * `document.modelContext` ignores this.
 */
const unregister = registerTools(agent, { allow: (step) => !step.confirm })

if (import.meta.hot) import.meta.hot.dispose(unregister)

// For a try in the DevTools console: `agent.snapshot()`.
if (import.meta.env.DEV) Object.assign(window, { agent })
