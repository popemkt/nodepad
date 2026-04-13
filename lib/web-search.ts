// Lightweight Exa search adapter for unified web grounding across any AI provider.
// Called directly from the browser — Exa allows CORS and the API key stays in
// localStorage like every other key in the app.

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  publishedDate?: string
}

export async function exaSearch(
  query: string,
  apiKey: string,
  numResults = 5,
): Promise<WebSearchResult[]> {
  const trimmedQuery = query.trim()
  if (!trimmedQuery || !apiKey) return []

  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: trimmedQuery,
      type: "auto",
      num_results: numResults,
      contents: { highlights: { max_characters: 1200 } },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Exa search failed (${res.status}): ${body || res.statusText}`)
  }

  const data = (await res.json().catch(() => null)) as { results?: unknown } | null
  const raw = Array.isArray(data?.results) ? (data!.results as unknown[]) : []

  return raw
    .map((r) => {
      const o = r as Record<string, unknown>
      const highlights = Array.isArray(o.highlights)
        ? (o.highlights as unknown[]).map(String)
        : []
      return {
        title: String(o.title ?? ""),
        url: String(o.url ?? ""),
        snippet: highlights.join(" … ").trim(),
        publishedDate: typeof o.publishedDate === "string" ? o.publishedDate : undefined,
      }
    })
    .filter((r) => r.url)
}

export function formatExaResultsForPrompt(results: WebSearchResult[]): string {
  if (results.length === 0) return ""
  const block = results
    .map((r, i) => {
      const date = r.publishedDate ? ` (${r.publishedDate.slice(0, 10)})` : ""
      return `[${i + 1}] ${r.title}${date}\n${r.url}\n${r.snippet}`
    })
    .join("\n\n")
  return `\n\n## Live Web Search Results
The following sources were retrieved live for this query via web search. Treat them as the primary evidence for any factual claims in your annotation. Cite sources by name only (e.g. "Per LitCharts" or "Per the Studypool summary"). Never generate or guess URLs — the user sees the source list separately as clickable links.

<search_results>
${block}
</search_results>`
}
