import { AccessToken } from 'livekit-server-sdk'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const roomName = searchParams.get('room')
  const participantName = searchParams.get('name')
  const role = searchParams.get('role')

  if (!roomName || !participantName) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    { identity: participantName }
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