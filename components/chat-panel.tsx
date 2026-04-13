"use client"

import { useState, useRef, useEffect, KeyboardEvent } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { MessageSquare, X, Send, Plus, Layers, Loader2, Link as LinkIcon, AlertCircle } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { ChatMessage } from "@/lib/ai-chat"

interface ChatPanelProps {
  isOpen: boolean
  onClose: () => void
  messages: ChatMessage[]
  onSend: (text: string, includeCanvasContext: boolean) => Promise<boolean>
  onCapture: (text: string) => void
  onClear: () => void
  isWaiting: boolean
  hasApiKey: boolean
  hasCanvasNotes: boolean
  errorMessage?: string | null
  onDismissError?: () => void
}

const MarkdownComponents = {
  p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }: any) => <ul className="mb-2 list-disc pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }: any) => <ol className="mb-2 list-decimal pl-4 last:mb-0">{children}</ol>,
  li: ({ children }: any) => <li className="mb-0.5">{children}</li>,
  h1: ({ children }: any) => <h3 className="mb-1 text-[12px] font-bold">{children}</h3>,
  h2: ({ children }: any) => <h3 className="mb-1 text-[12px] font-bold">{children}</h3>,
  h3: ({ children }: any) => <h3 className="mb-1 text-[12px] font-bold">{children}</h3>,
  strong: ({ children }: any) => <strong className="font-bold text-foreground">{children}</strong>,
  em: ({ children }: any) => <em className="italic text-foreground/85">{children}</em>,
  code: ({ children }: any) => (
    <code className="rounded-sm bg-white/10 px-1 py-px font-mono text-[10px]">{children}</code>
  ),
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="inline-flex items-center gap-0.5 text-primary hover:underline">
      <LinkIcon className="h-2.5 w-2.5" />
      {children}
    </a>
  ),
}

