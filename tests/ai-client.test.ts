import { describe, expect, it } from "vitest"
import { resolveModelIdForCall } from "@/lib/ai-client"
import type { AIConfig } from "@/lib/ai-settings"

const baseConfig: AIConfig = {
  apiKey: "test-key",
  modelId: "gpt-4o",
  groundingMode: "native",
  provider: "openai",
  customBaseUrl: "",
  exaApiKey: "",
  tone: {
    id: "default",
    name: "Default",
    description: "Default tone",
    instruction: "",
  },
}

describe("resolveModelIdForCall", () => {
  it("rewrites the model when native grounding is enabled", () => {
    expect(resolveModelIdForCall(baseConfig)).toEqual({
      modelId: "gpt-4o-search-preview",
      webSearchOptions: {},
    })
  })

  it("keeps the configured model when native grounding is explicitly disabled", () => {
    expect(
      resolveModelIdForCall(baseConfig, {
        enableNativeGrounding: false,
      }),
    ).toEqual({
      modelId: "gpt-4o",
    })
  })
})
