import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/sessions/[sessionId] — fetch a single session (with client + therapist).
export async function GET(
  _request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const session = await prisma.session.findUnique({
      where: { id: params.sessionId },
      include: { client: true, therapist: true },
    });
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (error: any) {
    console.error('Session GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/sessions/[sessionId] — transition a session's lifecycle status.
// Body: { action: 'start' | 'end' }
//   - 'start': SCHEDULED -> ACTIVE, records startedAt (no-op if already started/ended)
//   - 'end':   -> COMPLETED, records endedAt (and startedAt if it was never set).
// Idempotent: ending an already-completed session preserves the original endedAt.
export async function PATCH(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { action } = await request.json();

    const existing = await prisma.session.findUnique({
      where: { id: params.sessionId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const now = new Date();
    let data: Record<string, unknown> | null = null;

    if (action === 'start') {
      // Only promote a session that hasn't started or ended yet.
      if (existing.status === 'SCHEDULED') {
        data = {
          status: 'ACTIVE',
          startedAt: existing.startedAt ?? now,
        };
      }
    } else if (action === 'end') {
      // Mark complete; keep the first endedAt if it was already set.
      data = {
        status: 'COMPLETED',
        startedAt: existing.startedAt ?? now,
        endedAt: existing.endedAt ?? now,
      };
    } else {
      return NextResponse.json(
        { error: "Invalid action. Use 'start' or 'end'." },
        { status: 400 }
      );
    }

    // Nothing to change (e.g. 'start' on an already active/completed session).
    if (!data) {
      return NextResponse.json({ session: existing });
    }

    const session = await prisma.session.update({
      where: { id: params.sessionId },
      data,
      include: { client: true, therapist: true },
    });

    return NextResponse.json({ session });
  } catch (error: any) {
    console.error('Session PATCH error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
