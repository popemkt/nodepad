export interface ChatStreamingState {
  projectId: string
  text: string
}

export function startChatStreaming(projectId: string): ChatStreamingState {
  return { projectId, text: "" }
}

export function appendChatStreaming(
  state: ChatStreamingState,
  chunk: string,
): ChatStreamingState {
  return {
    ...state,
    text: state.text + chunk,
  }
}

export function getProjectStreamingText(
  state: ChatStreamingState | null,
  projectId: string,
): string | null {
  return state?.projectId === projectId ? state.text : null
}
