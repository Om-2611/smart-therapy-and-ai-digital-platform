import { AccessToken } from 'livekit-server-sdk'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const roomName = searchParams.get('room')
  const participantName = searchParams.get('name')
  const role = searchParams.get('role')

  if (!roomName || !participantName) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  // `identity` is the display name, which says nothing about who the person is
  // in the session. Publishing the role as participant metadata makes it
  // readable by the other side of the call, so a peer can tell the client from
  // the therapist instead of guessing "whoever isn't me".
  //
  // Attention scoring depends on this: it will only attach face tracking to a
  // participant it can positively confirm is the CLIENT, and refuses to start
  // when the role is absent or unparseable. Removing this field does not break
  // the call — it silently disables attention scoring. See
  // src/hooks/useAttentionScoring.ts.
  //
  // The token is signed server-side, so a participant cannot forge their own
  // role here.
  // Fail closed: only a role we explicitly recognise is published. An absent or
  // unexpected `role` yields NO role claim rather than a defaulted one, so an
  // unlabelled participant can never be mistaken for the client and analysed.
  const claimedRole =
    role === 'therapist' || role === 'client' ? role : null

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    {
      identity: participantName,
      ...(claimedRole ? { metadata: JSON.stringify({ role: claimedRole }) } : {}),
    }
  )

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: role === 'therapist',
  })

  return NextResponse.json({ token: await at.toJwt() })
}
