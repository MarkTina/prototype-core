import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const coreEntries = [
  'src/App.vue',
  'src/core',
  'src/components',
  'src/prototype',
  'src/screens',
  'src/tools',
  'src/types',
]
const sourceExtensions = new Set(['.ts', '.vue'])
const forbiddenImport = /(?:from\s*|import\s*)['"][^'"]*(?:\/product\/|\/pages\/)[^'"]*['"]/g

async function collectFiles(path) {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => [])
  if (!entries.length && sourceExtensions.has(extname(path))) return [path]
  const nested = await Promise.all(entries.map((entry) => {
    const child = join(path, entry.name)
    return entry.isDirectory() ? collectFiles(child) : [child]
  }))
  return nested.flat().filter((file) => sourceExtensions.has(extname(file)))
}

const files = (await Promise.all(coreEntries.map(collectFiles))).flat()
const violations = []

for (const file of files) {
  const source = await readFile(file, 'utf8')
  const matches = source.match(forbiddenImport) ?? []
  for (const match of matches) violations.push(`${relative('.', file)}: ${match}`)
}

if (violations.length) {
  console.error('🚧 [架构边界] 内核禁止直接导入产品目录：')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log(`✅ [架构边界] 已检查 ${files.length} 个内核文件，未发现产品反向依赖`)
