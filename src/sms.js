import africastalking from "africastalking";

const username = process.env.AT_USERNAME;
const apiKey = process.env.AT_API_KEY;

let sms = null;
if (username && apiKey) {
  sms = africastalking.initialize({ username, apiKey }).SMS;
}

export const dryRun = !sms;

export async function send(phone, message) {
  if (!sms) {
    console.log(`[sms:dry-run] ${phone} <- ${message}`);
    return { status: "dry-run" };
  }
  try {
    const res = await sms.send({ to: [phone], message, from: null });
    return { status: "sent", res };
  } catch (err) {
    console.error(`[sms:error] ${phone}: ${err.message}`);
    return { status: "error", error: err.message };
  }
}
