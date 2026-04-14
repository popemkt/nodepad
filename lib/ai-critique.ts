"use client"

import { generateObject, NoObjectGeneratedError } from "ai"
import { z } from "zod"
import { loadAIConfig } from "@/lib/ai-settings"
import { prepareAICall } from "@/lib/ai-client"
import { applyToneToPrompt } from "@/lib/tone-presets"
import type { ContentType } from "@/lib/content-types"

// Critique tools — features that challenge an existing note rather than
// enriching it. Every helper is a one-shot generateObject call returning a
// strict Zod-validated envelope. Structured output is critical here because
// thinking models (Kimi K2.5 Turbo, DeepSeek R1, etc.) leak chain-of-thought
// into plain text responses but suppress it under structured output.

const STEELMAN_SYSTEM_PROMPT = `You are a critical thinking partner embedded in a notetaking tool.

Your job: write the **strongest possible counter-argument** to the user's note. Steelman the opposition — not a strawman, not a list of weak objections, but the most compelling reason a thoughtful person would push back.

Rules:
- 2–4 sentences. Direct and substantive.
- No URLs, no hyperlinks. Reference sources by name only if at all.
- Don't hedge ("on the other hand…", "it could be argued…"). State the counter as if you believe it.
- Don't restate the original note. Get straight to the rebuttal.
- Use markdown sparingly: **bold** for the key tension, *italic* for titles.`

const SHORTEN_SYSTEM_PROMPT = `You are an editor embedded in a notetaking tool. Your job: rewrite the user's note as a sharp, title-style fragment.

Rules:
- Maximum 8 words. Aim for 4–6.
- Title-style fragment, NOT a full sentence. No trailing period.
- Preserve the core noun phrase or claim — strip qualifiers, hedges, and connectives.
- Keep proper nouns and numbers exactly as written.
- Do not editorialise, summarise, or add information that wasn't there.
- Match the language of the original note.`

const SOCRATIC_SYSTEM_PROMPT = `You are a Socratic prompter embedded in a notetaking tool.

Your job: given a note the user wrote, return **3 sharp questions** that the note raises but does not answer. The kind of questions a thoughtful person would ask themselves before accepting the note as-is — gaps, hidden assumptions, missing distinctions, unexplored implications.

Rules:
- Exactly 3 questions.
- Each question max 15 words. Concrete, not vague ("What evidence?", not "How do we know?").
- Avoid yes/no questions when possible — favour ones that force exploration.
- No questions that just restate the note.
- No questions about the user themselves ("Why do you think X?") — focus on the subject matter.`

const SteelmanSchema = z.object({
  counter: z.string().describe("The 2–4 sentence counter-argument prose"),
})

const ShortenSchema = z.object({
  title: z.string().describe("The shortened title-style fragment, max 8 words, no trailing period"),
})

const SocraticSchema = z.object({
  questions: z.array(z.string()).length(3).describe("Exactly 3 sharp questions, max 15 words each"),
})

interface CritiqueCallOptions<T extends z.AnyZodObject> {
  systemPrompt: string
  userText: string
  schema: T
  schemaName: string
}

async function critiqueCall<T extends z.AnyZodObject>(
  opts: CritiqueCallOptions<T>,
): Promise<z.infer<T>> {
  const config = loadAIConfig()
  if (!config) throw new Error("No API key configured. Open Settings to add one.")

  const tunedPrompt = applyToneToPrompt(opts.systemPrompt, config.tone)
  const { model, providerOptions } = prepareAICall(config, {
    enableNativeGrounding: false,
  })

  try {
    const { object } = await generateObject({
      model,
      output: "object",
      schema: opts.schema,
      schemaName: opts.schemaName,
      system: tunedPrompt,
      prompt: opts.userText,
      temperature: 0.6,
      maxOutputTokens: 600,
      ...(providerOptions ? { providerOptions } : {}),
    })
    return object
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      throw new Error(`Model did not return valid output: ${err.text?.substring(0, 200) ?? "empty response"}`)
    }
    throw err
  }
}

function escapeNoteText(text: string, contentType: ContentType): string {
  return `<note type="${contentType}">${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</note>`
}

/** Generate the strongest counter-argument for a note. Returns prose ready to
 *  become a new note. Uses structured output so thinking models don't leak CoT. */
export async function generateSteelman(text: string, contentType: ContentType): Promise<string> {
  const result = await critiqueCall({
    systemPrompt: STEELMAN_SYSTEM_PROMPT,
    userText: escapeNoteText(text, contentType),
    schema: SteelmanSchema,
    schemaName: "steelman",
  })
  const counter = result.counter.trim()
  if (!counter) throw new Error("Model returned an empty counter")
  return counter
}

/** Shorten a note's text to a title-style fragment (max ~8 words). */
export async function generateShortTitle(text: string, contentType: ContentType): Promise<string> {
  const result = await critiqueCall({
    systemPrompt: SHORTEN_SYSTEM_PROMPT,
    userText: escapeNoteText(text, contentType),
    schema: ShortenSchema,
    schemaName: "short_title",
  })
  const title = result.title.trim().replace(/\.$/, "")
  if (!title) throw new Error("Model returned an empty title")
  return title
}

/** Generate 3 Socratic questions about a note. */
export async function generateSocraticQuestions(text: string, contentType: ContentType): Promise<string[]> {
  const result = await critiqueCall({
    systemPrompt: SOCRATIC_SYSTEM_PROMPT,
    userText: escapeNoteText(text, contentType),
    schema: SocraticSchema,
    schemaName: "socratic_questions",
  })
  return result.questions
    .map(q => q.trim())
    .filter(q => q.length > 0)
    .slice(0, 3)
}
