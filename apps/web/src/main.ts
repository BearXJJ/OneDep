import { createApp } from 'vue'
import { createPinia } from 'pinia'

import { ElMessage } from 'element-plus/es/components/message/index'
import 'element-plus/es/components/message/style/css'
import App from './App.vue'
import router from './router'
import './assets/styles/global.less'

const app = createApp(App)

function reportError(error: unknown) {
  console.error(error)
  ElMessage.error({
    message: error instanceof Error ? error.message : String(error),
    duration: 0,
    showClose: true,
  })
}
app.config.errorHandler = reportError
router.onError(reportError)
app.use(createPinia())
app.use(router)

app.mount('#app')
