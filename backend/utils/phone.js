// utils/phone.js
// Turns what a person typed into one standard form (E.164, "+919876543210"), or null.
//   "98765 43210", "09876543210", "+91 98765-43210", "919876543210"  ->  "+919876543210"
// A number without a country code gets DEFAULT_COUNTRY_CODE (default 91, India).

function normalizePhone(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;

  const raw = String(value).trim();
  if (raw.length > 20) return null;

  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/[\s\-().]/g, "").replace(/^\+/, "");
  if (!/^\d+$/.test(digits)) return null;

  const country = String(process.env.DEFAULT_COUNTRY_CODE || "91").replace(/\D/g, "");
  let full;

  if (hasPlus) {
    full = digits; // already has its country code
  } else if (digits.length === 10) {
    full = country + digits;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    full = country + digits.slice(1); // trunk prefix: 09876543210
  } else if (digits.startsWith(country) && digits.length === country.length + 10) {
    full = digits; // 919876543210
  } else {
    return null;
  }

  if (!/^[1-9]\d{7,14}$/.test(full)) return null; // E.164: up to 15 digits

  // Indian mobile numbers are 10 digits starting with 6, 7, 8 or 9
  if (full.startsWith("91") && full.length === 12 && !/^[6-9]/.test(full.slice(2))) return null;

  return "+" + full;
}

module.exports = { normalizePhone };
