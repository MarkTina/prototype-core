let activeContext: Record<string, any> | undefined

export function setActivePrototypeContext(context: Record<string, any>) {
  activeContext = context
}

export function usePrototypeContext(): Record<string, any> {
  if (!activeContext) throw new Error('🧩 [产品适配] 原型上下文尚未初始化')
  return activeContext
}
