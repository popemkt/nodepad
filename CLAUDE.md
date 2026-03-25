# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (Next.js, default port 3000)
npm run build    # Build production bundle
npm run start    # Start production server
npm run lint     # Run ESLint
```

No test runner is configured. TypeScript build errors are intentionally ignored (`next.config.mjs`: `typescript: { ignoreBuildErrors: true }`). Images are unoptimized (`images: { unoptimized: true }`).

## Environment

The OpenRouter API key is entered by the user in the app's Settings panel (inside the sidebar) and stored in localStorage under `nodepad-ai-settings`. **There is no `.env.local` dependency.** The key is forwarded from the client to API routes via the `x-or-key` request header. API routes return 401 if the header is missing.

## Tech Stack

- **Framework**: Next.js 16.1.6, React 19, TypeScript 5.7 (App Router, `"use client"` throughout)
- **Styling**: Tailwind CSS v4, `tw-animate-css`, `@tailwindcss/typography`
- **UI primitives**: shadcn/ui (components in `components/ui/`) backed by Radix UI
- **Animations**: Framer Motion 11
- **Icons**: Lucide React
- **Markdown**: `react-markdown` + `remark-gfm`
- **Command palette**: `cmdk` 1.1
- **Analytics**: `@vercel/analytics` (injected in `app/layout.tsx`)
- **Fonts**: Geist + Geist Mono (layout), Vazirmatn (RTL, via CSS `@import`)

## Architecture

**nodepad** is a spatial AI-powered research/note-taking SPA. All state is client-side (React hooks + localStorage) — no database, no server-side session.

### State Hub: `app/page.tsx`

The root page owns all application state and passes it down. Key state:

- `projects: Project[]` — persisted to `nodepad-projects` in localStorage
- `activeProjectId` — persisted to `nodepad-active-project`
- `viewMode: "tiling" | "kanban"` — not persisted, defaults to `"tiling"`
- `highlightedBlockId` — ephemeral, for cross-panel highlighting
- Panel booleans: `isSidebarOpen`, `isIndexOpen`, `isCommandKOpen`, `isGhostPanelOpen`
- AI settings via `useAISettings()` hook from `lib/ai-settings.ts`

**Migration**: On load, if `nodepad-projects` is absent but the old `nodepad-blocks` key exists, data is migrated to a single `"Default Space"` project. If nothing exists, `INITIAL_PROJECTS` seeds state.

**Backup**: On every state change, projects are silently written to `nodepad-backup` in localStorage. On load, if `nodepad-projects` is missing, the backup is restored automatically.

**Block addition**: `addBlock(text, forcedType?)` supports inline `#type text` shorthand (e.g., `#claim The earth is round`) to set type at creation time.

**Enrichment**: After each block add/edit, `enrichBlock()` fires `/api/enrich`. Returns `contentType`, `category`, `annotation`, `confidence`, `influencedByIndices`, `isUnrelated`, and optionally `mergeWithIndex`. An 800ms debounce applies to edits. If `mergeWithIndex` is non-null, the new block merges into an existing one. New blocks classified as `"task"` are appended as sub-tasks into an existing task block.

**Synthesis (ghost note)**: After enrichment, `generateGhostNote()` may auto-trigger `/api/ghost` if ≥3 blocks exist, no ghost is active, ≥3 new blocks have been added since last ghost, and ≥2 minutes have elapsed. Previous synthesis texts are tracked (`lastGhostTexts`, last 10) to avoid near-duplicates. Users can "Solidify" (converts to a thesis block) or dismiss.

**Undo**: `blockHistoryRef` holds a per-project ring of up to 20 `TextBlock[]` snapshots. `pushHistory()` is called before any mutation. `Cmd+Z` calls `undo()`, which pops the stack and shows a 2.2s toast.

**Context window**: `/api/enrich` receives the last 15 blocks as context (`.slice(-15)`).

### Core Data Models

Defined in `app/page.tsx` and `components/tile-card.tsx`:

