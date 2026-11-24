import { readFile } from 'node:fs/promises'

const cssPath = new URL('../src/workbench/workbench.css', import.meta.url)
const css = await readFile(cssPath, 'utf8')
const firstRuleEnd = css.indexOf('\n.pc-workbench:not([data-workbench-theme=')
const foundations = css.slice(0, firstRuleEnd)
const rules = css.slice(firstRuleEnd)
const declared = new Set([...css.matchAll(/(--pc-[a-z\d-]+)\s*:/g)].map((match) => match[1]))
const errors = new Set()

if (firstRuleEnd === -1 || !foundations.includes('--pc-control:')) {
  errors.add('找不到工作台基础令牌区。')
}

for (const match of css.matchAll(/var\((--pc-[a-z\d-]+)/g)) {
  if (!declared.has(match[1]) && match[1] !== '--pc-phone-zoom') {
    errors.add(`未声明工作台令牌：${match[1]}`)
  }
}

const declarations = rules.replace(/[^{}]*\{/g, '')
for (const match of declarations.matchAll(/#[\da-f]{3,8}\b|\b(?:rgb|hsl|oklch)a?\(\s*\d/gi)) {
  errors.add(`请把颜色值放入基础令牌区：${match[0]}`)
}

for (const match of declarations.matchAll(/\bborder-radius:\s*([^;}]+)/g)) {
  if (!/^\s*(?:0|var\(--pc-r-[a-z-]+\))\s*$/.test(match[1])) {
    errors.add(`请复用工作台圆角令牌：${match[1].trim()}`)
  }
}

if (errors.size) {
  console.error('🚧 [工作台设计] 需要修正以下样式：')
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log(`✅ [工作台设计] 已检查 ${declared.size} 个工作台令牌及新样式的颜色与圆角用法`)
}
