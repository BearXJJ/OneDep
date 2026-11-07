import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig(({ mode, command }) => {
  const base = {
    plugins: [vue(), vueDevTools()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  }
  if (command === 'build') return base
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '')
  for (const key of ['ONEDEP_API_URL', 'WEB_HOST', 'WEB_PORT']) {
    if (!env[key]?.trim()) throw new Error('Missing configuration: ' + key)
  }
  const port = Number(env.WEB_PORT)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid WEB_PORT')
  const target = new URL(env.ONEDEP_API_URL!)
  if (!['http:', 'https:'].includes(target.protocol))
    throw new Error('Invalid ONEDEP_API_URL protocol')
  return {
    ...base,
    server: {
      host: env.WEB_HOST!,
      port,
      strictPort: true,
      proxy: { '/api': { target: target.href, changeOrigin: false } },
    },
  }
})
