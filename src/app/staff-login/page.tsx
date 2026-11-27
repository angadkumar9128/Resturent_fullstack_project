'use client';

import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useState } from 'react';

export default function StaffLoginPage(){
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await signIn('password',{email,password,redirect:false,callbackUrl:'/admin'});if(r?.error)throw new Error('Invalid credentials or your staff account is disabled.');window.location.href=r?.url||'/admin';}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <main className="grid min-h-screen place-items-center bg-[#f1e9dc] p-5"><form onSubmit={submit} className="paper-card w-full max-w-md p-8"><Link href="/" className="text-sm font-bold text-spice">← Spice Garden</Link><p className="eyebrow mt-8 text-spice">Team access</p><h1 className="mt-2 font-display text-4xl">Staff sign in</h1><label className="mt-7 block text-sm font-semibold">Email<input required type="email" className="field mt-2" value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="mt-4 block text-sm font-semibold">Password<input required type="password" className="field mt-2" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}<button disabled={busy} className="btn-primary mt-6 w-full">{busy?'Signing in…':'Sign in'}</button></form></main>;
}
