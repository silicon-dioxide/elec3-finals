import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { createReadStream } from 'node:fs'
import { cp, stat } from 'node:fs/promises'
import { extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const exhibitDir = fileURLToPath(new URL('../exhibit/', import.meta.url))

function sharedExhibitAssets() {
  return {
    name: 'shared-exhibit-assets',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()

        let pathname
        try {
          pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
        } catch {
          return next()
        }
        if (!pathname.startsWith('/exhibit/')) return next()

        const file = resolve(exhibitDir, pathname.slice('/exhibit/'.length))
        const pathFromExhibit = relative(exhibitDir, file)
        if (pathFromExhibit.startsWith(`..${sep}`) || pathFromExhibit === '..') return next()

        try {
          const fileInfo = await stat(file)
          if (!fileInfo.isFile()) return next()

          const contentType = {
            '.json': 'application/json',
            '.mp3': 'audio/mpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
          }[extname(file).toLowerCase()] ?? 'application/octet-stream'
          res.setHeader('Content-Type', contentType)

          const range = extname(file).toLowerCase() === '.mp3' && req.headers.range
          if (range) {
            const match = /^bytes=(\d*)-(\d*)$/.exec(range)
            if (!match) {
              res.statusCode = 416
              res.setHeader('Content-Range', `bytes */${fileInfo.size}`)
              return res.end()
            }

            const start = match[1] ? Number(match[1]) : Math.max(0, fileInfo.size - Number(match[2]))
            const end = match[2] ? Math.min(Number(match[2]), fileInfo.size - 1) : fileInfo.size - 1
            if (start > end || start >= fileInfo.size) {
              res.statusCode = 416
              res.setHeader('Content-Range', `bytes */${fileInfo.size}`)
              return res.end()
            }

            res.statusCode = 206
            res.setHeader('Accept-Ranges', 'bytes')
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileInfo.size}`)
            res.setHeader('Content-Length', end - start + 1)
            if (req.method === 'HEAD') return res.end()
            return createReadStream(file, { start, end }).pipe(res)
          }

          res.setHeader('Content-Length', fileInfo.size)
          if (req.method === 'HEAD') return res.end()
          createReadStream(file).pipe(res)
        } catch {
          next()
        }
      })
    },
    async writeBundle(outputOptions) {
      await cp(exhibitDir, resolve(outputOptions.dir, 'exhibit'), { recursive: true })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), sharedExhibitAssets()],
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [fileURLToPath(new URL('..', import.meta.url))],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
