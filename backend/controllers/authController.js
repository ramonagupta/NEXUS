// controllers/authController.js
// Sign in with a phone number + a one-time code (OTP), and get a JWT back.
//
//   GET  /api/auth/warning      the prank warning text
//   POST /api/auth/send-otp     { phone, mode: "signup" | "login" }   -> sends a 6-digit code by SMS
//                               (request-otp is the same route under its older name)
//   POST /api/auth/verify-otp   { phone, otp, mode, name? }           -> { token, user, warning }
//   GET  /api/auth/me           the signed-in user (the user object itself)   (needs the token)
//   POST /api/auth/logout       ends every sign-in of this user (needs the token)
//
// This is what the frontend's sign-up / log-in screen calls. Sign up needs a name and a number
// that has no account yet; log in needs a number that has one. The prank warning is accepted
// on that screen (a tick-box when signing up, a notice after every log in); the time is saved on
// the user, the warning text comes back with the token, and every report is stored with the
// phone number of the person who made it.
//
// Protections (limits can be changed in .env):
//   - the code is 6 digits, made with crypto.randomInt, and only its HMAC is saved
//   - it works for 5 minutes (OTP_TTL_SECONDS), once, and 5 tries (OTP_MAX_ATTEMPTS)
//   - one new code per phone every 30 seconds (OTP_RESEND_SECONDS), 5 an hour (OTP_MAX_PER_HOUR)
//   - a wrong or expired code always gets the same answer
//   - a blocked number (User.blocked) can't get a code or a token

const crypto = require("crypto");
const OtpRequest = require("../models/OtpRequest");
const User = require("../models/User");
const { normalizePhone } = require("../utils/phone");
const { PRANK_WARNING } = require("../utils/prankWarning");
const { sendSms } = require("../utils/smsService");
const { signToken, verifyToken, getSecret } = require("../utils/jwt");

const HOUR_MS = 60 * 60 * 1000;
const setting = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const config = () => ({
  ttlSeconds: setting("OTP_TTL_SECONDS", 300),
  resendSeconds: setting("OTP_RESEND_SECONDS", 30), // the screen's "Resend in 30s" timer
  maxPerHour: setting("OTP_MAX_PER_HOUR", 5),
  maxAttempts: setting("OTP_MAX_ATTEMPTS", 5),
});

function makeCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

// the code is tied to the phone number, and hashed with the server secret
function hashCode(phone, code) {
  return crypto.createHmac("sha256", getSecret()).update(phone + ":" + code).digest("hex");
}

