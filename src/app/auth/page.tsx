'use client';

import React, { useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider 
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'THERAPIST' | 'CLIENT'>('THERAPIST');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { uid } = useAuthStore();

  useEffect(() => {
    if (uid) {
      router.push('/');
    }
  }, [uid, router]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        router.push('/');
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        router.push(`/onboarding?role=${role}`);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError(null);
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const checkProfile = await fetch(`/api/users/profile?uid=${result.user.uid}`);
      if (checkProfile.ok) {
        router.push('/');
      } else {
        router.push('/onboarding');
      }
    } catch (err: any) {
      setError(err.message || 'Google Auth failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'var(--page-bg)' }}>
      <Card className="w-full max-w-md border shadow-[var(--glass-shadow)] rounded-2xl bg-white dark:bg-[#16221e]" style={{ borderColor: 'var(--glass-border)' }}>
        <CardHeader className="space-y-2 text-center pb-4">
          <CardTitle className="text-3xl font-bold tracking-tight" style={{ color: 'var(--ink)' }}>STAAD</CardTitle>
          <CardDescription className="font-medium" style={{ color: 'var(--ink-muted)' }}>
            {isLogin ? 'Welcome back to your calming space' : 'Begin your journey with dynamic therapy tools'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email" className="font-medium" style={{ color: 'var(--ink-muted)' }}>Email</Label>
              <Input 
                id="email" 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                placeholder="you@domain.com"
                className="rounded-xl border focus-visible:ring-[var(--sage)]/40"
                style={{ background: 'var(--glass-bg)', borderColor: 'var(--glass-border)', color: 'var(--ink)' }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password" className="font-medium" style={{ color: 'var(--ink-muted)' }}>Password</Label>
              <Input 
                id="password" 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
                className="rounded-xl border focus-visible:ring-[var(--sage)]/40"
                style={{ background: 'var(--glass-bg)', borderColor: 'var(--glass-border)', color: 'var(--ink)' }}
              />
            </div>
            
            {!isLogin && (
              <div className="space-y-2">
                <Label className="font-medium text-sm" style={{ color: 'var(--ink-muted)' }}>I am a...</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('THERAPIST')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                      role === 'THERAPIST'
                        ? 'text-white shadow-sm'
                        : 'text-[var(--ink-muted)] border-[var(--glass-border)] hover:border-[var(--sage)]/40'
                    }`}
                    style={role === 'THERAPIST' ? { background: 'var(--sage)', borderColor: 'var(--sage)' } : { background: 'var(--glass-bg)' }}
                  >
                    Therapist
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('CLIENT')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                      role === 'CLIENT'
                        ? 'text-white shadow-sm'
                        : 'text-[var(--ink-muted)] border-[var(--glass-border)] hover:border-[var(--sage)]/40'
                    }`}
                    style={role === 'CLIENT' ? { background: 'var(--sage)', borderColor: 'var(--sage)' } : { background: 'var(--glass-bg)' }}
                  >
                    Client / Student
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 font-medium text-center">{error}</p>
            )}

            <Button 
              type="submit" 
              disabled={loading}
              className="w-full transition-all rounded-xl py-5 font-semibold"
              style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}
            >
              {loading ? 'Please wait...' : isLogin ? 'Login' : 'Create Account'}
            </Button>
          </form>

          <div className="relative flex items-center justify-center my-4">
            <span className="absolute w-full border-t" style={{ borderColor: 'var(--glass-border)' }}></span>
            <span className="relative bg-white dark:bg-[#16221e] px-3 text-xs font-medium uppercase" style={{ color: 'var(--ink-muted)' }}>Or continue with</span>
          </div>

          <Button 
            type="button" 
            variant="outline" 
            onClick={handleGoogleAuth} 
            disabled={loading}
            className="w-full transition-all rounded-xl py-5 flex items-center justify-center gap-2"
            style={{ background: 'var(--glass-bg)', borderColor: 'var(--glass-border)', color: 'var(--ink)' }}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Google Auth
          </Button>
        </CardContent>
        <CardFooter className="justify-center pt-2 pb-6">
          <button 
            onClick={() => setIsLogin(!isLogin)} 
            className="text-sm font-semibold transition-all rounded-lg px-3 py-1.5"
            style={{ color: 'var(--sage)' }}
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Login'}
          </button>
        </CardFooter>
      </Card>
    </div>
  );
}
