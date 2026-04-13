// Tone presets — short instructions appended to every AI system prompt to
// shape how the model responds. Applied uniformly across enrichment, chat,
// synthesis, steelman, and Socratic generation.
//
// Adding a tone never overrides structural rules in the underlying prompt
// (e.g. "2-4 sentences", "no URLs", JSON schemas). It only modifies *style*.

export interface TonePreset {
  /** Stable identifier — also used as React key and storage reference */
  id: string
  /** Display name shown in the picker */
  name: string
  /** Short label/description shown beneath the name in the picker */
  description: string
  /** The instruction appended to every system prompt. Empty string = no override. */
  instruction: string
  /** Built-in presets are not editable or deletable */
  builtin?: boolean
}

export const DEFAULT_TONE_ID = "default"

/** Built-in tones shipped with the app. The "default" preset is a no-op so
 *  every existing prompt continues to behave exactly as it does without
 *  tones enabled. Users can add their own custom presets in settings. */
export const DEFAULT_TONE_PRESETS: TonePreset[] = [
  {
    id: "default",
    name: "Default",
    description: "Standard voice (no override)",
    instruction: "",
    builtin: true,
  },
  {
    id: "tutor",
    name: "Tutor",
    description: "Explain assumptions, define jargon, use analogies",
    instruction:
      "Tone: write like a patient tutor. Briefly define any non-obvious term you use, surface the assumption behind any claim, and prefer concrete analogies over abstract phrasing. Never assume the reader already knows the field.",
    builtin: true,
  },
  {
    id: "skeptic",
    name: "Skeptic",
    description: "Poke holes, demand evidence, challenge framings",
    instruction:
      "Tone: write like a sharp skeptic. Surface unstated assumptions, challenge weak premises, and demand the evidence behind every claim. Where appropriate, name the strongest objection out loud rather than hedging around it. Never accept a framing without questioning it.",
    builtin: true,
  },
  {
    id: "concise",
    name: "Concise",
    description: "Cut every word that isn't load-bearing",
    instruction:
      "Tone: maximum compression. Cut every word that isn't load-bearing, every adjective that doesn't change meaning, every hedge. Prefer short sentences. Never restate the input. If a word can be deleted without losing meaning, delete it.",
    builtin: true,
  },
  {
    id: "playful",
    name: "Playful",
    description: "Wry analogies, light wit, vivid metaphors",
    instruction:
      "Tone: playful and vivid. Reach for an unexpected analogy or metaphor when it sharpens the point. A little wry humour is welcome but never at the expense of accuracy. Avoid corporate or academic phrasing.",
    builtin: true,
  },
  {
    id: "brutal",
    name: "Brutal",
    description: "Blunt, no hedging, no softening language",
    instruction:
      "Tone: blunt and direct. Strip every hedge, every \"perhaps\", every \"it could be argued\". State conclusions as conclusions, not possibilities. If something is wrong, say it's wrong. If something is weak, say it's weak. No softening, no diplomacy.",
    builtin: true,
  },
]

/** Resolve the active tone preset from settings.
 *  Falls back to "default" if the active id doesn't exist (e.g. the user
 *  deleted the custom preset that was selected). */
export function getActiveTone(
  activeToneId: string | undefined,
  customPresets: TonePreset[] | undefined,
): TonePreset {
  const id = activeToneId || DEFAULT_TONE_ID
  const all = [...DEFAULT_TONE_PRESETS, ...(customPresets ?? [])]
  return all.find(t => t.id === id) ?? DEFAULT_TONE_PRESETS[0]
}

/** Append the tone's instruction to a system prompt. No-op for the default
 *  preset (empty instruction) so prompts that don't want any modification
 *  pass through unchanged. */
export function applyToneToPrompt(systemPrompt: string, tone: TonePreset | undefined): string {
  if (!tone || !tone.instruction.trim()) return systemPrompt
  return `${systemPrompt}\n\n## Tone Override\n${tone.instruction.trim()}`
}

/** Generate a stable id for a new custom preset based on its name. */
export function makeCustomToneId(name: string): string {
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
  return `custom-${slug || "tone"}-${Math.random().toString(36).slice(2, 6)}`
}
