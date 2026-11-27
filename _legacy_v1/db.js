const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function seed() {
  return {
    counters: { menu: 9, orders: 1, reservations: 1 },
    users: [
      {
        id: 1,
        username: 'admin',
        passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10),
      },
    ],
    menu: [
      { id: 1, name: 'Paneer Tikka', category: 'Starters', price: 220, description: 'Char-grilled cottage cheese with spiced yogurt marinade.', veg: true, available: true },
      { id: 2, name: 'Chicken 65', category: 'Starters', price: 260, description: 'Crispy South Indian style fried chicken with curry leaves.', veg: false, available: true },
      { id: 3, name: 'Butter Chicken', category: 'Main Course', price: 340, description: 'Tender chicken in a rich tomato-butter gravy.', veg: false, available: true },
      { id: 4, name: 'Dal Makhani', category: 'Main Course', price: 240, description: 'Slow-cooked black lentils finished with cream.', veg: true, available: true },
      { id: 5, name: 'Veg Biryani', category: 'Rice & Breads', price: 250, description: 'Fragrant basmati rice layered with vegetables and spices.', veg: true, available: true },
      { id: 6, name: 'Garlic Naan', category: 'Rice & Breads', price: 60, description: 'Soft tandoor-baked bread brushed with garlic butter.', veg: true, available: true },
      { id: 7, name: 'Gulab Jamun', category: 'Desserts', price: 110, description: 'Warm milk dumplings in cardamom sugar syrup.', veg: true, available: true },
      { id: 8, name: 'Masala Chai', category: 'Beverages', price: 50, description: 'Spiced Indian tea brewed with milk.', veg: true, available: true },
    ],
    orders: [],
    reservations: [],
  };
}

let data;

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    data = seed();
    save();
  } else {
    data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  }
}

function save() {
  // write to temp file then rename so a crash can't corrupt the db
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function nextId(collection) {
  const id = data.counters[collection]++;
  return id;
}

load();

module.exports = {
  get data() {
    return data;
  },
  save,
  nextId,
};
