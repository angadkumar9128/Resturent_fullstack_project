'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useEffect, useMemo, useState } from 'react';
import type { BranchDto, MenuDto, MenuItemDto } from '@/modules/menu/menu.types';

type CartLine = { key: string; menuItemId: string; variantId?: string; addonIds: string[]; quantity: number; instructions?: string; item: MenuItemDto; variantName?: string; unitPricePaise: number; addons: { id: string; name: string; pricePaise: number }[] };
type Quote = { pricing: { subtotalPaise: number; discountPaise: number; cgstPaise: number; sgstPaise: number; packagingPaise: number; deliveryFeePaise: number; totalPaise: number }; delivery: { etaMinutes: number } | null };
const money = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || 'Something went wrong. Please try again.');
  return (body.data ?? body) as T;
}
const inputClass = 'field';

export default function Storefront() {
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [branch, setBranch] = useState<BranchDto | null>(null);
  const [menu, setMenu] = useState<MenuDto | null>(null);
  const [category, setCategory] = useState('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customItem, setCustomItem] = useState<MenuItemDto | null>(null);
  const [variantId, setVariantId] = useState('');
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [instructions, setInstructions] = useState('');
  const [orderType, setOrderType] = useState<'DELIVERY'|'TAKEAWAY'|'DINE_IN'>('TAKEAWAY');
  const [paymentMethod, setPaymentMethod] = useState<'UPI'|'CARD'|'NETBANKING'|'WALLET'|'COD'|'PAY_AT_COUNTER'>('UPI');
  const [pincode, setPincode] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' });
  const [address, setAddress] = useState({ name: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '' });
  const [tableCode, setTableCode] = useState('');
  const [notes, setNotes] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [order, setOrder] = useState<{ id: string; orderNumber: string; status: string } | null>(null);
  const [codCode, setCodCode] = useState('');

  useEffect(() => {
    api<BranchDto[]>('/api/branches').then(async (list) => {
      setBranches(list);
      const first = list[0];
      if (first) {
        setBranch(first);
        const data = await api<MenuDto>('/api/menu?branch=' + encodeURIComponent(first.slug));
        setMenu(data);
      }
    }).catch(e => setMessage(e.message));
  }, []);

  const categories = menu?.categories ?? [];
  const visibleCategories = useMemo(() => category === 'all' ? categories : categories.filter(c => c.slug === category), [categories, category]);
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = cart.reduce((sum, line) => sum + line.unitPricePaise * line.quantity + line.addons.reduce((a, x) => a + x.pricePaise, 0) * line.quantity, 0);

  function openCustomizer(item: MenuItemDto) {
    setCustomItem(item);
    setVariantId((item.variants.find(v => v.isDefault) ?? item.variants[0])?.id ?? '');
    setAddonIds([]);
    setInstructions('');
  }
  function addCustomized() {
    if (!customItem) return;
    const variant = customItem.variants.find(v => v.id === variantId);
    const addons = customItem.addonGroups.flatMap(g => g.addons).filter(a => addonIds.includes(a.id));
    const unit = variant?.pricePaise ?? customItem.basePricePaise;
    const key = [customItem.id, variantId, [...addonIds].sort().join(',')].join(':');
    setCart(old => {
      const found = old.find(x => x.key === key);
      if (found) return old.map(x => x.key === key ? { ...x, quantity: x.quantity + 1 } : x);
      return [...old, { key, menuItemId: customItem.id, variantId: variant?.id, addonIds, quantity: 1, instructions: instructions || undefined, item: customItem, variantName: variant?.name, unitPricePaise: unit, addons }];
    });
    setCustomItem(null);
    setQuote(null);
  }
  function changeQty(key: string, delta: number) {
    setCart(old => old.map(x => x.key === key ? { ...x, quantity: x.quantity + delta } : x).filter(x => x.quantity > 0));
    setQuote(null);
  }
  async function getQuote() {
    if (!cart.length) return;
    if (orderType === 'DELIVERY' && !pincode) { setMessage('Enter your delivery PIN code first.'); return; }
    setBusy(true); setMessage('');
    try {
      const q = await api<Quote>('/api/pricing/quote', { method: 'POST', body: JSON.stringify({ type: orderType, branchId: branch?.id, items: cart.map(({ menuItemId, variantId, addonIds, quantity, instructions }) => ({ menuItemId, variantId, addonIds, quantity, instructions })), pincode: orderType === 'DELIVERY' ? pincode : undefined, couponCode: couponCode || undefined }) });
      setQuote(q);
    } catch (e) { setMessage((e as Error).message); setQuote(null); }
    finally { setBusy(false); }
  }
  async function checkout() {
    if (!cart.length) return;
    if (orderType === 'DELIVERY' && !address.pincode) { setMessage('Complete your delivery address.'); return; }
    if (orderType === 'DINE_IN' && !tableCode.trim()) { setMessage('Enter the table code from your QR card.'); return; }
    setBusy(true); setMessage('');
    try {
      const result = await api<{ order: { id: string; orderNumber: string; status: string }; next: string; payment?: { keyId: string; razorpayOrderId: string; amountPaise: number; currency: string; orderId: string; orderNumber: string; prefill: { name: string; phone: string; email: string | null } } }>('/api/checkout', { method: 'POST', body: JSON.stringify({ type: orderType, branchId: branch?.id, items: cart.map(({ menuItemId, variantId, addonIds, quantity, instructions }) => ({ menuItemId, variantId, addonIds, quantity, instructions })), pincode: orderType === 'DELIVERY' ? address.pincode : undefined, couponCode: couponCode || undefined, customer, address: orderType === 'DELIVERY' ? address : undefined, tableCode: orderType === 'DINE_IN' ? tableCode : undefined, paymentMethod, notes }) });
      setOrder(result.order);
      if (result.next === 'ONLINE_PAYMENT' && result.payment) {
        const Razorpay = (window as unknown as { Razorpay?: new (options: Record<string, unknown>) => { open: () => void } }).Razorpay;
        if (!Razorpay) throw new Error('Payment checkout is still loading. Refresh and try again.');
        const p = result.payment;
        const checkoutUi = new Razorpay({ key: p.keyId, amount: p.amountPaise, currency: p.currency, name: 'Spice Garden', description: 'Order ' + p.orderNumber, order_id: p.razorpayOrderId, prefill: p.prefill, theme: { color: '#b94d2c' }, handler: async (response: Record<string, string>) => {
          try { await api('/api/payments/razorpay/verify', { method: 'POST', body: JSON.stringify({ orderId: p.orderId, razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature }) }); setMessage('Payment verified. Your order is confirmed!'); }
          catch (e) { setMessage((e as Error).message); }
        } });
        checkoutUi.open();
      } else if (result.next === 'COD_OTP') {
        await api('/api/payments/cod/send', { method: 'POST', body: JSON.stringify({ orderId: result.order.id }) });
        setMessage('We sent a verification code to your registered mobile number. Enter it below to confirm COD.');
      } else {
        setMessage('Order placed successfully!');
        setCart([]); setQuote(null);
      }
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  async function verifyCod() {
    if (!order) return;
    setBusy(true);
    try { await api('/api/payments/cod/verify', { method: 'POST', body: JSON.stringify({ orderId: order.id, code: codCode }) }); setMessage('Mobile verified. Your COD order is confirmed!'); setCart([]); }
    catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }

  return <>
    <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
    <header className="sticky top-0 z-30 border-b border-[#e9e1d3] bg-[#fbf8f1]/95 backdrop-blur">
      <div className="container-page flex h-[72px] items-center justify-between">
        <Link href="/" className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-spice text-xl text-white">✳</span><span><b className="font-display text-xl">Spice Garden</b><span className="block text-[10px] tracking-[.22em] text-[#8d7c68]">INDIAN KITCHEN · EST. 2024</span></span></Link>
        <nav className="hidden items-center gap-7 text-sm font-semibold md:flex"><a href="#menu">Menu</a><Link href="/reserve">Reservations</Link><Link href="/kitchen">Kitchen</Link><Link href="/admin">Admin</Link><Link href="/login" className="btn-secondary">Sign in</Link></nav>
        <a href="#cart" className="btn-primary">Your order · {itemCount}</a>
      </div>
    </header>
    <main>
      <section className="relative overflow-hidden bg-[#29251f] text-white">
        <div className="container-page grid min-h-[430px] items-center gap-8 py-16 md:grid-cols-[1.1fr_.9fr]">
          <div className="relative z-10"><p className="eyebrow mb-5 text-[#e5a13b]">A little warmth in every bite</p><h1 className="max-w-2xl font-display text-5xl leading-[1.05] md:text-7xl">Good food.<br/><span className="italic text-[#e9b96c]">Good company.</span><br/>Great memories.</h1><p className="mt-6 max-w-lg leading-7 text-[#d2c8b9]">Thoughtful Indian cooking, familiar flavours and ingredients worth gathering around. Freshly prepared, just the way you like it.</p><a href="#menu" className="btn-primary mt-8">Explore the menu <span className="ml-2">↗</span></a></div>
          <div className="relative mx-auto grid aspect-square w-full max-w-[390px] place-items-center rounded-full border border-[#6b5b45] bg-[radial-gradient(circle_at_50%_45%,#72543b,#332c24_65%)]"><div className="absolute inset-7 rounded-full border border-dashed border-[#c29b67]/60"/><div className="text-center"><div className="text-8xl">🍛</div><p className="mt-3 font-display text-2xl italic text-[#f0d5a6]">Made with care</p><p className="eyebrow mt-2 text-[#c7b9a5]">From our kitchen to you</p></div><span className="absolute right-5 top-10 rounded-full bg-[#e5a13b] px-4 py-2 text-xs font-bold text-[#29251f]">Fresh · Local · Loved</span></div>
        </div>
      </section>
      <section className="container-page py-14" id="menu">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-spice">The good stuff</p><h2 className="mt-2 font-display text-4xl">Our menu</h2><p className="mt-2 text-sm text-[#786e61]">A few favourites, made fresh when you order.</p></div>{branches.length > 1 && <select className={inputClass+" max-w-[220px]"} value={branch?.id ?? ''} onChange={async e => { const b = branches.find(x => x.id === e.target.value); if (b) { setBranch(b); setMenu(await api<MenuDto>('/api/menu?branch='+encodeURIComponent(b.slug))); setCart([]); } }} aria-label="Choose branch">{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}</div>
        <div className="mb-8 flex gap-2 overflow-x-auto pb-2"><button onClick={() => setCategory('all')} className={category === 'all' ? 'btn-primary whitespace-nowrap' : 'btn-secondary whitespace-nowrap'}>Everything</button>{categories.map(c => <button key={c.id} onClick={() => setCategory(c.slug)} className={category === c.slug ? 'btn-primary whitespace-nowrap' : 'btn-secondary whitespace-nowrap'}>{c.name}</button>)}</div>
        {!menu && <div className="paper-card p-8 text-center text-[#786e61]">Loading today's menu…</div>}
        {menu && <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{visibleCategories.flatMap(c => c.items).map(item => <article key={item.id} className="paper-card overflow-hidden">
          <div className="relative grid h-40 place-items-center bg-[linear-gradient(135deg,#eadfce,#f8f1e5)]"><span className="text-7xl">{item.diet === 'NON_VEG' ? '🍗' : item.diet === 'EGG' ? '🍳' : '🥘'}</span>{item.isBestseller && <span className="absolute left-3 top-3 rounded-full bg-[#e5a13b] px-3 py-1 text-[10px] font-bold uppercase tracking-wider">Bestseller</span>}<span className="absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1 text-xs">{item.diet === 'VEG' ? '🟢 Veg' : item.diet === 'NON_VEG' ? '🔺 Non-veg' : '🥚 Egg'}</span></div>
          <div className="p-5"><div className="flex items-start justify-between gap-3"><h3 className="font-display text-xl">{item.name}</h3><b className="whitespace-nowrap text-spice">{money(item.basePricePaise)}</b></div><p className="mt-2 min-h-10 text-sm leading-5 text-[#786e61]">{item.description || 'A Spice Garden favourite, prepared fresh to order.'}</p><div className="mt-4 flex items-center justify-between"><span className="text-xs text-[#8b7d6b]">{item.spiceLevel !== 'NONE' ? item.spiceLevel.toLowerCase()+' spice' : 'Gentle flavours'}{item.jainAvailable ? ' · Jain option' : ''}</span><button disabled={!item.available} onClick={() => openCustomizer(item)} className="btn-primary disabled:cursor-not-allowed disabled:bg-gray-400">{item.available ? 'Add +' : 'Sold out'}</button></div></div>
        </article>)}</div>}
      </section>
      <section className="bg-[#f1e9dc] py-14"><div className="container-page grid gap-8 md:grid-cols-3"><div><p className="eyebrow text-spice">More than a meal</p><h2 className="mt-2 font-display text-3xl">Make room for moments.</h2></div><div><div className="text-3xl">🥂</div><h3 className="mt-3 font-display text-xl">Gather around</h3><p className="mt-2 text-sm leading-6 text-[#786e61]">Planning a dinner with friends or family? Reserve your table in a few simple steps.</p><Link href="/reserve" className="mt-4 inline-block text-sm font-bold text-spice">Book a table →</Link></div><div><div className="text-3xl">🛵</div><h3 className="mt-3 font-display text-xl">At your doorstep</h3><p className="mt-2 text-sm leading-6 text-[#786e61]">Choose delivery or takeaway and enjoy the comfort of a freshly made meal.</p><a href="#cart" className="mt-4 inline-block text-sm font-bold text-spice">Start an order →</a></div></div></section>
      <section className="container-page grid gap-8 py-14 lg:grid-cols-[1fr_390px]" id="cart">
        <div><p className="eyebrow text-spice">Checkout</p><h2 className="mt-2 font-display text-4xl">Your table is waiting.</h2><p className="mt-2 text-sm text-[#786e61]">Your cart is priced securely on the server before you place the order.</p>
          <div className="paper-card mt-6 p-6"><h3 className="font-display text-2xl">How would you like it?</h3><div className="mt-4 grid grid-cols-3 gap-2">{(['DELIVERY','TAKEAWAY','DINE_IN'] as const).map(t => <button key={t} onClick={() => { setOrderType(t); setPaymentMethod(t === 'DINE_IN' ? 'PAY_AT_COUNTER' : t === 'DELIVERY' ? 'UPI' : 'UPI'); setQuote(null); }} className={orderType === t ? 'rounded-xl border-2 border-spice bg-[#fff5ee] p-3 text-sm font-bold text-spice' : 'rounded-xl border border-[#e9e1d3] p-3 text-sm font-semibold'}>{t === 'DINE_IN' ? 'Dine in' : t === 'TAKEAWAY' ? 'Takeaway' : 'Delivery'}</button>)}</div>
            {orderType === 'DELIVERY' && <div className="mt-4 grid gap-3 sm:grid-cols-2">{Object.entries(address).map(([key, value]) => <label key={key} className="text-xs font-semibold capitalize text-[#786e61]">{key.replace(/([A-Z])/g,' $1')}<input className={inputClass+" mt-1"} value={value} onChange={e => setAddress(a => ({ ...a, [key]: e.target.value }))} required={['name','line1','city','state','pincode'].includes(key)} /></label>)}</div>}
            {orderType === 'DINE_IN' && <label className="mt-4 block text-sm font-semibold">Table code from your QR card<input className={inputClass+" mt-2"} value={tableCode} onChange={e => setTableCode(e.target.value.toUpperCase())} placeholder="e.g. T12"/></label>}
            <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-[#786e61]">Your name<input className={inputClass+" mt-1"} value={customer.name} onChange={e => setCustomer(c => ({...c,name:e.target.value}))} /></label><label className="text-xs font-semibold text-[#786e61]">Mobile number<input className={inputClass+" mt-1"} value={customer.phone} onChange={e => setCustomer(c => ({...c,phone:e.target.value}))} placeholder="+91…" /></label><label className="text-xs font-semibold text-[#786e61] sm:col-span-2">Email (optional)<input className={inputClass+" mt-1"} value={customer.email} onChange={e => setCustomer(c => ({...c,email:e.target.value}))} /></label></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-[#786e61]">Payment method<select className={inputClass+" mt-1"} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as typeof paymentMethod)}>{(orderType === 'DELIVERY' ? ['UPI','CARD','NETBANKING','WALLET','COD'] : orderType === 'DINE_IN' ? ['PAY_AT_COUNTER','UPI','CARD'] : ['UPI','CARD','NETBANKING','WALLET']).map(x => <option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}</select></label><label className="text-xs font-semibold text-[#786e61]">Promo code<input className={inputClass+" mt-1"} value={couponCode} onChange={e => {setCouponCode(e.target.value.toUpperCase());setQuote(null);}} placeholder="Optional" /></label></div>
            <label className="mt-4 block text-xs font-semibold text-[#786e61]">Anything else we should know?<textarea className={inputClass+" mt-1"} rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></label>
            <div className="mt-5 flex flex-wrap gap-3"><button onClick={getQuote} disabled={busy || !cart.length} className="btn-secondary disabled:opacity-50">{busy ? 'Please wait…' : 'Calculate total'}</button><button onClick={checkout} disabled={busy || !cart.length} className="btn-primary disabled:opacity-50">{busy ? 'Processing…' : 'Place order'}</button></div>
            <p className="mt-3 text-xs text-[#8b7d6b]">Delivery and takeaway require sign-in. <Link href="/login" className="font-bold text-spice underline">Sign in with mobile OTP</Link>.</p>
            {message && <p role="status" className="mt-4 rounded-xl bg-[#fff2e8] p-3 text-sm text-spice">{message}</p>}
            {order && <div className="mt-4 rounded-xl bg-[#edf5ec] p-4 text-sm"><b>Order {order.orderNumber}</b><p className="mt-1">Current status: {order.status.replaceAll('_',' ')}</p><Link href={'/track/'+order.id} className="mt-2 inline-block font-bold text-leaf underline">Track your order →</Link></div>}
            {order?.status === 'PENDING_PAYMENT' && paymentMethod === 'COD' && <div className="mt-4 flex gap-2"><input className={inputClass} value={codCode} onChange={e => setCodCode(e.target.value)} placeholder="6-digit OTP"/><button className="btn-primary" onClick={verifyCod}>Verify</button></div>}
          </div>
        </div>
        <aside className="paper-card h-fit p-6 lg:sticky lg:top-24"><div className="flex items-center justify-between"><h3 className="font-display text-2xl">Your basket</h3><span className="rounded-full bg-[#f1e9dc] px-3 py-1 text-xs font-bold">{itemCount} items</span></div>
          {cart.length === 0 ? <p className="py-10 text-center text-sm text-[#8b7d6b]">Your basket is waiting for something delicious.</p> : <div className="mt-5 space-y-4">{cart.map(line => <div key={line.key} className="flex justify-between gap-3 border-b border-[#eee6da] pb-4"><div className="min-w-0"><p className="font-semibold">{line.item.name}</p><p className="text-xs text-[#8b7d6b]">{line.variantName || 'Regular'}{line.addons.length ? ' · '+line.addons.map(a=>a.name).join(', ') : ''}</p><p className="mt-1 text-sm font-bold text-spice">{money((line.unitPricePaise + line.addons.reduce((s,a)=>s+a.pricePaise,0))*line.quantity)}</p></div><div className="flex h-fit items-center gap-2 rounded-full border border-[#ded5c8] px-2 py-1"><button aria-label="Decrease quantity" onClick={()=>changeQty(line.key,-1)}>−</button><span className="text-sm">{line.quantity}</span><button aria-label="Increase quantity" onClick={()=>changeQty(line.key,1)}>+</button></div></div>)}</div>}
          <div className="mt-5 flex justify-between border-t border-[#e9e1d3] pt-4 text-sm"><span>Item subtotal (estimate)</span><b>{money(subtotal)}</b></div>
          {quote && <><div className="mt-3 flex justify-between text-sm"><span>CGST + SGST</span><b>{money(quote.pricing.cgstPaise+quote.pricing.sgstPaise)}</b></div><div className="mt-2 flex justify-between text-sm"><span>Packaging + delivery</span><b>{money(quote.pricing.packagingPaise+quote.pricing.deliveryFeePaise)}</b></div><div className="mt-4 flex justify-between border-t border-[#e9e1d3] pt-4 text-lg"><b>Server total</b><b className="text-spice">{money(quote.pricing.totalPaise)}</b></div>{quote.delivery && <p className="mt-2 text-xs text-[#8b7d6b]">Estimated delivery: {quote.delivery.etaMinutes} minutes</p>}</>}
          <p className="mt-5 text-xs leading-5 text-[#8b7d6b]">Final prices, tax and availability are always recalculated by our server at checkout.</p>
        </aside>
      </section>
    </main>
    <footer className="bg-[#29251f] py-10 text-white"><div className="container-page flex flex-wrap justify-between gap-6"><div><b className="font-display text-2xl">Spice Garden</b><p className="mt-2 text-sm text-[#c7b9a5]">A little warmth in every bite.</p></div><div className="text-sm text-[#c7b9a5]">{branch?.name || 'Our restaurant'}{branch && <><p>{branch.addressLine}, {branch.city}, {branch.state} – {branch.pincode}</p><p className="mt-1">FSSAI: {branch.fssaiNumber} · GSTIN: {branch.gstin}</p></>}</div><div className="flex gap-5 text-sm"><Link href="/reserve">Reservations</Link><Link href="/login">Account</Link><Link href="/admin">Admin</Link></div></div><div className="container-page mt-8 border-t border-[#51483c] pt-5 text-xs text-[#9e907e]">© {new Date().getFullYear()} Spice Garden. All rights reserved. Please inform our team about food allergies before ordering.</div></footer>
    {customItem && <div className="fixed inset-0 z-50 grid place-items-end bg-black/50 p-3 sm:place-items-center"><div role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-paper p-6"><div className="flex justify-between"><div><p className="eyebrow text-spice">Make it yours</p><h3 className="mt-1 font-display text-3xl">{customItem.name}</h3></div><button onClick={()=>setCustomItem(null)} aria-label="Close" className="h-9 w-9 rounded-full border">×</button></div>{customItem.variants.length > 0 && <label className="mt-5 block text-sm font-bold">Choose portion<select className={inputClass+" mt-2"} value={variantId} onChange={e=>setVariantId(e.target.value)}>{customItem.variants.map(v=><option key={v.id} value={v.id}>{v.name} · {money(v.pricePaise)}</option>)}</select></label>}{customItem.addonGroups.map(g=><div key={g.id} className="mt-5"><p className="font-bold">{g.name} <span className="text-xs font-normal text-[#8b7d6b]">(choose up to {g.maxSelect})</span></p>{g.addons.map(a=><label key={a.id} className="mt-2 flex items-center justify-between text-sm"><span>{a.name} · {money(a.pricePaise)}</span><input type="checkbox" checked={addonIds.includes(a.id)} onChange={e=>setAddonIds(old=>e.target.checked ? [...old,a.id] : old.filter(x=>x!==a.id))} disabled={!addonIds.includes(a.id) && addonIds.length >= g.maxSelect}/></label>)}</div>)}<label className="mt-5 block text-sm font-bold">Kitchen instructions<input className={inputClass+" mt-2"} value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="Less spicy, no onion…" /></label><button onClick={addCustomized} className="btn-primary mt-6 w-full">Add to basket</button></div></div>}
  </>;
}
