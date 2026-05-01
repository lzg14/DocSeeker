import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), {
      name: 'copy-python-ocr',
      closeBundle() {
        // Copy Python OCR script to output directory
        const src = resolve(__dirname, 'electron/main/extractOcr.py')
        const dest = resolve(__dirname, 'out/main/extractOcr.py')
        fs.copyFileSync(src, dest)
      }
    }],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main/index.ts'),
          scanWorker: resolve(__dirname, 'electron/main/scanWorker.ts'),
          shardLoader: resolve(__dirname, 'electron/main/shardLoader.ts'),
          contentWorker: resolve(__dirname, 'electron/main/contentWorker.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html')
        }
      }
    },
    plugins: [react()]
  }
})