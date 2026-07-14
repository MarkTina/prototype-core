import { mountPrototypeApp, type PrototypeRuntimeConfig } from '@marktowin/prototype-core'
import '@marktowin/prototype-core/style.css'
import { product } from './product'

const runtimeConfig: PrototypeRuntimeConfig = {
  versionUpdate: {
    currentVersion: __BUSINESS_APP_VERSION__,
    builtAt: __BUSINESS_APP_BUILT_AT__,
  },
}

void mountPrototypeApp({ target: '#app', product, runtimeConfig })
