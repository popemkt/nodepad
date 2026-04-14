import { describe, expect, it } from "vitest"
import {
  appendChatStreaming,
  getProjectStreamingText,
  startChatStreaming,
} from "@/lib/chat-streaming-state"

describe("chat streaming state", () => {
  it("appends streamed text for the active project", () => {
    const state = appendChatStreaming(startChatStreaming("project-a"), "Hello")

    expect(getProjectStreamingText(state, "project-a")).toBe("Hello")
  })

  it("hides an in-flight stream when viewing a different project", () => {
    const state = appendChatStreaming(startChatStreaming("project-a"), "Hello")

    expect(getProjectStreamingText(state, "project-b")).toBeNull()
  })
})
