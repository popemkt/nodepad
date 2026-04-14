"use client"

// Vercel AI SDK provider factory.
// Centralises the boilerplate for turning a loaded AIConfig into a ready-to-call
// LanguageModel instance. Every AI workflow file (ai-enrich, ai-chat, ai-ghost,
// ai-critique) calls prepareAICall() instead of hand-rolling fetch + body
// construction.
//
// Provider routing in AI SDK v6:
//  - @ai-sdk/openai is strict-OpenAI-only — used when config.provider === "openai".
//  - @ai-sdk/openai-compatible covers every OpenAI-compatible third-party endpoint
//    (OpenRouter, Z.ai, Fireworks). It speaks the same chat/completions wire format
//    but skips OpenAI-specific assumptions about response_format quirks.

import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { JSONValue, LanguageModel } from "ai"
import {
  getBaseUrl,
  getModelsForProvider,
  type AIConfig,
} from "@/lib/ai-settings"

export interface PrepareAICallOptions {
  enableNativeGrounding?: boolean
}

/** Build a model instance for the given config. Routes to the right provider
 *  package based on whether we're hitting the actual OpenAI API or an
 *  OpenAI-compatible third-party endpoint. */
function getModelInstance(config: AIConfig, modelId: string): LanguageModel {
  if (config.provider === "openai") {
    const provider = createOpenAI({
      apiKey: config.apiKey,
      baseURL: getBaseUrl(config),
    })
    return provider(modelId)
  }
  // OpenRouter, Z.ai, Fireworks — all OpenAI-compatible third-parties.
  const provider = createOpenAICompatible({
    name: config.provider,
    apiKey: config.apiKey,
    baseURL: getBaseUrl(config),
    // OpenRouter requires these headers for ranking on their leaderboard.
    headers: config.provider === "openrouter"
      ? {
          "HTTP-Referer": "https://nodepad.space",
          "X-Title": "nodepad",
        }
      : undefined,
  })
  return provider(modelId)
}

/** Resolve the model id, accounting for native-grounding rewrites:
 *  - OpenRouter: append `:online` to enable Exa-via-OpenRouter
 *  - OpenAI: swap to the `*-search-preview` variant for hosted Bing
 *  Returns the rewritten id and any provider-specific options that need
 *  to be forwarded to the SDK call. */
export function resolveModelIdForCall(
  config: AIConfig,
  options?: PrepareAICallOptions,
): {
  modelId: string
  webSearchOptions?: Record<string, JSONValue | undefined>
} {
  if (options?.enableNativeGrounding === false || config.groundingMode !== "native") {
    return { modelId: config.modelId }
  }
  if (config.provider === "openrouter") {
    const id = config.modelId.endsWith(":online")
      ? config.modelId
      : `${config.modelId}:online`
    return { modelId: id }
  }
  if (config.provider === "openai") {
    const modelDef = getModelsForProvider("openai").find(m => m.id === config.modelId)
    if (modelDef?.groundingModelId) {
      return { modelId: modelDef.groundingModelId, webSearchOptions: {} }
    }
  }
  return { modelId: config.modelId }
}

export interface PreparedAICall {
  /** Ready-to-call LanguageModel instance. Pass to generateText/generateObject/streamText. */
  model: LanguageModel
  /** Provider-specific options to forward via the SDK's `providerOptions` parameter. */
  providerOptions?: Record<string, Record<string, JSONValue | undefined>>
}

/** Build a ready-to-call AI SDK model instance from an AIConfig.
 *  Handles provider client construction, native-grounding model rewrites,
 *  and provider-specific options in one place. */
export function prepareAICall(
  config: AIConfig,
  options?: PrepareAICallOptions,
): PreparedAICall {
  const { modelId, webSearchOptions } = resolveModelIdForCall(config, options)
  return {
    model: getModelInstance(config, modelId),
    providerOptions: webSearchOptions
      ? { openai: { web_search_options: webSearchOptions } }
      : undefined,
  }
}
