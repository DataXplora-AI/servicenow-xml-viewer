import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // 5183 para quien lanza `npm run dev` a mano; si algo asigna un puerto por PORT
  // (varias sesiones a la vez, por ejemplo), se respeta en vez de chocar.
  server: { port: Number(process.env.PORT) || 5183 }
})