export function ChatPanel({
  isOpen,
  onClose,
  messages,
  onSend,
  onCapture,
  onClear,
  isWaiting,
  hasApiKey,
  hasCanvasNotes,
  errorMessage,
  onDismissError,
}: ChatPanelProps) {
  const [input, setInput] = useState("")
  const [includeContext, setIncludeContext] = useState(true)
  const [capturingId, setCapturingId] = useState<string | null>(null)
  const [captureDraft, setCaptureDraft] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to the bottom whenever messages change or while waiting for a reply
  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, isWaiting])

  // Auto-grow textarea up to a sensible cap
  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = "auto"
    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + "px"
  }, [input])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isWaiting || !hasApiKey) return
    const didSend = await onSend(trimmed, includeContext && hasCanvasNotes)
    if (didSend) setInput("")
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const startCapture = (msg: ChatMessage) => {
    setCapturingId(msg.id)
    setCaptureDraft(msg.content)
  }

  const cancelCapture = () => {
    setCapturingId(null)
    setCaptureDraft("")
  }

  const confirmCapture = () => {
    const text = captureDraft.trim()
    if (text) {
      onCapture(text)
      cancelCapture()
    }
  }

  return (
    <div
      style={{
        width: isOpen ? 320 : 0,
        opacity: isOpen ? 1 : 0,
        visibility: isOpen ? "visible" : "hidden",
      }}
      className="flex flex-col h-full bg-black/20 backdrop-blur-3xl border-l border-border shrink-0 overflow-hidden relative z-50 transition-all duration-200 ease-in-out"
    >
      <div className="w-[320px] flex flex-col h-full">
        {/* Header */}
        <div className="flex h-10 items-center justify-between border-b border-border bg-card/5 px-3 py-1.5 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-5 w-5 bg-primary/10 rounded-sm">
              <MessageSquare className="h-3.5 w-3.5 text-primary" />
            </div>
            <h3 className="font-mono text-xs font-bold uppercase tracking-tight text-foreground/80 select-none">
              Chat
            </h3>
            {messages.length > 0 && (
              <span className="font-mono text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-sm font-bold tabular-nums">
                {messages.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={onClear}
                disabled={isWaiting}
                className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-1 rounded-sm text-muted-foreground/40 hover:text-foreground hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30 transition-colors"
                title="Clear conversation"
              >
                Clear
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 px-1.5 hover:bg-white/5 rounded-sm transition-colors text-muted-foreground/30 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto custom-scrollbar py-3 px-3 space-y-3"
        >
          {messages.length === 0 && !isWaiting && (
            <div className="flex flex-col items-center justify-center h-32 gap-3 opacity-25">
              <MessageSquare className="h-5 w-5" />
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-center leading-relaxed">
                Ask anything<br />about your notes
              </p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map(msg => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-md px-2.5 py-2 text-[12px] leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary/15 text-foreground border border-primary/20"
                      : "bg-white/5 text-foreground/90 border border-white/5"
                  }`}
                >
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className="prose-invert">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}

                  {/* Sources (Exa or native grounding) */}
                  {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-white/5 flex flex-wrap gap-1">
                      {msg.sources.map((s, i) => (
                        <a
                          key={`${s.url}-${i}`}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-sm bg-white/5 hover:bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground/80 hover:text-foreground transition-colors"
                          title={s.title}
                        >
                          <LinkIcon className="h-2 w-2" />
                          <span className="max-w-[100px] truncate">{s.siteName || s.title}</span>
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Capture controls (assistant messages only) */}
                  {msg.role === "assistant" && (
                    <div className="mt-2 pt-2 border-t border-white/5">
                      {capturingId === msg.id ? (
                        <div className="flex flex-col gap-1.5">
                          <textarea
                            value={captureDraft}
                            onChange={e => setCaptureDraft(e.target.value)}
                            className="w-full bg-black/30 border border-white/10 rounded-sm px-2 py-1.5 font-mono text-[10px] text-foreground outline-none focus:border-primary/40 resize-y min-h-[60px] custom-scrollbar"
                            placeholder="Trim or edit before capturing…"
                            autoFocus
                          />
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={confirmCapture}
                              disabled={!captureDraft.trim()}
                              className="flex items-center gap-1 px-2 py-1 rounded-sm bg-primary/20 hover:bg-primary/30 disabled:opacity-30 disabled:cursor-not-allowed font-mono text-[9px] font-bold uppercase tracking-wider text-primary transition-colors"
                            >
                              <Plus className="h-2.5 w-2.5" />
                              Add to canvas
                            </button>
                            <button
                              onClick={cancelCapture}
                              className="px-2 py-1 rounded-sm hover:bg-white/5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60 hover:text-foreground transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => startCapture(msg)}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm hover:bg-white/5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/50 hover:text-primary transition-colors"
                        >
                          <Plus className="h-2.5 w-2.5" />
                          Capture
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isWaiting && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="rounded-md px-2.5 py-2 bg-white/5 border border-white/5 flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin text-primary/60" />
                <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground/50">
                  Thinking…
                </span>
              </div>
            </motion.div>
          )}
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div className="mx-3 mb-2 flex items-start gap-2 rounded-sm border border-destructive/30 bg-destructive/10 px-2 py-1.5">
            <AlertCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
            <p className="flex-1 font-mono text-[9px] text-destructive leading-relaxed break-words">
              {errorMessage}
            </p>
            {onDismissError && (
              <button
                onClick={onDismissError}
                className="text-destructive/60 hover:text-destructive transition-colors shrink-0"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        )}

        {/* Footer: input + canvas context toggle */}
        <div className="border-t border-border bg-card/5 p-3 shrink-0">
          {!hasApiKey && (
            <p className="mb-2 font-mono text-[9px] text-destructive/80 leading-relaxed">
              Add an API key in Settings to start chatting.
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!hasApiKey || isWaiting}
              placeholder={isWaiting ? "Waiting for reply…" : "Ask a question…"}
              rows={1}
              className="flex-1 min-h-[32px] max-h-[140px] resize-none rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2 font-mono text-[11px] text-foreground outline-none focus:border-primary/40 placeholder:text-muted-foreground/30 disabled:opacity-50 custom-scrollbar"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isWaiting || !hasApiKey}
              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-md bg-primary/20 hover:bg-primary/30 disabled:opacity-30 disabled:cursor-not-allowed text-primary transition-colors"
              title="Send (Enter)"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Canvas context toggle */}
          <button
            onClick={() => setIncludeContext(v => !v)}
            disabled={!hasCanvasNotes}
            className="mt-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/50 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={hasCanvasNotes ? "Toggle canvas context" : "No notes on canvas to include"}
          >
            <div className={`flex h-3 w-3 items-center justify-center rounded-sm border ${
              includeContext && hasCanvasNotes ? "border-primary bg-primary/30" : "border-white/15"
            }`}>
              {includeContext && hasCanvasNotes && <Layers className="h-2 w-2 text-primary" />}
            </div>
            Include canvas context
          </button>
        </div>
      </div>
    </div>
  )
}
