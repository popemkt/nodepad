"use client"

import { loadAIConfig, getBaseUrl, getProviderHeaders } from "@/lib/ai-settings"
import { parseProviderError } from "@/lib/ai-enrich"
import { applyToneToPrompt } from "@/lib/tone-presets"
import type { ContentType } from "@/lib/content-types"

// Critique tools — features that challenge an existing note rather than
// enriching it. Both functions are one-shot, plain-text or structured-JSON
// completions that reuse whatever provider/grounding the user already
// configured. Failures throw — callers decide whether to surface a toast.

const STEELMAN_SYSTEM_PROMPT = `You are a critical thinking partner embedded in a notetaking tool.

Your job: write the **strongest possible counter-argument** to the user's note. Steelman the opposition — not a strawman, not a list of weak objections, but the most compelling reason a thoughtful person would push back.

Rules:
- 2–4 sentences. Direct and substantive.
- No URLs, no hyperlinks. Reference sources by name only if at all.
- Don't hedge ("on the other hand…", "it could be argued…"). State the counter as if you believe it.
- Don't restate the original note. Get straight to the rebuttal.
- Use markdown sparingly: **bold** for the key tension, *italic* for titles.

## Output Format — CRITICAL
Respond with a single JSON object: {"counter": "<the counter-argument prose>"}.
- No reasoning, no chain-of-thought, no preamble — only the JSON object.
- The "counter" field contains the final 2–4 sentence rebuttal, nothing else.
- No markdown code fences around the JSON.`

const SHORTEN_SYSTEM_PROMPT = `You are an editor embedded in a notetaking tool. Your job: rewrite the user's note as a sharp, title-style fragment.

Rules:
- Maximum 8 words. Aim for 4–6.
- Title-style fragment, NOT a full sentence. No trailing period.
- Preserve the core noun phrase or claim — strip qualifiers, hedges, and connectives.
- Keep proper nouns and numbers exactly as written.
- Do not editorialise, summarise, or add information that wasn't there.
- Match the language of the original note.

## Output Format — CRITICAL
Respond with a single JSON object: {"title": "<the shortened version>"}.
- No reasoning, no chain-of-thought, no preamble — only the JSON object.
- The "title" field contains the shortened text, nothing else.
- No markdown code fences around the JSON.`

const SOCRATIC_SYSTEM_PROMPT = `You are a Socratic prompter embedded in a notetaking tool.

Your job: given a note the user wrote, return **3 sharp questions** that the note raises but does not answer. The kind of questions a thoughtful person would ask themselves before accepting the note as-is — gaps, hidden assumptions, missing distinctions, unexplored implications.

Rules:
- Exactly 3 questions.
- Each question max 15 words. Concrete, not vague ("What evidence?", not "How do we know?").
- Avoid yes/no questions when possible — favour ones that force exploration.
- No questions that just restate the note.
- No questions about the user themselves ("Why do you think X?") — focus on the subject matter.

Output format: a single JSON object {"questions": ["…", "…", "…"]}. No prose, no markdown fences.`

async function callOneShot(systemPrompt: string, userText: string, jsonMode: boolean): Promise<string> {
  const config = loadAIConfig()
  if (!config) throw new Error("No API key configured. Open Settings to add one.")

  const tunedPrompt = applyToneToPrompt(systemPrompt, config.tone)

  const baseUrl = getBaseUrl(config)
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: getProviderHeaders(config),
    body: JSON.stringify({
      model: config.modelId,
      max_tokens: 600,
      temperature: 0.6,
      messages: [
        { role: "system", content: tunedPrompt },
        { role: "user",   content: userText },
      ],
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  })

  if (!response.ok) {
    throw new Error(await parseProviderError(response))
  }

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null
  const choices = data?.choices as Array<{ message?: { content?: string } }> | undefined
  const content = choices?.[0]?.message?.content
  if (!content) throw new Error("No content in response")
  return content
}

/** Generate a counter-argument for a note. Returns prose, ready to become a new note.
 *  Uses JSON mode so "thinking" models (Kimi K2.5 Turbo, DeepSeek R1, etc.) don't
 *  leak chain-of-thought into the response. */
export async function generateSteelman(text: string, contentType: ContentType): Promise<string> {
  const userText = `<note type="${contentType}">${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</note>`
  const raw = await callOneShot(STEELMAN_SYSTEM_PROMPT, userText, true)

  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // Fallback: if the model leaked CoT before the JSON, find the last {...} block
    const lastBrace = cleaned.lastIndexOf("{")
    if (lastBrace !== -1) {
      try { parsed = JSON.parse(cleaned.slice(lastBrace)) } catch { /* ignore */ }
    }
  }

  const counter = (parsed as { counter?: unknown })?.counter
  if (typeof counter === "string" && counter.trim()) {
    return counter.trim()
  }
  // Last-resort fallback: return the raw output as-is. Better than failing entirely.
  throw new Error("Model did not return a valid counter object")
}

/** Shorten a note's text to a title-style fragment. Returns the new text (max ~8 words).
 *  Uses JSON mode so thinking models don't leak chain-of-thought. */
export async function generateShortTitle(text: string, contentType: ContentType): Promise<string> {
  const userText = `<note type="${contentType}">${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</note>`
  const raw = await callOneShot(SHORTEN_SYSTEM_PROMPT, userText, true)

  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    const lastBrace = cleaned.lastIndexOf("{")
    if (lastBrace !== -1) {
      try { parsed = JSON.parse(cleaned.slice(lastBrace)) } catch { /* ignore */ }
    }
  }

  const title = (parsed as { title?: unknown })?.title
  if (typeof title === "string" && title.trim()) {
    // Strip a trailing period if the model added one despite the instruction.
    return title.trim().replace(/\.$/, "")
  }
  throw new Error("Model did not return a valid title object")
}

/** Generate 3 Socratic questions about a note. Returns string[] of length 3 (or fewer if model misbehaves). */
export async function generateSocraticQuestions(text: string, contentType: ContentType): Promise<string[]> {
  const userText = `<note type="${contentType}">${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</note>`
  const raw = await callOneShot(SOCRATIC_SYSTEM_PROMPT, userText, true)

  // Extract JSON object — model may wrap with markdown despite our instructions
  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // Fallback: if the model returned a bare array, accept that too
    try { parsed = JSON.parse(`{"questions":${cleaned}}`) } catch { /* ignore */ }
  }

  const questions = (parsed as { questions?: unknown })?.questions
  if (!Array.isArray(questions)) {
    throw new Error("Model did not return a questions array")
  }
  return questions
    .map(q => String(q ?? "").trim())
    .filter(q => q.length > 0)
    .slice(0, 3)
}