```typescript
Project {
  id: string
  name: string
  blocks: TextBlock[]
  collapsedIds: string[]         // unused in tiling view (collapse removed); kept for kanban
  ghostNote?: { id: string; text: string; category: string; isGenerating: boolean }
  ghostNoteDismissed?: boolean
  lastGhostBlockCount?: number
  lastGhostTimestamp?: number
  lastGhostTexts?: string[]      // last 10 synthesis texts, for near-duplicate avoidance
}

TextBlock {
  id: string
  text: string
  timestamp: number
  contentType: ContentType          // 14 types
  category?: string                 // AI-assigned topic group
  isEnriching?: boolean
  statusText?: string
  isError?: boolean
  annotation?: string               // AI-generated insight (2-4 sentences)
  confidence?: number | null        // 0–100 for claims
  sources?: { url: string; title: string; siteName: string }[]  // web grounding citations
  influencedBy?: string[]           // IDs of related blocks
  isUnrelated?: boolean
  isPinned?: boolean
  subTasks?: { id: string; text: string; isDone: boolean; timestamp: number }[]
}
```

### Content Type System

**`lib/content-types.ts`** — `ContentType` union + `CONTENT_TYPE_CONFIG` record:
- 14 types: `entity`, `claim`, `question`, `task`, `idea`, `reference`, `quote`, `definition`, `opinion`, `reflection`, `narrative`, `comparison`, `thesis`, `general`
- Each has: `label`, `icon` (Lucide), `accentVar` (CSS variable), optional `bodyStyle`
- Colors defined in `app/globals.css` as `--type-{name}` (oklch)
- `thesis` has a special gradient (`--thesis-gradient`, `--thesis-foreground`)

**`lib/detect-content-type.ts`** — Heuristic pre-classification before AI enrichment. Pattern order: quote → task → question → definition → comparison → reference (URL) → idea → reflection → opinion → entity (≤3 words) → claim (4–25 words) → narrative (>25 words) → general.

### `lib/ai-settings.ts`

`useAISettings()` hook and `getAIHeaders()` function. Settings stored in localStorage under `nodepad-ai-settings`:

- `apiKey: string` — user's OpenRouter key
- `modelId: string` — defaults to `"openai/gpt-4o"`
- `webGrounding: boolean` — enables `:online` suffix for grounding-capable models

Available models: Claude Sonnet 4.5, GPT-4o (default), Gemini 2.5 Pro, DeepSeek V3, Mistral Small 3.2. `getAIHeaders()` reads fresh from localStorage at call time. The model label is only shown in the status bar when an API key is configured.

### `lib/export.ts`

`exportToMarkdown(projectName, blocks)`, `downloadMarkdown()`, `copyToClipboard()`. Rich markdown output: YAML front matter, stats table, TOC with anchor links, claims as confidence tables, tasks as GFM task lists, quotes as blockquotes, annotations as blockquotes, cited sources as lists. Attribution: `nodepad — https://nodepad.space`. Triggered via Cmd+K commands `export-md` and `copy-md`.

### `lib/nodepad-format.ts`

`.nodepad` file format (versioned JSON, `NODEPAD_FILE_VERSION = 1`):
- `serialiseProject()` — strips transient UI fields (`isEnriching`, `isError`, `statusText`)
- `downloadNodepadFile()` — triggers browser download
- `parseNodepadFile()` — validates, assigns fresh project ID, deduplicates names (`"Research (2)"`)
- `NodepadParseError` typed error class

### `lib/initial-data.ts`

`INITIAL_PROJECTS` — single empty `"✨ New Research"` project, seeds state on first load.

### `lib/utils.ts`

`cn(...inputs)` — `clsx` + `tailwind-merge` utility.

## API Routes (`app/api/`)

### `POST /api/enrich`

- Body: `{ text, context, forcedType?, category? }`; Headers: `x-or-key`, `x-or-model`, `x-or-supports-grounding`
- Returns 401 if `x-or-key` is missing
- Runs heuristic detection locally, then calls OpenRouter with `json_schema` structured output (`temperature: 0.1`, `strict: true`)
- Context items wrapped in XML delimiters: `<note index="N" category="X">...</note>` — prompt injection mitigation
- Auto-appends `:online` for truth-dependent types (claim, question, entity, quote, reference, definition, narrative) when grounding is supported
- Returns: `{ contentType, category, annotation, confidence, influencedByIndices, isUnrelated, mergeWithIndex }`

### `POST /api/ghost`

- Body: `{ context }`; Headers: `x-or-key`, `x-or-model`
- Returns 401 if `x-or-key` is missing
- Falls back to `"google/gemini-2.0-flash-lite-001"` if no model header (`temperature: 0.7`)
- Receives last 10 synthesis texts to avoid near-duplicates; instructs recency weighting
- Returns: `{ text, category }` — 15–25 word emergent thesis

