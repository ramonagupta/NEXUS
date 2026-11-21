// utils/smsService.js
// Sends the OTP text message.
//   SMS_PROVIDER=console   (default) prints the code in the server log. For development only.
//   SMS_PROVIDER=twilio    sends a real SMS with Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
//                          and TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID)
// For another provider (MSG91, Fast2SMS ...) add a function below and a case in sendSms().

async function sendWithTwilio(phone, text) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!sid || !token || (!from && !service)) {
    throw new Error("Twilio is not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM)");
  }

  const body = new URLSearchParams({ To: phone, Body: text });
  if (service) body.set("MessagingServiceSid", service);
  else body.set("From", from);

  const response = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Messages.json", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(sid + ":" + token).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error("Twilio answered " + response.status + " " + detail.slice(0, 200));
  }
}

async function sendSms(phone, text) {
  const provider = String(process.env.SMS_PROVIDER || "console").toLowerCase();

  if (provider === "twilio") return sendWithTwilio(phone, text);

  if (provider === "console") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMS_PROVIDER=console can't be used in production, set a real SMS provider");
    }
    console.log("[SMS to " + phone + "] " + text);
    return;
  }

  throw new Error("Unknown SMS_PROVIDER '" + provider + "'");
}

module.exports = { sendSms };
