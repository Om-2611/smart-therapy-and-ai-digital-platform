'use client';

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Moon, Sun, Save, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { auth } from '@/lib/firebase';
import { sendPasswordResetEmail, deleteUser } from 'firebase/auth';

const CARD_BASE =
  'rounded-[14px] border-[0.5px] border-[var(--glass-border)] shadow-[var(--glass-shadow)] bg-[var(--glass-bg)] dark:bg-[#16221e] animate-fade-up';
const GLASS_CARD = `${CARD_BASE} hover-lift`;

const SPECIALITIES = ['SLD', 'ADHD', 'Anxiety', 'Depression', 'ID', 'Autism', 'Dyslexia', 'Trauma', 'General'];
const QUALIFICATIONS = ['BA/BSc', 'MA/MSc', 'M.Phil', 'Ph.D', 'MD', 'DM'];
const EXPERIENCES = ['0-2 years', '3-5 years', '5-10 years', '10+ years', '15+ years'];
const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];

export default function ProfilePage() {
  const { uid, role, profile, email, clearAuth } = useAuthStore();
  const { theme, toggle: toggleTheme } = useTheme();
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showDanger, setShowDanger] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Password reset
  const [pwSending, setPwSending] = useState(false);
  const [pwMessage, setPwMessage] = useState('');

  // Therapist fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [qualification, setQualification] = useState('');
  const [experience, setExperience] = useState('');
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [bio, setBio] = useState('');

  // Client fields
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [diagnosis, setDiagnosis] = useState<string[]>([]);
  const [lockedName, setLockedName] = useState(false);

  useEffect(() => {
    if (!uid) { router.push('/auth'); return; }
    loadProfile();
  }, [uid, profile]);

  const loadProfile = () => {
    if (!profile) return;
    if (role === 'THERAPIST') {
      setFirstName(profile.firstName || '');
      setLastName(profile.lastName || '');
      setQualification(profile.qualification || '');
      setExperience(profile.experience || '');
      setSpecialties(profile.specialty || []);
      setBio(profile.bio || '');
    } else {
      setFirstName(profile.firstName || '');
      setLastName(profile.lastName || '');
      if (profile.dateOfBirth) {
        const dob = new Date(profile.dateOfBirth);
        setDateOfBirth(dob.toISOString().split('T')[0]);
      }
      setDiagnosis(profile.diagnosis || []);
    }
  };

  const toggleSpecialty = (spec: string) => {
    setSpecialties((prev) =>
      prev.includes(spec) ? prev.filter((s) => s !== spec) : [...prev, spec]
    );
  };

  const handleSave = async () => {
    if (!uid) return;
    setSaving(true);
    try {
      const body: any = { uid, role };
      if (role === 'THERAPIST') {
        body.firstName = firstName;
        body.lastName = lastName;
        body.qualification = qualification;
        body.experience = experience;
        body.specialty = specialties;
        body.bio = bio;
      } else {
        if (!lockedName) {
          body.firstName = firstName;
          body.lastName = lastName;
        }
        body.dateOfBirth = dateOfBirth;
        body.gender = gender;
      }
      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (!email) return;
    setPwMessage('');
    setPwSending(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setPwMessage(`Reset link sent to ${email}`);
    } catch (err: any) {
      console.error('Password reset error:', err);
      setPwMessage('Could not send reset email. Please try again.');
    }
    setPwSending(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE' || !uid) return;
    setDeleteError('');
    setDeleting(true);
    try {
      // Remove the Firebase Auth user first; this can require a recent login.
      const current = auth.currentUser;
      if (current) {
        await deleteUser(current);
      }
      // Then purge all relational data for this user.
      await fetch('/api/users/profile', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid }),
      });
      clearAuth();
      router.push('/auth');
    } catch (err: any) {
      console.error('Account deletion error:', err);
      if (err?.code === 'auth/requires-recent-login') {
        setDeleteError('For security, please log out and log back in, then try again.');
      } else {
        setDeleteError('Could not delete account. Please try again.');
      }
      setDeleting(false);
    }
  };

  const initials = `${(firstName || '')[0] ?? ''}${(lastName || '')[0] ?? ''}`.toUpperCase();

  return (
    <DashboardLayout role={role} profile={profile}>
    <div className="relative">
      <div className="relative z-10 space-y-6 max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-[28px]" style={{ color: 'var(--ink)' }}>Profile</h1>
            <p className="text-sm font-medium mt-1" style={{ color: 'var(--ink-muted)' }}>Manage your account settings</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-press flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
            style={{ background: 'var(--sage)', border: 'none', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>

        {/* Avatar + Name */}
        <div className={`${GLASS_CARD} p-6 flex items-center gap-5`}>
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-sm"
            style={{ background: 'linear-gradient(135deg, var(--sage), var(--sage-mid))' }}
          >
            {initials || '?'}
          </div>
          <div>
            <p className="font-heading text-xl" style={{ color: 'var(--ink)' }}>{firstName} {lastName}</p>
            <span className="rounded-full px-3 py-0.5 text-xs font-semibold" style={{ background: 'var(--sage-light)', color: 'var(--sage)' }}>
              {role === 'THERAPIST' ? 'Therapist' : 'Client'}
            </span>
          </div>
        </div>

        {/* Personal Information */}
        <div className={`${GLASS_CARD} p-6 space-y-5`}>
          <h2 className="font-heading text-lg" style={{ color: 'var(--ink)' }}>Personal Information</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>First Name</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={lockedName}
                className="w-full rounded-xl p-3 text-sm focus-visible:outline-none"
                style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink)', opacity: lockedName ? 0.6 : 1 }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Last Name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={lockedName}
                className="w-full rounded-xl p-3 text-sm focus-visible:outline-none"
                style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink)', opacity: lockedName ? 0.6 : 1 }}
              />
            </div>
          </div>

          {role === 'THERAPIST' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Qualification</label>
                  <Select onValueChange={(v) => setQualification(v || '')} value={qualification}>
                    <SelectTrigger className="w-full rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                      <SelectValue placeholder="Select qualification" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl" style={{ background: 'var(--glass-strong)', backdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)' }}>
                      {QUALIFICATIONS.map((q) => (
                        <SelectItem key={q} value={q} style={{ color: 'var(--ink)' }}>{q}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Experience</label>
                  <Select onValueChange={(v) => setExperience(v || '')} value={experience}>
                    <SelectTrigger className="w-full rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                      <SelectValue placeholder="Select experience" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl" style={{ background: 'var(--glass-strong)', backdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)' }}>
                      {EXPERIENCES.map((e) => (
                        <SelectItem key={e} value={e} style={{ color: 'var(--ink)' }}>{e}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Specialities</label>
                <div className="flex flex-wrap gap-2">
                  {SPECIALITIES.map((spec) => (
                    <button
                      key={spec}
                      onClick={() => toggleSpecialty(spec)}
                      className="btn-press rounded-lg px-3 py-1.5 text-xs font-semibold"
                      style={{
                        background: specialties.includes(spec) ? 'var(--sage)' : 'var(--glass-bg)',
                        color: specialties.includes(spec) ? '#fff' : 'var(--ink-muted)',
                        border: specialties.includes(spec) ? 'none' : '1px solid var(--glass-border)',
                      }}
                    >
                      {spec}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Bio <span className="text-xs font-normal">({200 - bio.length} chars remaining)</span></label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 200))}
                  rows={3}
                  placeholder="Tell us about your therapeutic approach..."
                  className="w-full rounded-xl p-3 text-sm resize-none focus-visible:outline-none"
                  style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink)' }}
                />
              </div>
            </>
          )}

          {role === 'CLIENT' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Date of Birth</label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full rounded-xl p-3 text-sm focus-visible:outline-none"
                    style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink)' }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Gender</label>
                  <Select onValueChange={(v) => setGender(v || '')} value={gender}>
                    <SelectTrigger className="w-full rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl" style={{ background: 'var(--glass-strong)', backdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)' }}>
                      {GENDERS.map((g) => (
                        <SelectItem key={g} value={g} style={{ color: 'var(--ink)' }}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Conditions (set by therapist, read-only)</label>
                <div className="flex flex-wrap gap-2">
                  {diagnosis.length === 0 ? (
                    <span className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>No conditions recorded</span>
                  ) : (
                    diagnosis.map((d) => (
                      <span key={d} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'var(--c-accent-bg)', color: 'var(--c-accent)' }}>
                        {d}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Account */}
        <div className={`${GLASS_CARD} p-6 space-y-4`}>
          <h2 className="font-heading text-lg" style={{ color: 'var(--ink)' }}>Account</h2>

          <div className="space-y-1">
            <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Email</label>
            <p className="rounded-xl p-3 text-sm" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink-muted)' }}>
              {email || 'Loading...'}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Theme</p>
              <p className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>Switch between light and dark mode</p>
            </div>
            <button
              onClick={toggleTheme}
              className="btn-press flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink-muted)' }}
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Password</p>
              <p className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>Change your account password</p>
              {pwMessage && (
                <p className="text-xs font-medium mt-1" style={{ color: 'var(--sage)' }}>{pwMessage}</p>
              )}
            </div>
            <button
              onClick={handleChangePassword}
              disabled={pwSending || !email}
              className="btn-press rounded-lg px-4 py-2 text-xs font-semibold"
              style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink)', opacity: pwSending || !email ? 0.6 : 1 }}
            >
              {pwSending ? 'Sending...' : 'Change password'}
            </button>
          </div>
        </div>

        {/* Danger Zone */}
        <div className={`${GLASS_CARD} overflow-hidden`}>
          <button
            onClick={() => setShowDanger(!showDanger)}
            className="flex w-full items-center justify-between p-5 text-left"
            style={{ color: showDanger ? '#ef4444' : 'var(--ink-muted)' }}
          >
            <span className="font-heading text-lg">Danger Zone</span>
            <AlertTriangle className="h-4 w-4" />
          </button>
          {showDanger && (
            <div className="px-5 pb-5 space-y-3">
              <p className="text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>
                This action is irreversible. Type <strong>DELETE</strong> to confirm.
              </p>
              <div className="flex gap-3">
                <input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder='Type "DELETE" to confirm'
                  className="flex-1 rounded-xl p-3 text-sm focus-visible:outline-none"
                  style={{ background: 'var(--glass-bg)', border: '1px solid #ef4444', color: 'var(--ink)' }}
                />
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirm !== 'DELETE' || deleting}
                  className="btn-press flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
                  style={{ background: deleteConfirm === 'DELETE' ? '#ef4444' : '#6b7280', border: 'none', opacity: deleteConfirm === 'DELETE' && !deleting ? 1 : 0.5 }}
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
              {deleteError && (
                <p className="text-sm font-medium" style={{ color: '#ef4444' }}>{deleteError}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}
