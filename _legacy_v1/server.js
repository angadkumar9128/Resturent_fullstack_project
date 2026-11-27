const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
const ORDER_STATUSES = ['Pending', 'Preparing', 'Out for Delivery', 'Completed', 'Cancelled'];
const RES_STATUSES = ['Pending', 'Confirmed', 'Cancelled'];

const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ---------- public API ----------
app.get('/api/menu', (req, res) => {
  res.json(db.data.menu.filter((m) => m.available));
});

app.post('/api/orders', (req, res) => {
  const customerName = str(req.body.customerName, 80);
  const phone = str(req.body.phone, 20);
  const address = str(req.body.address, 300);
  const notes = str(req.body.notes, 300);
  const items = Array.isArray(req.body.items) ? req.body.items : [];

  if (!customerName || !/^[0-9+\-\s]{7,20}$/.test(phone) || !address) {
    return res.status(400).json({ error: 'Name, valid phone and address are required' });
  }
  if (items.length === 0) return res.status(400).json({ error: 'Cart is empty' });

  // price is always calculated on the server, never trusted from the client
  const orderItems = [];
  let total = 0;
  for (const it of items) {
    const menuItem = db.data.menu.find((m) => m.id === Number(it.id) && m.available);
    const qty = Math.floor(Number(it.qty));
    if (!menuItem || !(qty >= 1 && qty <= 50)) {
      return res.status(400).json({ error: 'Invalid item in cart' });
    }
    orderItems.push({ id: menuItem.id, name: menuItem.name, price: menuItem.price, qty });
    total += menuItem.price * qty;
  }

  const order = {
    id: db.nextId('orders'),
    customerName,
    phone,
    address,
    notes,
    items: orderItems,
    total,
    status: 'Pending',
    createdAt: new Date().toISOString(),
  };
  db.data.orders.push(order);
  db.save();
  res.status(201).json(order);
});

app.get('/api/orders/:id', (req, res) => {
  const order = db.data.orders.find((o) => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });
  // limited public view
  res.json({ id: order.id, status: order.status, total: order.total, items: order.items, createdAt: order.createdAt });
});

app.post('/api/reservations', (req, res) => {
  const name = str(req.body.name, 80);
  const phone = str(req.body.phone, 20);
  const date = str(req.body.date, 10);
  const time = str(req.body.time, 5);
  const guests = Math.floor(Number(req.body.guests));
  const notes = str(req.body.notes, 300);

  if (!name || !/^[0-9+\-\s]{7,20}$/.test(phone)) {
    return res.status(400).json({ error: 'Name and valid phone are required' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ error: 'Valid date and time are required' });
  }
  if (new Date(`${date}T${time}`) < new Date()) {
    return res.status(400).json({ error: 'Reservation must be in the future' });
  }
  if (!(guests >= 1 && guests <= 20)) {
    return res.status(400).json({ error: 'Guests must be between 1 and 20' });
  }

  const reservation = {
    id: db.nextId('reservations'),
    name, phone, date, time, guests, notes,
    status: 'Pending',
    createdAt: new Date().toISOString(),
  };
  db.data.reservations.push(reservation);
  db.save();
  res.status(201).json(reservation);
});

// ---------- auth ----------
app.post('/api/auth/login', (req, res) => {
  const username = str(req.body.username, 50);
  const password = String(req.body.password ?? '');
  const user = db.data.users.find((u) => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, username: user.username });
});

// ---------- admin API ----------
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const { orders, reservations, menu } = db.data;
  const today = new Date().toISOString().slice(0, 10);
  const revenue = orders.filter((o) => o.status === 'Completed').reduce((s, o) => s + o.total, 0);
  res.json({
    totalOrders: orders.length,
    pendingOrders: orders.filter((o) => o.status === 'Pending').length,
    revenue,
    todayReservations: reservations.filter((r) => r.date === today && r.status !== 'Cancelled').length,
    menuItems: menu.length,
  });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  res.json([...db.data.orders].reverse());
});

app.patch('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const order = db.data.orders.find((o) => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!ORDER_STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Invalid status' });
  order.status = req.body.status;
  db.save();
  res.json(order);
});

app.get('/api/admin/reservations', requireAdmin, (req, res) => {
  res.json([...db.data.reservations].reverse());
});

app.patch('/api/admin/reservations/:id', requireAdmin, (req, res) => {
  const r = db.data.reservations.find((x) => x.id === Number(req.params.id));
  if (!r) return res.status(404).json({ error: 'Reservation not found' });
  if (!RES_STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Invalid status' });
  r.status = req.body.status;
  db.save();
  res.json(r);
});

app.get('/api/admin/menu', requireAdmin, (req, res) => {
  res.json(db.data.menu);
});

function readMenuBody(body) {
  const name = str(body.name, 80);
  const category = str(body.category, 40) || 'Other';
  const price = Number(body.price);
  if (!name || !(price >= 0)) return null;
  return {
    name,
    category,
    price,
    description: str(body.description, 300),
    veg: Boolean(body.veg),
    available: body.available !== false,
  };
}

app.post('/api/admin/menu', requireAdmin, (req, res) => {
  const fields = readMenuBody(req.body);
  if (!fields) return res.status(400).json({ error: 'Name and a valid price are required' });
  const item = { id: db.nextId('menu'), ...fields };
  db.data.menu.push(item);
  db.save();
  res.status(201).json(item);
});

app.put('/api/admin/menu/:id', requireAdmin, (req, res) => {
  const item = db.data.menu.find((m) => m.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const fields = readMenuBody(req.body);
  if (!fields) return res.status(400).json({ error: 'Name and a valid price are required' });
  Object.assign(item, fields);
  db.save();
  res.json(item);
});

app.delete('/api/admin/menu/:id', requireAdmin, (req, res) => {
  const idx = db.data.menu.findIndex((m) => m.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Item not found' });
  db.data.menu.splice(idx, 1);
  db.save();
  res.json({ ok: true });
});

// ---------- fallbacks ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

app.listen(PORT, () => {
  console.log(`Restaurant app running at http://localhost:${PORT}`);
  console.log(`Admin dashboard:        http://localhost:${PORT}/admin.html`);
});
