'use client';

import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useState } from 'react';

async function sendOtp(phone: string) {
  const res = await fetch('/api/otp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Could not send OTP');
}

export default function LoginPage() {
  const [phone, setPhone] = useState('+91');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function requestCode() {
    setBusy(true); setError('');
    try { await sendOtp(phone); setSent(true); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function verify() {
    setBusy(true); setError('');
    try { const result = await signIn('otp', { phone, code, redirect: false, callbackUrl: '/' }); if (result?.error) throw new Error('Incorrect or expired code. Please try again.'); window.location.href = result?.url || '/'; }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="grid min-h-screen place-items-center bg-[#f1e9dc] p-5"><div className="paper-card w-full max-w-md p-8"><Link href="/" className="text-sm font-bold text-spice">← Back to Spice Garden</Link><p className="eyebrow mt-8 text-spice">Welcome back</p><h1 className="mt-2 font-display text-4xl">Your table is ready.</h1><p className="mt-3 text-sm leading-6 text-[#786e61]">Sign in securely with a one-time code sent to your mobile number.</p><label className="mt-7 block text-sm font-semibold">Mobile number<input className="field mt-2" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+919876543210" /></label>{sent && <label className="mt-4 block text-sm font-semibold">6-digit verification code<input className="field mt-2 tracking-[.3em]" value={code} onChange={e=>setCode(e.target.value)} maxLength={6} inputMode="numeric" placeholder="••••••" /></label>}{error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={busy} onClick={sent ? verify : requestCode} className="btn-primary mt-6 w-full">{busy ? 'Please wait…' : sent ? 'Verify & sign in' : 'Send OTP'}</button><p className="mt-5 text-xs leading-5 text-[#8b7d6b]">In local development, the OTP is printed in the server terminal when OTP_PROVIDER=console. Staff should use the configured email/password provider.</p></div></main>;
}
