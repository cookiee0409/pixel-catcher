import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 정적 SPA. base를 './'로 두면 GitHub Pages 등 하위 경로 배포에도 그대로 동작.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true },
});
