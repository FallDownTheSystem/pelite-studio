import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import IconsResolver from 'unplugin-icons/resolver'
import Icons from 'unplugin-icons/vite'
import Components from 'unplugin-vue-components/vite'
import vueDevTools from 'vite-plugin-vue-devtools'
import { defineConfig, lazyPlugins } from 'vite-plus'
import { agentBridge } from './tools/agent-bridge/vite-plugin'

// https://vite.dev/config/
export default defineConfig({
	base: './',
	fmt: {
		semi: false,
		singleQuote: true,
		useTabs: true,
		printWidth: 110,
		endOfLine: 'crlf',
		// The two declaration files are written by the auto-import plugins on every start.
		ignorePatterns: ['src/vendor/**', 'src/auto-imports.d.ts', 'src/components.d.ts'],
	},
	lint: {
		jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
		rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
		// The linter's type checker cannot read `.vue` modules; `vue-tsc` is the type check of this project.
		options: { typeAware: true, typeCheck: false },
		// The two declaration files are written by the auto-import plugins on every start.
		ignorePatterns: ['src/vendor/**', 'src/auto-imports.d.ts', 'src/components.d.ts'],
	},
	resolve: {
		alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
	},
	// The vendored pelite module uses top-level await and `using` declarations.
	build: { target: 'esnext' },
	test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], css: false },
	plugins: lazyPlugins(() => [
		vue(),
		tailwindcss(),
		vueDevTools(),
		agentBridge(),
		AutoImport({
			imports: ['vue', '@vueuse/core'],
			dirs: ['src/composables'],
			dts: 'src/auto-imports.d.ts',
			vueTemplate: true,
		}),
		Components({
			dts: 'src/components.d.ts',
			dirs: ['src/components'],
			resolvers: [IconsResolver({ prefix: 'Icon' })],
		}),
		Icons({ compiler: 'vue3', autoInstall: true }),
	]),
})
