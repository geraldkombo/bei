import { addReport, crowdStats, getItem, isFestive, subscribersOf } from "./db.js";
import { send as sendSms } from "./sms.js";
import { send as sendAirtime } from "./airtime.js";

export function summaryText(item) {
  const c = crowdStats(item.id);
  const lines = [item.name];
  if (c.count >= 3) {
    lines.push(`KES ${c.low}-${c.high} (median ${c.median})`);
    lines.push(`${c.count} reports in 7 days, latest ${c.lastAgoH}h ago`);
  } else {
    lines.push(`Typical: KES ${item.seed_low}-${item.seed_high}`);
    if (c.count > 0) lines.push(`${c.count} recent report(s): KES ${c.low}${c.count > 1 ? `-${c.high}` : ""}`);
  }
  if (item.festive_low) {
    const now = isFestive() ? "NOW - " : "";
    lines.push(`${now}Festive season (Dec-Jan): expect KES ${item.festive_low}-${item.festive_high}. Book early.`);
  }
  if (item.note) lines.push(item.note);
  lines.push("bei: from Wananchi, for Wananchi. Menu 6 to report & earn airtime.");
  return lines.join("\n");
}

export async function report(itemId, phone, amount) {
  const item = getItem(itemId);
  const { reporter, awarded } = addReport(itemId, phone, amount);
  sendSms(
    phone,
    `bei: asante! ${item.name} = KES ${amount} recorded. Points: ${reporter.points}. Every 10 points = KES 5 airtime.`
  );
  const subs = subscribersOf(itemId).filter((p) => p !== phone).slice(0, 20);
  for (const p of subs) {
    sendSms(p, `bei alert: new report for ${item.name} - KES ${amount}. Dial USSD for the full picture.`);
  }
  if (awarded > 0) {
    await sendAirtime(phone, awarded);
    sendSms(phone, `bei reward: KES ${awarded} airtime sent! Reports so far: ${reporter.reports}. Keep going.`);
  }
  return { points: reporter.points, awarded, subscribersNotified: subs.length };
}
