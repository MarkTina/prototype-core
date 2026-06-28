import { Home, Monitor } from '@lucide/vue'
import type { PrototypeProductDefinition } from '@marktowin/prototype-core'
import MobileHome from './screens/MobileHome.vue'
import PcDashboard from './screens/PcDashboard.vue'

export const product: PrototypeProductDefinition = {
  pages: [
    {
      id: 'mobileHome',
      platform: 'mobile',
      code: 'M1',
      title: '移动端首页',
      subtitle: '最小移动端接入示例',
      icon: Home,
      component: MobileHome,
      hasTabBar: true,
    },
    {
      id: 'pcDashboard',
      platform: 'pc',
      code: 'PC1',
      title: 'PC 工作台',
      subtitle: '1920×1080 基准画布示例',
      icon: Monitor,
      component: PcDashboard,
    },
  ],
  states: {
    mobileHome: [
      { id: 'ready', labelKey: 'stateReady' },
      { id: 'empty', labelKey: 'stateEmpty' },
    ],
  },
  copy: {
    zh: { stateReady: '正常态', stateEmpty: '空状态' },
    en: { stateReady: 'Ready', stateEmpty: 'Empty' },
  },
  flows: {
    version: '1.0.0',
    flows: [
      {
        id: 'basicFlow',
        title: '基础跨端流程',
        subtitle: '移动端到 PC',
        rows: [[{ screenId: 'mobileHome', stateId: 'ready' }, { screenId: 'pcDashboard' }]],
      },
    ],
  },
}
