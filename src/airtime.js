import africastalking from "africastalking";

const username = process.env.AT_USERNAME;
const apiKey = process.env.AT_API_KEY;

let airtime = null;
if (username && apiKey) {
  airtime = africastalking.initialize({ username, apiKey }).AIRTIME;
}

export const dryRun = !airtime;

export async function send(phone, amountKES) {
  if (!airtime) {
    console.log(`[airtime:dry-run] ${phone} <- KES ${amountKES}`);
    return { status: "dry-run" };
  }
  try {
    const res = await airtime.send({ phoneNumber: phone, amount: `KES ${amountKES}` });
    return { status: "sent", res };
  } catch (err) {
    console.error(`[airtime:error] ${phone}: ${err.message}`);
    return { status: "error", error: err.message };
  }
}
