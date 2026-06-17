import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const therapistId = searchParams.get('therapistId');

    if (therapistId) {
      // Find all clients who have sessions with this therapist
      const sessions = await prisma.session.findMany({
        where: { therapistId },
        select: { clientId: true },
        distinct: ['clientId'],
      });
      const clientIds = sessions.map((s) => s.clientId);

      const clients = await prisma.profileClient.findMany({
        where: { id: { in: clientIds } },
        include: { user: true },
      });

      // Attach session count and last session per client
      const clientsWithMeta = await Promise.all(
        clients.map(async (client) => {
          const clientSessions = await prisma.session.findMany({
            where: { therapistId, clientId: client.id },
            orderBy: { scheduledAt: 'desc' },
            select: { id: true, scheduledAt: true, status: true },
          });
          return {
            ...client,
            sessionCount: clientSessions.length,
            lastSession: clientSessions[0]?.scheduledAt || null,
          };
        })
      );

      return NextResponse.json({ clients: clientsWithMeta });
    }

    // Backward-compatible: return all clients if no therapistId
    const clients = await prisma.profileClient.findMany({
      include: { user: true },
    });
    return NextResponse.json({ clients });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
