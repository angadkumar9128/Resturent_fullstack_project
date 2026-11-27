const $ = (s) => document.querySelector(s);
const money = (n) => '₹' + Number(n).toLocaleString('en-IN');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (iso) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

const ORDER_STATUSES = ['Pending', 'Preparing', 'Out for Delivery', 'Completed', 'Cancelled'];
const RES_STATUSES = ['Pending', 'Confirmed', 'Cancelled'];

let token = sessionStorage.getItem('adminToken');
let editingId = null;
let menuCache = [];

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) { logout(); throw new Error('Session expired'); }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ---------- auth ----------
function showDashboard() {
  $('#loginView').hidden = true;
  $('#dashView').hidden = false;
  $('#logoutBtn').hidden = false;
  refreshAll();
}

function logout() {
  token = null;
  sessionStorage.removeItem('adminToken');
  $('#loginView').hidden = false;
  $('#dashView').hidden = true;
  $('#logoutBtn').hidden = true;
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#loginMsg');
  const body = JSON.stringify(Object.fromEntries(new FormData(e.target)));
  try {
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    token = data.token;
    sessionStorage.setItem('adminToken', token);
    e.target.reset();
    msg.textContent = '';
    showDashboard();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg err';
  }
});

$('#logoutBtn').addEventListener('click', logout);

// ---------- tabs ----------
document.querySelector('.admin-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]');
  if (!b) return;
  document.querySelectorAll('.admin-tabs .tab').forEach((t) => t.classList.toggle('active', t === b));
  for (const v of ['orders', 'reservations', 'menu']) $('#' + v + 'View').hidden = v !== b.dataset.view;
});

function refreshAll() {
  loadStats(); loadOrders(); loadReservations(); loadMenu();
}

// ---------- stats ----------
async function loadStats() {
  const s = await api('/api/admin/stats');
  $('#stats').innerHTML = [
    ['Total orders', s.totalOrders],
    ['Pending orders', s.pendingOrders],
    ['Revenue (completed)', money(s.revenue)],
    ["Today's reservations", s.todayReservations],
    ['Menu items', s.menuItems],
  ].map(([l, v]) => `<div class="stat"><span>${l}</span><strong>${v}</strong></div>`).join('');
}

const statusSelect = (list, current, attr, id) =>
  `<select ${attr}="${id}">${list.map((s) => `<option ${s === current ? 'selected' : ''}>${s}</option>`).join('')}</select>`;

// ---------- orders ----------
async function loadOrders() {
  const orders = await api('/api/admin/orders');
  $('#ordersView').innerHTML = orders.length
    ? `<div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Customer</th><th>Items</th><th>Total</th><th>Placed</th><th>Status</th></tr></thead>
      <tbody>${orders.map((o) => `
        <tr>
          <td>${o.id}</td>
          <td><strong>${esc(o.customerName)}</strong><br>${esc(o.phone)}<br><small>${esc(o.address)}</small>${o.notes ? `<br><small><em>${esc(o.notes)}</em></small>` : ''}</td>
          <td>${o.items.map((i) => `${esc(i.name)} × ${i.qty}`).join('<br>')}</td>
          <td>${money(o.total)}</td>
          <td>${fmtDate(o.createdAt)}</td>
          <td>${statusSelect(ORDER_STATUSES, o.status, 'data-order', o.id)}</td>
        </tr>`).join('')}</tbody></table></div>`
    : '<p class="empty">No orders yet.</p>';
}

$('#ordersView').addEventListener('change', async (e) => {
  const id = e.target.dataset.order;
  if (!id) return;
  try {
    await api('/api/admin/orders/' + id, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) });
    loadStats();
  } catch (err) { alert(err.message); loadOrders(); }
});