## Security (`proxy.ts`)

Next.js proxy (formerly middleware) applied to `/api/enrich` and `/api/ghost`:
- **Rate limiting**: sliding-window in-memory store — 60 req/min for `/api/enrich`, 10 req/min for `/api/ghost`
- **Origin check**: blocks requests where `Origin` header doesn't match the host (bypassed on localhost)
- **Header stripping**: removes `x-or-key` from response headers to prevent key leakage in logs
- Works correctly on persistent-process hosts (Render.com). On serverless (Vercel), rate limiting is best-effort only.

## Views

### Tiling (`components/tiling-area.tsx`)

Default view. Uses a **BSP (Binary Space Partitioning) tree** layout — blocks are chunked into pages of 7 (task blocks excluded from the grid) and recursively split into a binary tree alternating vertical and horizontal splits. Task blocks render separately via an embedded task strip. Pages scroll horizontally. **Collapse is disabled in tiling view** — the BSP tree's fixed parent-child relationships mean freed space only redistributes to immediate siblings, causing orphaned gaps.

A `<TilingMinimap>` sits at `absolute bottom-4 right-4` and is visible whenever the canvas has more than one page. Connection dimming: `hoveredConnectionId` + `relatedIds` useMemo; unrelated tiles get `opacity-15 saturate-0`.

### Kanban (`components/kanban-area.tsx`)

Groups all blocks by `contentType` into columns. Column priority: task → thesis → processing → rest. Uses `KanbanMinimap` for navigation. Same connection dimming logic as tiling.

## Key Components (`components/`)

| File | Purpose |
|---|---|
| `tile-card.tsx` | Core block card. Exports `TextBlock` type. Edit (double-click), category/annotation edit, pin, delete, sub-tasks, confidence bar, sources, connection dot indicator, RTL detection. `React.memo`-ized. |
| `tiling-area.tsx` | BSP tiling view with horizontal page scroll and spatial minimap. |
| `kanban-area.tsx` | Kanban view grouped by content type. |
| `tiling-minimap.tsx` | Bottom-right minimap for tiling — vertical stack of page thumbnails with tooltips. |
| `kanban-minimap.tsx` | Floating minimap for kanban — icon buttons with hover count badges. |
| `project-sidebar.tsx` | Slide-in left panel. Lists projects with rename/delete. Embeds AI settings (API key, model selector, web grounding toggle) and .nodepad import button. |
| `ghost-panel.tsx` | Right-side synthesis panel. Shows current ghost note (generating or complete), solidify/dismiss actions, and history of past synthesis notes. |
| `status-bar.tsx` | Top header: menu button, wordmark, project name, node count, enriching/error indicators, type breakdown, model label (only when API key set), clock, synthesis toggle, index toggle, about button. |
| `vim-input.tsx` | Bottom input bar. Uses `cmdk` for Cmd+K command grid (Navigate 3-col, Actions 5-col). Enter submits a new block. Shows `⌘Z Undo` hint. |
| `tile-index.tsx` | Right panel (toggleable). Groups blocks by category (tiling) or type (kanban). Highlight-on-hover synced with `highlightedBlockId`. |
| `about-panel.tsx` | Full-height right Sheet (max-w-2xl, z-200). App introduction, quick start guide, content types, views, AI features, export/data, keyboard shortcuts, tips, and author credit. |
| `components/ui/` | shadcn/ui primitives. |

## UI Patterns

- **shadcn/ui** — prefer extending existing components over adding new primitives.
- **Styling**: Tailwind CSS v4 with `cn()` from `lib/utils.ts`. Dark-first design using oklch color space. Custom scrollbar styles and `shimmer-text` animation for enriching state.
- **RTL**: Auto-applied `.rtl-text` class when Arabic/Hebrew characters detected in a block.
- **Animations**: Framer Motion for tile/panel transitions.
- **Connection dimming**: hover the dot indicator on any tile header to dim unrelated tiles. Dot indicator only shown when `block.influencedBy?.length > 0`.

## localStorage Keys

| Key | Contents |
|---|---|
| `nodepad-projects` | `Project[]` — primary persistence |
| `nodepad-active-project` | `string` — active project ID |
| `nodepad-backup` | `Project[]` — rolling silent backup, written on every change |
| `nodepad-ai-settings` | `{ apiKey, modelId, webGrounding }` |
