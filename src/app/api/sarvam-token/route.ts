import { NextRequest, NextResponse } from 'next/server'

// Returns the Sarvam subscription key for the browser STT WebSocket.
//
// TECH DEBT (intentional, prototype stage — tracked alongside the
// ScriptProcessorNode and query-param-key items): Sarvam exposes no
// short-lived/ephemeral token mechanism, and browser WebSockets cannot set
// auth headers, so the key is ultimately passed as a query param from the
// client. We at least keep it out of the JS bundle by serving it from this
// route behind the auth-header gate. When Sarvam ships ephemeral tokens (or we
// move to a server audio proxy), only this file changes — the client keeps
// calling POST /api/sarvam-token and reading `{ key }`.
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const key = process.env.SARVAM_API_KEY
    if (!key) {
      return NextResponse.json(
        { error: 'Sarvam not configured' },
        { status: 500 }
      )
    }

    return NextResponse.json({ key })
  } catch (e) {
    console.error('[sarvam-token]', e)
    return NextResponse.json({ error: 'Token fetch failed' }, { status: 500 })
  }
}
