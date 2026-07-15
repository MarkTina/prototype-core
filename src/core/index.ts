import '../style.css'
import { configurePrototypeProduct, configurePrototypeRuntime } from './productAdapter'

export { configurePrototypeProduct, configurePrototypeRuntime } from './productAdapter'
export type {
  MountPrototypeAppOptions,
  ProductStateItem,
  PrototypeNavigationApi,
  PrototypeProductDocument,
  PrototypeProductDefinition,
  PrototypeRuntimeConfig,
  PrototypeUpdateHistoryItem,
} from './productAdapter'
export type * from '../types/prototype'
export { usePrototypeContext } from './contextBridge'

export async function mountPrototypeApp(options: import('./productAdapter').MountPrototypeAppOptions) {
  configurePrototypeProduct(options.product)
  configurePrototypeRuntime(options.runtimeConfig)
  const [{ createApp }, { default: App }] = await Promise.all([
    import('vue'),
    import('../App.vue'),
  ])
  return createApp(App).mount(options.target ?? '#app')
}
