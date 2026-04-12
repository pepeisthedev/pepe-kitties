import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite";

const SHEET1_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1MG51vLIqnwL6bRRINxsRBKzPAzSaumzdKaq3CwJNySc/export?format=csv"

const SHEET2_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1mYHKHYtrMbw4qz6ZGU6ewxnyQecIZF4N4ZGXNbtOVtU/export?format=csv"

async function getEntries(url) {
  const response = await fetch(url)
  const text = await response.text()
  return text
    .split('\n')
    .map(line => line.trim().split(',')[0].trim().toLowerCase())
    .filter(Boolean)
}

function checkWLPlugin() {
  return {
    name: 'check-wl',
    configureServer(server) {
      server.middlewares.use('/api/check-wl', async (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`)
        const address = (url.searchParams.get('address') ?? '').trim().toLowerCase()
        res.setHeader('Content-Type', 'application/json')
        if (!address) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Missing address' }))
          return
        }
        try {
          const sheet1 = await getEntries(SHEET1_CSV_URL)
          if (sheet1.includes(address)) {
            res.end(JSON.stringify({ found: true, sheet: 1 }))
            return
          }
          const sheet2 = await getEntries(SHEET2_CSV_URL)
          res.end(JSON.stringify({ found: sheet2.includes(address), sheet: sheet2.includes(address) ? 2 : undefined }))
        } catch {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'Failed to check' }))
        }
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), checkWLPlugin()],
})
