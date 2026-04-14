import { describe, expect, it } from "vitest"
import {
  extractSourceLinksFromResponseBody,
  normalizeSourceLinks,
} from "@/lib/ai-source-links"

describe("normalizeSourceLinks", () => {
  it("maps AI SDK url sources into UI source links", () => {
    const sources = normalizeSourceLinks([
      {
        sourceType: "url",
        url: "https://example.com/article",
        title: "Example Article",
      },
      {
        sourceType: "document",
        title: "Ignored document",
      },
    ])

    expect(sources).toEqual([
      {
        url: "https://example.com/article",
        title: "Example Article",
        siteName: "example.com",
      },
    ])
  })
})

describe("extractSourceLinksFromResponseBody", () => {
  it("extracts legacy url_citation annotations from chat-completions responses", () => {
    const sources = extractSourceLinksFromResponseBody({
      choices: [
        {
          message: {
            annotations: [
              {
                type: "url_citation",
                url_citation: {
                  url: "https://www.example.com/fact",
                  title: "Example Fact",
                },
              },
            ],
          },
        },
      ],
    })

    expect(sources).toEqual([
      {
        url: "https://www.example.com/fact",
        title: "Example Fact",
        siteName: "example.com",
      },
    ])
  })

  it("extracts responses-api web search sources and deduplicates by url", () => {
    const sources = extractSourceLinksFromResponseBody({
      output: [
        {
          action: {
            sources: [
              { type: "url", url: "https://example.com/search-result" },
              { type: "url", url: "https://example.com/search-result" },
            ],
          },
        },
      ],
    })

    expect(sources).toEqual([
      {
        url: "https://example.com/search-result",
        title: "example.com",
        siteName: "example.com",
      },
    ])
  })
})
