import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 34568;
const BASE = `http://127.0.0.1:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), "bei-test-"));
let srv;

const REPORTER = "+254700000011";
const SUBSCRIBER = "+254700000022";

async function ussd(phone, text, sessionId) {
  const res = await fetch(`${BASE}/ussd`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ sessionId, phoneNumber: phone, serviceCode: "*384*23#", text }),
  });
  return res.text();
}

async function convo(phone, steps) {
  const sessionId = `s-${phone}-${Date.now()}-${Math.random()}`;
  const out = [];
  for (const text of steps) out.push(await ussd(phone, text, sessionId));
  return out;
}

before(async () => {
  srv = spawn(process.execPath, ["src/server.js"], {
    env: { ...process.env, PORT: String(PORT), BEI_DB: join(dir, "test.db"), BEI_REWARD_EVERY: "2" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server start timeout")), 10000);
    srv.stdout.on("data", (d) => {
      if (String(d).includes("listening")) {
        clearTimeout(t);
        resolve();
      }
    });
    srv.on("exit", (c) => reject(new Error(`server exited ${c}`)));
  });
});

after(async () => {
  srv.kill();
  await new Promise((r) => srv.once("exit", r));
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
});

test("main menu shows all 8 options", async () => {
  const [menu] = await convo(REPORTER, [""]);
  assert.match(menu, /bei - uliza kabla ya kulipa/);
  for (const opt of ["Matatu fares", "Festive travel", "Food & market", "Forex", "Tourist corner", "earn airtime", "Price alerts", "My points"]) {
    assert.match(menu, new RegExp(opt));
  }
});

test("festive travel query shows seed range and festive surge warning", async () => {
  const [, , out] = await convo(REPORTER, ["", "2", "2*1"]);
  assert.match(out, /Nairobi-Mombasa/);
  assert.match(out, /KES 1500-2500|median/);
  assert.match(out, /Festive season \(Dec-Jan\): expect KES 3000-4500/);
});

test("tourist corner has emergency numbers", async () => {
  const [, out] = await convo(REPORTER, ["", "5"]);
  assert.match(out, /999 or 112/);
  assert.match(out, /JKIA to CBD: matatu 100-200/);
  assert.match(out, /bei gani/);
});

test("report flow records price and awards points", async () => {
  const out = await convo(REPORTER, ["", "6", "6*2", "6*2*1", "6*2*1*3200"]);
  assert.match(out[1], /Choose category/);
  assert.match(out[2], /Nairobi-Mombasa/);
  assert.match(out[3], /Enter amount in KES/);
  assert.match(out[4], /Recorded: Nairobi-Mombasa = KES 3200/);
  assert.match(out[4], /Points: 1/);
});

test("second report triggers airtime reward (BEI_REWARD_EVERY=2)", async () => {
  const out = await convo(REPORTER, ["", "6", "6*2", "6*2*1", "6*2*1*3400"]);
  assert.match(out[4], /REWARD: KES 5 airtime/);
});

test("my points shows reporter record", async () => {
  const [, out] = await convo(REPORTER, ["", "8"]);
  assert.match(out, /Reports: 2/);
  assert.match(out, /Airtime earned: KES 5/);
});

test("crowd reports override seed range after 3+ reports", async () => {
  await convo(REPORTER, ["", "6", "6*2", "6*2*1", "6*2*1*3000"]);
  const [, , out] = await convo(REPORTER, ["", "2", "2*1"]);
  assert.match(out, /median 3200/);
  assert.match(out, /3 reports in 7 days/);
});

test("alert subscription sends current price and registers subscriber", async () => {
  const out = await convo(SUBSCRIBER, ["", "7", "7*2", "7*2*1"]);
  assert.match(out[3], /Alerts ON for Nairobi-Mombasa/);
});

test("subscriber gets SMS when another report lands (dry-run log)", async () => {
  const out = await convo(REPORTER, ["", "6", "6*2", "6*2*1", "6*2*1*3600"]);
  assert.match(out[4], /1 subscriber\(s\) got an SMS alert/);
});

test("invalid amount rejected", async () => {
  const out = await convo(REPORTER, ["", "6", "6*3", "6*3*1", "6*3*1*abc"]);
  assert.match(out[4], /Invalid amount/);
});

test("API report + summary endpoints work", async () => {
  const rep = await fetch(`${BASE}/api/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "254700000033", itemId: 15, amount: 120 }),
  });
  assert.equal(rep.status, 200);
  const sum = await (await fetch(`${BASE}/api/summary`)).json();
  const food = sum.categories.find((c) => c.key === "food");
  assert.ok(food.items.some((i) => i.name === "Tomatoes 1kg" && i.crowd.count >= 1));
  const bad = await fetch(`${BASE}/api/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "x", amount: -5 }),
  });
  assert.equal(bad.status, 400);
});
