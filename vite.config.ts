import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [vue(), dts({ insertTypesEntry: true })],
  define: {
    __GIT_HISTORY__: '[]',
    __APP_VERSION__: JSON.stringify('library'),
    __APP_BUILT_AT__: JSON.stringify(''),
    __APP_GIT_BRANCH__: JSON.stringify(''),
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
