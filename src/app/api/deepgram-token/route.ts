import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@deepgram/sdk'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Lazy init: constructing at module scope throws at build time when the
    // key is unset, and this legacy route must not break builds.
    const apiKey = process.env.DEEPGRAM_API_KEY
    const projectId = process.env.DEEPGRAM_PROJECT_ID
    if (!apiKey || !projectId) {
      return NextResponse.json(
        { error: 'Deepgram not configured' },
        { status: 500 }
      )
    }
    const deepgram = createClient(apiKey)

    const { result, error } = await deepgram.manage.createProjectKey(
      projectId,
      {
        comment: 'staad-session-temp-key',
        scopes: ['usage:write'],
        time_to_live_in_seconds: 10,
      }
    )

    if (error || !result) {
      throw new Error('Failed to create temp key')
    }

    return NextResponse.json({ token: result.key })
  } catch (e) {
    console.error('[deepgram-token]', e)
    return NextResponse.json(
      { error: 'Token creation failed' },
      { status: 500 }
    )
  }
}
