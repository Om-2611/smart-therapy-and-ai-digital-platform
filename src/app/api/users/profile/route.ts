import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { uid, email, role, firstName, lastName, specialty, dateOfBirth, diagnosis } = await request.json();

    if (!uid || !email || !role) {
      return NextResponse.json({ error: 'Missing core credentials' }, { status: 400 });
    }

    const roleEnum = role === 'THERAPIST' ? 'THERAPIST' : 'CLIENT';

    // Create user and profile transactionally
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          id: uid,
          email,
          role: roleEnum,
        },
      });

      if (roleEnum === 'THERAPIST') {
        await tx.profileTherapist.create({
          data: {
            userId: uid,
            firstName: firstName || 'Therapist',
            lastName: lastName || '',
            specialty: specialty || [],
          },
        });
      } else {
        await tx.profileClient.create({
          data: {
            userId: uid,
            firstName: firstName || 'Client',
            lastName: lastName || '',
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : new Date(),
            diagnosis: diagnosis || [],
          },
        });
      }
      return u;
    });

    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    console.error('Error creating user profile in PostgreSQL:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get('uid');

  if (!uid) {
    return NextResponse.json({ error: 'UID is required' }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: uid },
      include: {
        therapist: true,
        client: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
