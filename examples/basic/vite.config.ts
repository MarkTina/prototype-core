import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { execFileSync } from 'node:child_process'

const builtAt = new Date().toISOString()
const commitHash = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return 'nogit'
  }
})()
const appVersion = process.env.BUILD_VERSION?.trim() || `${commitHash}-${builtAt}`
const versionManifest = JSON.stringify({ version: appVersion, builtAt }, null, 2)
const updateHistory = (() => {
  try {
    const output = execFileSync(
      'git',
      ['log', '-20', '--date=short', '--pretty=format:%h%x1f%ad%x1f%s%x1f%b%x1e', 'HEAD'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return output
      .split('\x1e')
      .map((record) => record.trim())
      .filter(Boolean)
      .map((record) => {
        const [hash = '', date = '', message = '', ...detailParts] = record.split('\x1f')
        return { hash, date, message, details: detailParts.join('\x1f').trim() }
      })
      .filter((item) => item.hash && item.date && item.message)
  } catch (error) {
    console.warn('⚠️ [更新历史] 无法读取消费者 Git 提交记录，将使用空历史', error)
    return []
  }
})()

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'prototype-version-manifest',
      configureServer(server) {
        server.middlewares.use('/version.json', (_request, response) => {
          response.setHeader('Content-Type', 'application/json;charset=UTF-8')
          response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
          response.end(versionManifest)
        })
      },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: versionManifest })
      },
    },
  ],
  define: {
    __BUSINESS_APP_VERSION__: JSON.stringify(appVersion),
    __BUSINESS_APP_BUILT_AT__: JSON.stringify(builtAt),
    __BUSINESS_UPDATE_HISTORY__: JSON.stringify(updateHistory),
  },
  server: { host: '0.0.0.0' },
  preview: { host: '0.0.0.0' },
})
