import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const file = process.env.BEI_DB || "./data/bei.db";
if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });

export const db = new DatabaseSync(file);

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    name TEXT NOT NULL UNIQUE,
    note TEXT NOT NULL DEFAULT '',
    seed_low INTEGER NOT NULL,
    seed_high INTEGER NOT NULL,
    festive_low INTEGER,
    festive_high INTEGER
  );
  CREATE TABLE IF NOT EXISTS prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items(id),
    amount INTEGER NOT NULL CHECK (amount > 0),
    phone TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS reporters (
    phone TEXT PRIMARY KEY,
    points INTEGER NOT NULL DEFAULT 0,
    reports INTEGER NOT NULL DEFAULT 0,
    airtime_awarded INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    item_id INTEGER NOT NULL REFERENCES items(id),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (phone, item_id)
  );
`);

export const CATEGORIES = [
  { key: "matatu", label: "Matatu fares (Nairobi & towns)" },
  { key: "travel", label: "Festive travel (upcountry buses)" },
  { key: "food", label: "Food & market prices" },
  { key: "forex", label: "Forex (KES per unit)" },
];

export const SEED_ITEMS = [
  ["matatu", "CBD-Kibera", "", 50, 100, null, null],
  ["matatu", "CBD-Eastleigh", "", 50, 70, null, null],
  ["matatu", "CBD-Roysambu", "", 70, 150, null, null],
  ["matatu", "CBD-Rongai", "", 100, 200, null, null],
  ["matatu", "CBD-Kitengela", "", 150, 300, null, null],
  ["matatu", "CBD-Ngong", "", 100, 150, null, null],
  ["matatu", "JKIA-CBD", "Tourists: matatu from JKIA is 100-200. A taxi is 1500-2500. If quoted over 300 for a matatu, walk away.", 100, 200, null, null],
  ["matatu", "CBD-Karen", "", 100, 150, null, null],
  ["travel", "Nairobi-Mombasa", "Bus. Book 3+ days ahead in festive season.", 1500, 2500, 3000, 4500],
  ["travel", "Nairobi-Kisumu", "Bus.", 1500, 2500, 3000, 4500],
  ["travel", "Nairobi-Eldoret", "Bus.", 1200, 2000, 2500, 4000],
  ["travel", "Nairobi-Nakuru", "Bus/matatu.", 800, 1200, 1500, 2500],
  ["travel", "Nairobi-Meru", "Bus.", 800, 1200, 1500, 2500],
  ["travel", "Nairobi-Kisii", "Bus.", 1800, 2800, 3500, 5000],
  ["food", "Tomatoes 1kg", "", 80, 150, null, null],
  ["food", "Onions 1kg", "", 100, 180, null, null],
  ["food", "Unga wa ugali 2kg", "", 130, 180, null, null],
  ["food", "Milk 500ml", "", 55, 70, null, null],
  ["food", "Cooking oil 1L", "", 300, 400, null, null],
  ["food", "Beef 1kg", "", 500, 700, null, null],
  ["food", "Sugar 1kg", "", 250, 350, null, null],
  ["forex", "USD to KES", "Bureau rates vary; airport bureaus pay less.", 125, 132, null, null],
  ["forex", "EUR to KES", "", 138, 148, null, null],
  ["forex", "GBP to KES", "", 160, 175, null, null],
];

export function seedIfEmpty() {
  const n = db.prepare("SELECT COUNT(*) AS n FROM items").get().n;
  if (n > 0) return;
  const ins = db.prepare(
    "INSERT INTO items (category, name, note, seed_low, seed_high, festive_low, festive_high) VALUES (?,?,?,?,?,?,?)"
  );
  for (const row of SEED_ITEMS) ins.run(...row);
}

export function itemsByCategory(category) {
  return db.prepare("SELECT * FROM items WHERE category = ? ORDER BY id").all(category);
}

export function getItem(id) {
  return db.prepare("SELECT * FROM items WHERE id = ?").get(id);
}

export function crowdStats(itemId, days = 7) {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const rows = db
    .prepare("SELECT amount, created_at FROM prices WHERE item_id = ? AND created_at >= ? ORDER BY amount")
    .all(itemId, since);
  if (rows.length === 0) return { count: 0 };
  const amounts = rows.map((r) => r.amount);
  const median = amounts[Math.floor(amounts.length / 2)];
  const last = Math.max(...rows.map((r) => r.created_at));
  return {
    count: rows.length,
    low: amounts[0],
    median,
    high: amounts[amounts.length - 1],
    lastAgoH: Math.max(0, Math.round((Date.now() / 1000 - last) / 3600)),
  };
}

export function isFestive(d = new Date()) {
  return d.getMonth() === 11 || d.getMonth() === 0;
}

export function addReport(itemId, phone, amount) {
  db.prepare("INSERT INTO prices (item_id, amount, phone) VALUES (?,?,?)").run(itemId, amount, phone);
  db.prepare(
    `INSERT INTO reporters (phone, points, reports) VALUES (?, 1, 1)
     ON CONFLICT(phone) DO UPDATE SET points = points + 1, reports = reports + 1`
  ).run(phone);
  const every = Number(process.env.BEI_REWARD_EVERY || 10);
  let rep = db.prepare("SELECT * FROM reporters WHERE phone = ?").get(phone);
  let awarded = 0;
  if (rep.points >= every) {
    awarded = 5;
    db.prepare("UPDATE reporters SET points = points - ?, airtime_awarded = airtime_awarded + ? WHERE phone = ?")
      .run(every, awarded, phone);
    rep = db.prepare("SELECT * FROM reporters WHERE phone = ?").get(phone);
  }
  return { reporter: rep, awarded };
}

export function getReporter(phone) {
  return db.prepare("SELECT * FROM reporters WHERE phone = ?").get(phone) || { phone, points: 0, reports: 0, airtime_awarded: 0 };
}

export function subscribe(phone, itemId) {
  db.prepare("INSERT OR IGNORE INTO subscriptions (phone, item_id) VALUES (?,?)").run(phone, itemId);
}

export function subscribersOf(itemId) {
  return db.prepare("SELECT phone FROM subscriptions WHERE item_id = ?").all(itemId).map((r) => r.phone);
}

export function recentReports(limit = 30) {
  return db
    .prepare(
      `SELECT p.id, p.amount, p.phone, p.created_at, i.name, i.category
       FROM prices p JOIN items i ON i.id = p.item_id
       ORDER BY p.id DESC LIMIT ?`
    )
    .all(limit);
}

export function leaderboard(limit = 10) {
  return db.prepare("SELECT * FROM reporters ORDER BY reports DESC LIMIT ?").all(limit);
}
