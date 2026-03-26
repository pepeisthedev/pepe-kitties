import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite";

const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1MG51vLIqnwL6bRRINxsRBKzPAzSaumzdKaq3CwJNySc/export?format=csv"

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
          const response = await fetch(SHEET_CSV_URL)
          const text = await response.text()
          const entries = text
            .split('\n')
            .map(line => line.trim().split(',')[0].trim().toLowerCase())
            .filter(Boolean)
          res.end(JSON.stringify({ found: entries.includes(address) }))
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
