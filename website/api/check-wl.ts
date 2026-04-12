import type { IncomingMessage, ServerResponse } from "http"

const SHEET1_CSV_URL =
    "https://docs.google.com/spreadsheets/d/1MG51vLIqnwL6bRRINxsRBKzPAzSaumzdKaq3CwJNySc/export?format=csv"

const SHEET2_CSV_URL =
    "https://docs.google.com/spreadsheets/d/1mYHKHYtrMbw4qz6ZGU6ewxnyQecIZF4N4ZGXNbtOVtU/export?format=csv"

async function getEntries(url: string): Promise<string[]> {
    const response = await fetch(url)
    const text = await response.text()
    return text
        .split("\n")
        .map((line) => line.trim().split(",")[0].trim().toLowerCase())
        .filter(Boolean)
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "", `http://${req.headers.host}`)
    const address = (url.searchParams.get("address") ?? "").trim().toLowerCase()

    if (!address) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Missing address" }))
        return
    }

    try {
        const sheet1 = await getEntries(SHEET1_CSV_URL)
        if (sheet1.includes(address)) {
            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ found: true, sheet: 1 }))
            return
        }

        const sheet2 = await getEntries(SHEET2_CSV_URL)
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ found: sheet2.includes(address), sheet: sheet2.includes(address) ? 2 : undefined }))
    } catch {
        res.writeHead(500, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Failed to check" }))
    }
}