function sameHash(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const mask = (phone) => phone.slice(0, 3) + "•".repeat(Math.max(0, phone.length - 7)) + phone.slice(-4);

const MODES = ["signup", "login"];

const userView = (user) => ({
  id: String(user._id),
  name: user.name || "",
  phone: user.phone,
  lastLoginAt: user.lastLoginAt,
  warningAcceptedAt: user.warningAcceptedAt,
});

function getWarning(req, res) {
  res.json(PRANK_WARNING);
}

async function requestOtp(req, res) {
  try {
    const phone = normalizePhone(req.body.phone);
    if (!phone) {
      return res.status(400).json({ code: "INVALID_PHONE", message: "Enter a valid mobile number" });
    }

    const mode = req.body.mode === undefined ? "login" : req.body.mode;
    if (!MODES.includes(mode)) {
      return res.status(400).json({ code: "INVALID_MODE", message: "mode must be 'signup' or 'login'" });
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser && existingUser.blocked) {
      return res.status(403).json({
        code: "BLOCKED",
        message: "This number is blocked for misuse of the emergency service",
      });
    }
    // checked BEFORE a text message is paid for and sent
    if (mode === "signup" && existingUser) {
      return res.status(409).json({ code: "ALREADY_REGISTERED", message: "This number already has an account. Log in instead." });
    }
    if (mode === "login" && !existingUser) {
      return res.status(404).json({ code: "NOT_REGISTERED", message: "No account for this number. Sign up first." });
    }

    const cfg = config();
    const now = new Date();
    const doc = await OtpRequest.findOne({ phone });

    let windowStart = now;
    let sentInWindow = 1;

    if (doc) {
      const sinceLast = (now - new Date(doc.lastSentAt)) / 1000;
      if (sinceLast < cfg.resendSeconds) {
        const retryAfterSeconds = Math.ceil(cfg.resendSeconds - sinceLast);
        res.set("Retry-After", String(retryAfterSeconds));
        return res.status(429).json({
          code: "WAIT",
          message: "A code was just sent. Wait " + retryAfterSeconds + " seconds before asking for another",
          retryAfterSeconds,
        });
      }

      if (now - new Date(doc.windowStart) < HOUR_MS) {
        windowStart = new Date(doc.windowStart);
        sentInWindow = doc.sentInWindow + 1;
      }
      if (sentInWindow > cfg.maxPerHour) {
        const retryAfterSeconds = Math.ceil((windowStart.getTime() + HOUR_MS - now) / 1000);
        res.set("Retry-After", String(retryAfterSeconds));
        return res.status(429).json({
          code: "TOO_MANY_CODES",
          message: "Too many codes for this number, try again later",
          retryAfterSeconds,
        });
      }
    }

    const code = makeCode();
    const fields = {
      codeHash: hashCode(phone, code),
      otpExpiresAt: new Date(now.getTime() + cfg.ttlSeconds * 1000),
      attempts: 0,
      lastSentAt: now,
      windowStart,
      sentInWindow,
      purgeAt: new Date(Math.max(now.getTime() + cfg.ttlSeconds * 1000, windowStart.getTime() + HOUR_MS)),
    };

    if (doc) {
      Object.assign(doc, fields);
      await doc.save();
    } else {
      try {
        await OtpRequest.create({ phone, ...fields });
      } catch (error) {
        // two requests for a new number at the same moment: the second one waits
        if (error && error.code === 11000) {
          return res.status(429).json({ code: "WAIT", message: "A code is already being sent", retryAfterSeconds: cfg.resendSeconds });
        }
        throw error;
      }
    }

    try {
      await sendSms(
        phone,
        "Your NEXUS code is " + code + ". It works for " + Math.round(cfg.ttlSeconds / 60) +
          " minutes. Never share it. NEXUS is an emergency service: false reports are punishable."
      );
    } catch (smsError) {
      console.log("Could not send the OTP:", smsError.message);
      await OtpRequest.deleteOne({ phone });
      return res.status(502).json({ code: "SMS_FAILED", message: "Could not send the code, try again" });
    }

    const body = {
      message: "A code was sent to " + mask(phone),
      expiresInSeconds: cfg.ttlSeconds,
      resendInSeconds: cfg.resendSeconds,
      warning: PRANK_WARNING,
    };
    // for testing without an SMS provider only, never in production
    if (process.env.DEV_RETURN_OTP === "true" && process.env.NODE_ENV !== "production") body.devOtp = code;

    res.json(body);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function verifyOtp(req, res) {
  try {
    const phone = normalizePhone(req.body.phone);
    const otp = String(req.body.otp === undefined || req.body.otp === null ? "" : req.body.otp).trim();
    const mode = req.body.mode === undefined ? "login" : req.body.mode;
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";

    if (!phone) return res.status(400).json({ code: "INVALID_PHONE", message: "Enter a valid mobile number" });
    if (!/^\d{6}$/.test(otp)) return res.status(400).json({ code: "INVALID_OTP", message: "The code is 6 digits" });
    if (!MODES.includes(mode)) return res.status(400).json({ code: "INVALID_MODE", message: "mode must be 'signup' or 'login'" });
    // checked first, so a typo in the name doesn't use up the code
    if (mode === "signup" && (name.length < 2 || name.length > 60 || /[\u0000-\u001f]/.test(name))) {
      return res.status(400).json({ code: "INVALID_NAME", message: "Please enter your name." });
    }

    const cfg = config();
    const now = new Date();

    // Use up one try BEFORE comparing, in one step, so many guesses at the same moment still
    // count one by one. Not found = no live code (never asked, used, expired or out of tries).
    const request = await OtpRequest.findOneAndUpdate(
      { phone, codeHash: { $ne: null }, otpExpiresAt: { $gt: now }, attempts: { $lt: cfg.maxAttempts } },
      { $inc: { attempts: 1 } },
      { new: true }
    );
    if (!request) {
      return res.status(401).json({ code: "INVALID_OTP", message: "That code is wrong or has expired. Ask for a new one" });
    }

    if (!sameHash(hashCode(phone, otp), request.codeHash)) {
      return res.status(401).json({
        code: "INVALID_OTP",
        message: "That code is wrong or has expired. Ask for a new one",
        attemptsLeft: Math.max(0, cfg.maxAttempts - request.attempts),
      });
    }

    // a code works once: only the request that clears it gets in
    const used = await OtpRequest.updateOne({ phone, codeHash: request.codeHash }, { $set: { codeHash: null } });
    if (!used || used.modifiedCount !== 1) {
      return res.status(401).json({ code: "INVALID_OTP", message: "That code is wrong or has expired. Ask for a new one" });
    }

    const account = await User.findOne({ phone }); // the existing account, if any
    if (account && account.blocked) {
      return res.status(403).json({
        code: "BLOCKED",
        message: "This number is blocked for misuse of the emergency service",
      });
    }

    // sign up creates the account; log in needs one. Both record that the warning was accepted.
    let user;
    if (mode === "signup") {
      if (account) {
        return res.status(409).json({ code: "ALREADY_REGISTERED", message: "This number already has an account. Log in instead." });
      }
      try {
        user = await User.create({ phone, name, lastLoginAt: now, warningAcceptedAt: now, loginCount: 1 });
      } catch (error) {
        if (error && error.code === 11000) {
          return res.status(409).json({ code: "ALREADY_REGISTERED", message: "This number already has an account. Log in instead." });
        }
        throw error;
      }
    } else {
      if (!account) {
        return res.status(404).json({ code: "NOT_REGISTERED", message: "No account for this number. Sign up first." });
      }
      user = await User.findOneAndUpdate(
        { phone },
        { $set: { lastLoginAt: now, warningAcceptedAt: now }, $inc: { loginCount: 1 } },
        { new: true }
      );
    }

    const token = signToken(user);
    const expiresInSeconds = verifyToken(token).exp - Math.floor(Date.now() / 1000);

    res.json({
      token,
      tokenType: "Bearer",
      expiresInSeconds,
      user: userView(user),
      warning: PRANK_WARNING, // shown again at sign-in
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// the user object itself (that is what the frontend's getMe() puts in its state)
async function me(req, res) {
  res.json(userView(req.user));
}

// raising the version makes every token issued so far (on every device) stop working
async function logout(req, res) {
  try {
    req.user.tokenVersion = (req.user.tokenVersion || 0) + 1;
    await req.user.save();
    res.json({ message: "Signed out" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = { getWarning, requestOtp, verifyOtp, me, logout };
