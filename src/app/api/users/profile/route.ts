import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { uid, email, role, firstName, lastName, specialty, dateOfBirth, diagnosis, inviteToken } = await request.json();

    if (!uid || !email || !role) {
      return NextResponse.json({ error: 'Missing core credentials' }, { status: 400 });
    }

    const roleEnum = role === 'THERAPIST' ? 'THERAPIST' : 'CLIENT';

    // Create user and profile transactionally; claim invite if present.
    const result = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          id: uid,
          email,
          role: roleEnum,
        },
      });

      if (roleEnum === 'THERAPIST') {
        const profile = await tx.profileTherapist.create({
          data: {
            userId: uid,
            firstName: firstName || 'Therapist',
            lastName: lastName || '',
            specialty: specialty || [],
          },
        });
        return { user: u, profile, session: null };
      }

      const profile = await tx.profileClient.create({
        data: {
          userId: uid,
          firstName: firstName || 'Client',
          lastName: lastName || '',
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : new Date(),
          diagnosis: diagnosis || [],
        },
      });

      // If this signup came from a therapist invite, claim it: create the assigned
      // session and mark the invite CLAIMED.
      let session = null;
      if (inviteToken) {
        const invite = await tx.invite.findUnique({ where: { token: inviteToken } });
        if (invite && invite.status === 'PENDING') {
          session = await tx.session.create({
            data: {
              therapistId: invite.therapistId,
              clientId: profile.id,
              scheduledAt: invite.scheduledAt,
              status: 'SCHEDULED',
            },
          });
          await tx.invite.update({
            where: { id: invite.id },
            data: { status: 'CLAIMED', claimedClientId: profile.id },
          });
        }
      }

      return { user: u, profile, session };
    });

    return NextResponse.json({ success: true, user: result.user, profile: result.profile, session: result.session });
  } catch (error: any) {
    console.error('Error creating user profile in PostgreSQL:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { uid, role, firstName, lastName, qualification, experience, specialty, bio, dateOfBirth, gender, diagnosis } = await request.json();

    if (!uid) {
      return NextResponse.json({ error: 'uid is required' }, { status: 400 });
    }

    if (role === 'THERAPIST') {
      const updated = await prisma.profileTherapist.update({
        where: { userId: uid },
        data: {
          ...(firstName !== undefined && { firstName }),
          ...(lastName !== undefined && { lastName }),
          ...(qualification !== undefined && { qualification }),
          ...(experience !== undefined && { experience }),
          ...(specialty !== undefined && { specialty }),
          ...(bio !== undefined && { bio }),
        },
      });
      return NextResponse.json({ profile: updated });
    }

    if (role === 'CLIENT') {
      const updateData: any = {};
      if (dateOfBirth !== undefined) updateData.dateOfBirth = new Date(dateOfBirth);
      if (gender !== undefined) updateData.gender = gender;
      // firstName/lastName only updatable if NOT from invite (handled on frontend)
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;

      const updated = await prisma.profileClient.update({
        where: { userId: uid },
        data: updateData,
      });
      return NextResponse.json({ profile: updated });
    }

    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  } catch (error: any) {
    console.error('Profile PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/users/profile — permanently remove a user and all their data.
// Sessions/bookings/notes/invites are not cascade-deleted from the profile, so
// they are cleared explicitly inside a transaction before the user is removed
// (deleting the User cascades to the therapist/client profile itself).
export async function DELETE(request: Request) {
  try {
    const { uid } = await request.json();
    if (!uid) {
      return NextResponse.json({ error: 'uid is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: uid },
      include: { therapist: true, client: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      if (user.therapist) {
        const tId = user.therapist.id;
        await tx.therapistNote.deleteMany({ where: { therapistId: tId } });
        await tx.session.deleteMany({ where: { therapistId: tId } });
        await tx.booking.deleteMany({ where: { therapistId: tId } });
        await tx.invite.deleteMany({ where: { therapistId: tId } });
        await tx.documentChunk.deleteMany({ where: { therapistId: tId } });
      }
      if (user.client) {
        const cId = user.client.id;
        // Deleting the client's sessions cascades their notes.
        await tx.booking.deleteMany({ where: { clientId: cId } });
        await tx.session.deleteMany({ where: { clientId: cId } });
      }
      // Removes the User and cascades to the therapist/client profile.
      await tx.user.delete({ where: { id: uid } });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Profile DELETE error:', error);
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
        admin: true,
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
