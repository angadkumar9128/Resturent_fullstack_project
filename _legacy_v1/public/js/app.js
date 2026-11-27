const $ = (s) => document.querySelector(s);
const money = (n) => '₹' + Number(n).toLocaleString('en-IN');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let menu = [];
let activeCategory = 'All';
let cart = JSON.parse(localStorage.getItem('cart') || '{}'); // { id: qty }

async function api(url, options) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function say(el, text, ok) {
  el.textContent = text;
  el.className = 'msg ' + (ok ? 'ok' : 'err');
}

// ---------- menu ----------
async function loadMenu() {
  menu = await api('/api/menu');
  // drop cart entries for items that no longer exist
  for (const id of Object.keys(cart)) if (!menu.find((m) => m.id === Number(id))) delete cart[id];
  renderTabs();
  renderMenu();
  renderCart();
}

function renderTabs() {
  const cats = ['All', ...new Set(menu.map((m) => m.category))];
  $('#categoryTabs').innerHTML = cats
    .map((c) => `<button class="tab ${c === activeCategory ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`)
    .join('');
}

function renderMenu() {
  const items = menu.filter((m) => activeCategory === 'All' || m.category === activeCategory);
  $('#menuGrid').innerHTML = items.length
    ? items
        .map(
          (m) => `
    <div class="card">
      <h3><span class="dot ${m.veg ? 'veg' : 'nonveg'}"></span>${esc(m.name)}</h3>
      <p>${esc(m.description)}</p>
      <div class="card-foot">
        <span class="price">${money(m.price)}</span>
        <button class="btn btn-small" data-add="${m.id}">Add</button>
      </div>
    </div>`
        )
        .join('')
    : '<p class="empty">No items available.</p>';
}

$('#categoryTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  activeCategory = b.dataset.cat;
  renderTabs();
  renderMenu();
});

$('#menuGrid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-add]');
  if (!b) return;
  changeQty(Number(b.dataset.add), 1);
  openCart();
});

// ---------- cart ----------
function changeQty(id, delta) {
  const next = (cart[id] || 0) + delta;
  if (next <= 0) delete cart[id];
  else cart[id] = Math.min(next, 50);
  localStorage.setItem('cart', JSON.stringify(cart));
  renderCart();
}

function cartTotal() {
  return Object.entries(cart).reduce((sum, [id, qty]) => {
    const m = menu.find((x) => x.id === Number(id));
    return sum + (m ? m.price * qty : 0);
  }, 0);
}

function renderCart() {
  const entries = Object.entries(cart);
  $('#cartCount').textContent = entries.reduce((s, [, q]) => s + q, 0);
  $('#cartTotal').textContent = money(cartTotal());
  $('#cartItems').innerHTML = entries.length
    ? entries
        .map(([id, qty]) => {
          const m = menu.find((x) => x.id === Number(id));
          if (!m) return '';
          return `
      <div class="cart-row">
        <div><strong>${esc(m.name)}</strong><br /><small>${money(m.price)}</small></div>
        <div class="qty">
          <button data-dec="${id}">−</button><span>${qty}</span><button data-inc="${id}">+</button>
        </div>
      </div>`;
        })
        .join('')
    : '<p class="empty">Your cart is empty.</p>';
}

$('#cartItems').addEventListener('click', (e) => {
  const inc = e.target.closest('[data-inc]');
  const dec = e.target.closest('[data-dec]');
  if (inc) changeQty(Number(inc.dataset.inc), 1);
  if (dec) changeQty(Number(dec.dataset.dec), -1);
});

function openCart() { $('#cartDrawer').classList.add('open'); $('#overlay').classList.add('show'); }
function closeCart() { $('#cartDrawer').classList.remove('open'); $('#overlay').classList.remove('show'); }
$('#cartBtn').addEventListener('click', openCart);
$('#closeCart').addEventListener('click', closeCart);
$('#overlay').addEventListener('click', closeCart);

// ---------- checkout ----------
$('#checkoutForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#checkoutMsg');
  const items = Object.entries(cart).map(([id, qty]) => ({ id: Number(id), qty }));
  if (!items.length) return say(msg, 'Your cart is empty.', false);
  const form = Object.fromEntries(new FormData(e.target));
  try {
    const order = await api('/api/orders', { method: 'POST', body: JSON.stringify({ ...form, items }) });
    cart = {};
    localStorage.setItem('cart', '{}');
    renderCart();
    e.target.reset();
    say(msg, `Order #${order.id} placed! Total ${money(order.total)}. Save your order number to track it.`, true);
  } catch (err) {
    say(msg, err.message, false);
  }
});

// ---------- reservation ----------
const dateInput = document.querySelector('#reserveForm [name=date]');
dateInput.min = new Date().toISOString().slice(0, 10);

$('#reserveForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#reserveMsg');
  const form = Object.fromEntries(new FormData(e.target));
  try {
    const r = await api('/api/reservations', { method: 'POST', body: JSON.stringify(form) });
    e.target.reset();
    say(msg, `Reservation #${r.id} received for ${r.date} at ${r.time}. We'll confirm shortly.`, true);
  } catch (err) {
    say(msg, err.message, false);
  }
});

// ---------- tracking ----------
$('#trackForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const box = $('#trackResult');
  try {
    const o = await api('/api/orders/' + $('#trackId').value);
    const cls = o.status.split(' ')[0];
    box.className = 'msg';
    box.innerHTML = `Order #${o.id}: <span class="badge ${cls}">${esc(o.status)}</span> · ${money(o.total)}<br />
      <small>${o.items.map((i) => `${esc(i.name)} × ${i.qty}`).join(', ')}</small>`;
  } catch (err) {
    say(box, err.message, false);
  }
});

$('#year').textContent = new Date().getFullYear();
loadMenu().catch(() => {
  $('#menuGrid').innerHTML = '<p class="empty">Could not load the menu. Is the server running?</p>';
});
