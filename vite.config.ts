import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import packageJson from './package.json'

export default defineConfig({
  plugins: [vue(), dts({ insertTypesEntry: true })],
  define: {
    __GIT_HISTORY__: '[]',
    __APP_GIT_BRANCH__: JSON.stringify(''),
    __CORE_PACKAGE_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    lib: {
      entry: 'src/core/index.ts',
      formats: ['es'],
      fileName: 'index',
      cssFileName: 'style',
    },
    rollupOptions: {
      external: ['vue', '@lucide/vue'],
      output: {
        globals: { vue: 'Vue' },
      },
    },
  },
})
