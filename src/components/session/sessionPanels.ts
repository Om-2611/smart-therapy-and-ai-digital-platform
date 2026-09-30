// Which of the swappable views the session room sidebar is showing.
// `null` = no panel open, the video stage uses the full width.
//
// 'whiteboard' is the odd one out: it does not render in the sidebar at all, it
// takes over the main canvas (see WhiteboardStage). It shares this state so the
// bottom bar's active-state highlighting and the "switch without closing first"
// behaviour work uniformly across every panel.
//
// 'participants' and 'settings' are therapist-only: the client's sidebar is
// derived from the therapist's launched module/board, never from these.
export type SidebarPanel =
  | 'assistant'
  | 'notes'
  | 'whiteboard'
  | 'modules'
  | 'participants'
  | 'settings'
  | null
