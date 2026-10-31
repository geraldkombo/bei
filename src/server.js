import express from "express";
import { fileURLToPath } from "node:url";
import { handle as handleUssd } from "./ussd.js";
import {
  CATEGORIES,
  crowdStats,
  itemsByCategory,
  leaderboard,
  recentReports,
  seedIfEmpty,
} from "./db.js";
import { report } from "./prices.js";
import { dryRun as smsDryRun } from "./sms.js";

seedIfEmpty();

export const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));

function normalizePhone(raw) {
  let p = String(raw).trim();
  if (!p.startsWith("+")) p = `+${p.replace(/^\s+/, "")}`;
  return p;
}

app.post("/ussd", async (req, res) => {
  const { sessionId, text } = req.body;
  const phoneNumber = req.body.phoneNumber && normalizePhone(req.body.phoneNumber);
  if (!sessionId || !phoneNumber) {
    return res.status(400).type("text/plain").send("END Missing sessionId or phoneNumber");
  }
  try {
    const out = await handleUssd({ sessionId, phoneNumber, text: text || "" });
    res.type("text/plain").send(out);
  } catch (err) {
    console.error("[ussd]", err);
    res.type("text/plain").send("END Sorry, something went wrong. Dial again.");
  }
});

app.get("/api/summary", (_req, res) => {
  res.json({
    smsDryRun,
    categories: CATEGORIES.map((c) => ({
      ...c,
      items: itemsByCategory(c.key).map((i) => ({ ...i, crowd: crowdStats(i.id) })),
    })),
  });
});

app.get("/api/reports", (_req, res) => {
  res.json({ reports: recentReports(50), leaderboard: leaderboard() });
});

app.post("/api/report", async (req, res) => {
  const { phone, itemId, amount } = req.body;
  const n = Number(amount);
  if (!phone || !Number.isInteger(n) || n <= 0 || !itemId) {
    return res.status(400).json({ error: "phone, itemId and positive integer amount required" });
  }
  const out = await report(Number(itemId), normalizePhone(phone), n);
  res.json(out);
});

if (process.env.BEI_NO_LISTEN !== "1") {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () =>
    console.log(`bei listening on :${port}${smsDryRun ? " (sms dry-run)" : ""}`)
  );
}
