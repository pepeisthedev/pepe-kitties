import type { IncomingMessage, ServerResponse } from "http"

const SHEET_CSV_URL =
    "https://docs.google.com/spreadsheets/d/1MG51vLIqnwL6bRRINxsRBKzPAzSaumzdKaq3CwJNySc/export?format=csv"

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "", `http://${req.headers.host}`)
    const address = (url.searchParams.get("address") ?? "").trim().toLowerCase()

    if (!address) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Missing address" }))
        return
    }

    try {
        const response = await fetch(SHEET_CSV_URL)
        const text = await response.text()
        const entries = text
            .split("\n")
            .map((line) => line.trim().split(",")[0].trim().toLowerCase())
            .filter(Boolean)

        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ found: entries.includes(address) }))
    } catch {
        res.writeHead(500, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Failed to check" }))
    }
}
