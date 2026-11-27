'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Branch = { id: string; name: string };
type Slot = { time: string; tablesLeft: number; available: boolean };
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || 'Request failed');
  return body.data as T;
}
export default function ReservationForm() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [date, setDate] = useState(new Date(Date.now()+86_400_000).toISOString().slice(0,10));
  const [partySize, setPartySize] = useState(2);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [time, setTime] = useState('');
  const [form, setForm] = useState({ name:'', phone:'', email:'', occasion:'NONE', specialRequests:'' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(()=>{ request<Branch[]>('/api/branches').then(v=>{setBranches(v);setBranchId(v[0]?.id||'');}).catch(e=>setMessage(e.message)); },[]);
  useEffect(()=>{ if(!branchId||!date)return; request<{slots:Slot[]}>('/api/reservations/availability?'+new URLSearchParams({branchId,date,partySize:String(partySize)})).then(v=>{setSlots(v.slots);setTime(v.slots.find(s=>s.available)?.time||'');}).catch(e=>setMessage(e.message)); },[branchId,date,partySize]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();setBusy(true);setMessage('');
    try { const result=await request<{confirmationCode:string;tableCode:string|null}>('/api/reservations',{method:'POST',body:JSON.stringify({branchId,date,time,partySize,...form})});setMessage('Your table is confirmed. Confirmation code: '+result.confirmationCode+(result.tableCode?' · Table '+result.tableCode:'')); }
    catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
  }
  return <main className="min-h-screen bg-[#f1e9dc] py-10"><div className="container-page max-w-2xl"><Link href="/" className="text-sm font-bold text-spice">← Spice Garden</Link><div className="paper-card mt-6 p-7 sm:p-10"><p className="eyebrow text-spice">A place at the table</p><h1 className="mt-2 font-display text-4xl">Reserve your table.</h1><p className="mt-3 text-sm text-[#786e61]">Choose a time and we’ll take care of the rest.</p><form onSubmit={submit} className="mt-8 space-y-4"><label className="block text-sm font-semibold">Branch<select className="field mt-1" value={branchId} onChange={e=>setBranchId(e.target.value)}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">Date<input type="date" min={new Date().toISOString().slice(0,10)} className="field mt-1" value={date} onChange={e=>setDate(e.target.value)} /></label><label className="text-sm font-semibold">Guests<select className="field mt-1" value={partySize} onChange={e=>setPartySize(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(n=><option key={n} value={n}>{n} {n===1?'guest':'guests'}</option>)}</select></label></div><div><p className="mb-2 text-sm font-semibold">Available times</p><div className="flex flex-wrap gap-2">{slots.filter(s=>s.available).map(s=><button type="button" key={s.time} onClick={()=>setTime(s.time)} className={time===s.time?'btn-primary':'btn-secondary'}>{s.time}</button>)}{slots.every(s=>!s.available)&&<p className="text-sm text-[#8b7d6b]">No times available. Try another date.</p>}</div></div><div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">Your name<input required minLength={2} className="field mt-1" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></label><label className="text-sm font-semibold">Mobile number<input required className="field mt-1" placeholder="+919876543210" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></label></div><label className="block text-sm font-semibold">Email (optional)<input type="email" className="field mt-1" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></label><label className="block text-sm font-semibold">Occasion<select className="field mt-1" value={form.occasion} onChange={e=>setForm(f=>({...f,occasion:e.target.value}))}>{['NONE','BIRTHDAY','ANNIVERSARY','BUSINESS','OTHER'].map(v=><option key={v}>{v}</option>)}</select></label><label className="block text-sm font-semibold">Special requests<textarea className="field mt-1" rows={2} value={form.specialRequests} onChange={e=>setForm(f=>({...f,specialRequests:e.target.value}))}/></label>{message&&<p role="status" className="rounded-lg bg-[#fff2e8] p-3 text-sm text-spice">{message}</p>}<button disabled={busy||!time} className="btn-primary w-full disabled:opacity-50">{busy?'Booking…':'Confirm reservation'}</button></form></div></div></main>;
}
