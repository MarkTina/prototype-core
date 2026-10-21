import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import packageJson from './package.json'

export default defineConfig({
  plugins: [vue(), dts({
    insertTypesEntry: true,
    copyDtsFiles: true,
    include: ['src/**/*.ts', 'src/**/*.vue', 'src/**/*.d.mts'],
    // 共享协议声明需随包提供，仓库构建环境声明仍留在源码侧。
    beforeWriteFile: (filePath) => filePath.endsWith('vite-env.d.ts') ? false : undefined,
  })],
  define: {
    __APP_GIT_BRANCH__: JSON.stringify(''),
    __CORE_PACKAGE_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    lib: {
      entry: { index: 'src/core/index.ts', giteeContents: 'src/prototype/giteeContents.mjs' },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
      cssFileName: 'style',
    },
    rollupOptions: {
      external: ['vue', '@lucide/vue', 'exceljs'],
      output: {
        globals: { vue: 'Vue' },
      },
    },
  },
})
