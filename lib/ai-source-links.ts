export interface SourceLink {
  url: string
  title: string
  siteName: string
}

function getSiteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

function toSourceLink(url: string, title?: string): SourceLink {
  const siteName = getSiteName(url)
  return {
    url,
    title: title || siteName || url,
    siteName,
  }
}

function extractLink(candidate: unknown): SourceLink | null {
  if (!candidate || typeof candidate !== "object") return null

  const record = candidate as Record<string, unknown>

  if (
    (record.type === "url" || record.sourceType === "url") &&
    typeof record.url === "string"
  ) {
    return toSourceLink(record.url, typeof record.title === "string" ? record.title : undefined)
  }

  if (record.type === "url_citation") {
    if (typeof record.url === "string") {
      return toSourceLink(record.url, typeof record.title === "string" ? record.title : undefined)
    }

    const nested = record.url_citation
    if (nested && typeof nested === "object") {
      const citation = nested as Record<string, unknown>
      if (typeof citation.url === "string") {
        return toSourceLink(citation.url, typeof citation.title === "string" ? citation.title : undefined)
      }
    }
  }

  return null
}

function dedupeSourceLinks(links: SourceLink[]): SourceLink[] | undefined {
  const seen = new Set<string>()
  const deduped = links.filter(link => {
    if (seen.has(link.url)) return false
    seen.add(link.url)
    return true
  })
  return deduped.length > 0 ? deduped : undefined
}

export function normalizeSourceLinks(sources: unknown): SourceLink[] | undefined {
  if (!Array.isArray(sources)) return undefined

  const links = sources
    .map(extractLink)
    .filter((link): link is SourceLink => link !== null)

  return dedupeSourceLinks(links)
}

export function extractSourceLinksFromResponseBody(body: unknown): SourceLink[] | undefined {
  const links: SourceLink[] = []

  const visit = (value: unknown) => {
    const directLink = extractLink(value)
    if (directLink) {
      links.push(directLink)
    }

    if (!value || typeof value !== "object") return

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item)
      }
      return
    }

    for (const nested of Object.values(value)) {
      visit(nested)
    }
  }

  visit(body)
  return dedupeSourceLinks(links)
}