// ---------- reservations ----------
async function loadReservations() {
  const list = await api('/api/admin/reservations');
  $('#reservationsView').innerHTML = list.length
    ? `<div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Guest</th><th>Date & time</th><th>Guests</th><th>Notes</th><th>Status</th></tr></thead>
      <tbody>${list.map((r) => `
        <tr>
          <td>${r.id}</td>
          <td><strong>${esc(r.name)}</strong><br>${esc(r.phone)}</td>
          <td>${esc(r.date)} · ${esc(r.time)}</td>
          <td>${r.guests}</td>
          <td>${esc(r.notes)}</td>
          <td>${statusSelect(RES_STATUSES, r.status, 'data-res', r.id)}</td>
        </tr>`).join('')}</tbody></table></div>`
    : '<p class="empty">No reservations yet.</p>';
}

$('#reservationsView').addEventListener('change', async (e) => {
  const id = e.target.dataset.res;
  if (!id) return;
  try {
    await api('/api/admin/reservations/' + id, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) });
    loadStats();
  } catch (err) { alert(err.message); loadReservations(); }
});

// ---------- menu management ----------
async function loadMenu() {
  menuCache = await api('/api/admin/menu');
  renderMenuAdmin();
}

function renderMenuAdmin() {
  const editing = menuCache.find((m) => m.id === editingId) || {};
  $('#menuView').innerHTML = `
    <form id="menuForm" class="menu-form">
      <input name="name" placeholder="Item name" value="${esc(editing.name)}" required />
      <input name="category" placeholder="Category" value="${esc(editing.category)}" />
      <input name="price" type="number" min="0" step="1" placeholder="Price (₹)" value="${editing.price ?? ''}" required />
      <label class="check"><input type="checkbox" name="veg" ${editing.veg ?? true ? 'checked' : ''} /> Veg</label>
      <label class="check"><input type="checkbox" name="available" ${editing.available ?? true ? 'checked' : ''} /> Available</label>
      <textarea class="wide" name="description" placeholder="Description">${esc(editing.description)}</textarea>
      <div class="wide row-actions">
        <button class="btn" type="submit">${editingId ? 'Save changes' : 'Add item'}</button>
        ${editingId ? '<button class="btn btn-ghost" type="button" id="cancelEdit">Cancel</button>' : ''}
      </div>
    </form>
    <div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Type</th><th>Available</th><th></th></tr></thead>
      <tbody>${menuCache.map((m) => `
        <tr>
          <td><strong>${esc(m.name)}</strong><br><small>${esc(m.description)}</small></td>
          <td>${esc(m.category)}</td>
          <td>${money(m.price)}</td>
          <td>${m.veg ? 'Veg' : 'Non-veg'}</td>
          <td>${m.available ? 'Yes' : 'No'}</td>
          <td class="row-actions">
            <button class="btn btn-small btn-ghost" data-edit="${m.id}">Edit</button>
            <button class="btn btn-small btn-danger" data-del="${m.id}">Delete</button>
          </td>
        </tr>`).join('')}</tbody></table></div>`;
}

$('#menuView').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = {
    name: f.name.value,
    category: f.category.value,
    price: Number(f.price.value),
    description: f.description.value,
    veg: f.veg.checked,
    available: f.available.checked,
  };
  try {
    if (editingId) await api('/api/admin/menu/' + editingId, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/api/admin/menu', { method: 'POST', body: JSON.stringify(body) });
    editingId = null;
    await loadMenu();
    loadStats();
  } catch (err) { alert(err.message); }
});

$('#menuView').addEventListener('click', async (e) => {
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-del]');
  if (e.target.id === 'cancelEdit') { editingId = null; renderMenuAdmin(); }
  if (edit) { editingId = Number(edit.dataset.edit); renderMenuAdmin(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  if (del && confirm('Delete this menu item?')) {
    try {
      await api('/api/admin/menu/' + del.dataset.del, { method: 'DELETE' });
      await loadMenu();
      loadStats();
    } catch (err) { alert(err.message); }
  }
});

// ---------- init ----------
if (token) showDashboard();
