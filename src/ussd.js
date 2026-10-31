import {
  CATEGORIES,
  getReporter,
  itemsByCategory,
  seedIfEmpty,
  subscribe,
} from "./db.js";
import { report, summaryText } from "./prices.js";
import { send as sendSms } from "./sms.js";

const sessions = new Map();
const TTL_MS = 120_000;

const con = (t) => `CON ${t}`;
const end = (t) => `END ${t}`;

const TOURIST = [
  "Tourist corner / Kona ya watalii",
  "Emergency: dial 999 or 112 (free, any phone).",
  "Kenya Red Cross ambulance: 1199.",
  "Tourist Police hotline: 0722 208 002 (verify locally).",
  "JKIA to CBD: matatu 100-200, taxi 1500-2500.",
  "Swahili: bei gani? (how much?) - ghali sana! (too expensive) - punguza kidogo (reduce a little).",
  "Rule of thumb: ask 3 vendors before paying.",
].join("\n");

function mainMenu() {
  return [
    "bei - uliza kabla ya kulipa",
    "1. Matatu fares",
    "2. Festive travel (upcountry buses)",
    "3. Food & market prices",
    "4. Forex rates",
    "5. Tourist corner",
    "6. Report a price + earn airtime",
    "7. Price alerts (SMS)",
    "8. My points",
  ].join("\n");
}

const numbered = (lines) => lines.map((l, i) => `${i + 1}. ${l}`).join("\n");

function pick(list, raw) {
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 1 || n > list.length) return null;
  return list[n - 1];
}

function parseAmount(raw) {
  const n = Number(String(raw).replace(/[^0-9]/g, ""));
  if (!Number.isInteger(n) || n <= 0 || n > 10_000_000) return null;
  return n;
}

const last = (parts) => parts[parts.length - 1];

export async function handle({ sessionId, phoneNumber, text = "" }) {
  seedIfEmpty();
  const parts = text.split("*").filter((p) => p !== "");
  let s = sessions.get(sessionId);
  if (!s || Date.now() - s.lastSeen > TTL_MS) {
    s = { step: "root", data: {} };
    sessions.set(sessionId, s);
  }
  s.lastSeen = Date.now();
  const finish = (out) => {
    sessions.delete(sessionId);
    return out;
  };
  const d = s.data;

  if (s.step === "root") {
    if (parts.length === 0) return con(mainMenu());
    s.step = `m${parts[0]}`;
  }

  if (s.step === "m5") return finish(end(TOURIST));

  if (s.step === "m8") {
    const r = getReporter(phoneNumber);
    return finish(
      end(
        `Your bei record:\nReports: ${r.reports}\nPoints: ${r.points} (10 points = KES 5 airtime)\nAirtime earned: KES ${r.airtime_awarded}\nAsante sana, reporter.`
      )
    );
  }

  const modes = { m1: "query", m2: "query", m3: "query", m4: "query", m6: "report", m7: "alert" };
  const mode = modes[s.step];
  if (!mode) return finish(end("Unknown option. Dial again."));

  if (!d.cat) {
    if (mode === "query") {
      d.cat = CATEGORIES[Number(s.step.slice(1)) - 1].key;
      d.items = itemsByCategory(d.cat);
      d.itemAsked = true;
      return con(`Choose:\n${numbered(d.items.map((i) => i.name))}`);
    }
    if (d.catAsked) {
      const cat = pick(CATEGORIES, last(parts));
      if (!cat) return con("Invalid choice.\nChoose category:\n" + numbered(CATEGORIES.map((c) => c.label)));
      d.cat = cat.key;
      d.items = itemsByCategory(d.cat);
      d.itemAsked = true;
      return con(`Choose:\n${numbered(d.items.map((i) => i.name))}`);
    }
    d.catAsked = true;
    return con(
      (mode === "report" ? "Report a price, earn airtime.\n" : "Get SMS price alerts.\n") +
        "Choose category:\n" +
        numbered(CATEGORIES.map((c) => c.label))
    );
  }

  if (!d.item) {
    const listText = numbered(d.items.map((i) => i.name));
    if (!d.itemAsked) {
      d.itemAsked = true;
      return con(`Choose:\n${listText}`);
    }
    const item = pick(d.items, last(parts));
    if (!item) return con(`Invalid choice. Choose:\n${listText}`);
    d.item = item;
    if (mode === "query") return finish(end(summaryText(item)));
    if (mode === "alert") {
      subscribe(phoneNumber, item.id);
      sendSms(phoneNumber, `bei alert ON for ${item.name}. Current: ${summaryText(item).split("\n")[1] || ""}`);
      return finish(
        end(`Alerts ON for ${item.name}.\nYou get an SMS whenever a new price is reported.\nCurrent price sent to you now.`)
      );
    }
    d.amountAsked = true;
    return con(`What does ${item.name} cost today?\nEnter amount in KES`);
  }

  if (mode === "report") {
    if (!d.amountAsked) {
      d.amountAsked = true;
      return con(`Enter amount in KES for ${d.item.name}`);
    }
    const amount = parseAmount(last(parts));
    if (!amount) return finish(end("Invalid amount. Dial again to retry."));
    const out = await report(d.item.id, phoneNumber, amount);
    const lines = [
      `Recorded: ${d.item.name} = KES ${amount}. Asante!`,
      `Points: ${out.points} (10 points = KES 5 airtime)`,
    ];
    if (out.awarded > 0) lines.push(`REWARD: KES ${out.awarded} airtime sent to you!`);
    if (out.subscribersNotified > 0) lines.push(`${out.subscribersNotified} subscriber(s) got an SMS alert.`);
    return finish(end(lines.join("\n")));
  }

  return finish(end("Dial again."));
}
