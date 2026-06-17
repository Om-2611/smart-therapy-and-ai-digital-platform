import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';

// POST /api/invites — therapist creates a patient invite (name + diagnosis only).
// Returns the generated token so the client can build a shareable link.
export async function POST(request: Request) {
  try {
    const { therapistId, firstName, lastName, diagnosis, scheduledAt } = await request.json();

    if (!therapistId || !firstName) {
      return NextResponse.json({ error: 'therapistId and firstName are required' }, { status: 400 });
    }

    // Ensure the therapist exists
    const therapist = await prisma.profileTherapist.findUnique({ where: { id: therapistId } });
    if (!therapist) {
      return NextResponse.json({ error: 'Therapist not found' }, { status: 404 });
    }

    const invite = await prisma.invite.create({
      data: {
        token: randomUUID(),
        therapistId,
        firstName,
        lastName: lastName || '',
        diagnosis: Array.isArray(diagnosis) ? diagnosis : [],
        scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
      },
    });

    return NextResponse.json({ token: invite.token, invite });
  } catch (error: any) {
    console.error('Invite creation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET /api/invites?therapistId=... — list a therapist's invites (optional, for dashboard).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const therapistId = searchParams.get('therapistId');
    if (!therapistId) {
      return NextResponse.json({ error: 'therapistId is required' }, { status: 400 });
    }

    const invites = await prisma.invite.findMany({
      where: { therapistId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ invites });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
