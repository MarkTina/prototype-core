import { mountPrototypeApp, type PrototypeRuntimeConfig } from '@marktowin/prototype-core'
import '@marktowin/prototype-core/style.css'
import { product } from './product'

const runtimeConfig: PrototypeRuntimeConfig = {
  versionUpdate: {
    currentVersion: __BUSINESS_APP_VERSION__,
    builtAt: __BUSINESS_APP_BUILT_AT__,
  },
}

async function mountExample() {
  const demo = new URLSearchParams(location.search).get('demo')
  if (demo === 'bugs' || (import.meta.env.DEV && demo === null)) {
    const { bugDemoProjectId, seedBugDemo } = await import('./bug-demo')
    runtimeConfig.collaboration = { projectId: bugDemoProjectId }
    seedBugDemo()
  }
  await mountPrototypeApp({ target: '#app', product, runtimeConfig })
}

void mountExample()
