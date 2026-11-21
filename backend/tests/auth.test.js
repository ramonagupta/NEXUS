// tests/auth.test.js      run with:  node --test tests/auth.test.js     (no MongoDB needed)
// Phone + OTP sign up / log in with a JWT (what the frontend's login screen calls), and the prank warning. The User and OtpRequest models are
// replaced by a tiny in-memory copy; the controller, middleware and token code are the real ones.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

process.env.JWT_SECRET = "x".repeat(40);
process.env.SMS_PROVIDER = "console";
process.env.DEV_RETURN_OTP = "true";
process.env.OTP_RESEND_SECONDS = "30";
delete process.env.NODE_ENV;

// ---- a minimal fake of the Mongoose calls the auth code makes ----
let nextId = 1;
function matches(doc, filter) {
  return Object.entries(filter || {}).every(([key, cond]) => {
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      if ("$ne" in cond) return doc[key] !== cond.$ne;
      if ("$gt" in cond) return doc[key] > cond.$gt;
      if ("$lt" in cond) return doc[key] < cond.$lt;
    }
    return doc[key] === cond;
  });
}
function fakeModel(defaults) {
  const rows = [];
  const make = (data) => {
    const d = { ...JSON.parse(JSON.stringify(defaults)), ...data, _id: String(nextId++) };
    d.save = async () => d;
    return d;
  };
  const apply = (doc, update) => {
    Object.assign(doc, update.$set || {});
    for (const [k, v] of Object.entries(update.$inc || {})) doc[k] = (doc[k] || 0) + v;
  };
  return {
    rows,
    async create(data) { const d = make(data); rows.push(d); return d; },
    async findOne(f) { return rows.find((d) => matches(d, f)) || null; },
    async findById(id) { return rows.find((d) => d._id === String(id)) || null; },
    async deleteOne(f) { const i = rows.findIndex((d) => matches(d, f)); if (i >= 0) rows.splice(i, 1); },
    async updateOne(f, update) {
      const d = rows.find((x) => matches(x, f));
      if (d) apply(d, update);
      return { modifiedCount: d ? 1 : 0 };
    },
    async findOneAndUpdate(f, update, opts = {}) {
      let d = rows.find((x) => matches(x, f));
      if (!d && opts.upsert) { d = make(f); rows.push(d); }
      if (d) apply(d, update);
      return d || null;
    },
  };
}
function install(file, defaults) {
  const resolved = require.resolve(path.join("..", "models", file));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: fakeModel(defaults) };
}
install("User", { loginCount: 0, tokenVersion: 0, blocked: false, lastLoginAt: null, warningAcceptedAt: null });
install("OtpRequest", { attempts: 0, codeHash: null });

const User = require("../models/User");
const OtpRequest = require("../models/OtpRequest");
const auth = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");
const { normalizePhone } = require("../utils/phone");

const res = () => ({
  statusCode: 200, body: undefined, headers: {},
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
  set(k, v) { this.headers[k] = v; return this; },
});
const call = async (fn, body = {}) => { const r = res(); await fn({ body }, r); return r; };
const PHONE = "+919876543210"; // the frontend sends +91 and the 10 digits
const E164 = "+919876543210";

// pretend the wait has passed so the next code can be asked for
const skipWait = async () => { (await OtpRequest.findOne({ phone: E164 })).lastSentAt = new Date(Date.now() - 31000); };
const sendCode = (mode) => call(auth.requestOtp, { phone: PHONE, mode });

test("phone numbers are cleaned into one form", () => {
  for (const v of ["98765 43210", "09876543210", "+91 98765-43210", "919876543210", 9876543210]) {
    assert.equal(normalizePhone(v), E164);
  }
  assert.equal(normalizePhone("+14155552671"), "+14155552671");
  for (const v of ["12345", "5876543210", "abcdefghij", "", null, "+0123456789"]) assert.equal(normalizePhone(v), null);
});

test("the prank warning is available and comes back with the token", async () => {
  const warning = await call(auth.getWarning);
  assert.ok(warning.body.message.includes("legal action"));
});

test("log in needs an account, sign up needs a name and a new number", async () => {
  const noAccount = await sendCode("login");
  assert.equal(noAccount.statusCode, 404);
  assert.equal(noAccount.body.code, "NOT_REGISTERED");
  assert.equal(OtpRequest.rows.length, 0); // no text message was sent

  assert.equal((await call(auth.requestOtp, { phone: PHONE, mode: "dance" })).statusCode, 400);

  const sent = await sendCode("signup");
  assert.equal(sent.statusCode, 200);
  assert.match(sent.body.devOtp, /^\d{6}$/);
  assert.ok(!JSON.stringify(OtpRequest.rows).includes(sent.body.devOtp)); // only a hash is saved

  // no name: refused, and the code is not used up
  const noName = await call(auth.verifyOtp, { phone: PHONE, otp: sent.body.devOtp, mode: "signup", name: " " });
  assert.equal(noName.statusCode, 400);
  assert.equal(noName.body.code, "INVALID_NAME");

  const wrong = await call(auth.verifyOtp, { phone: PHONE, otp: sent.body.devOtp === "000000" ? "111111" : "000000", mode: "signup", name: "Asha Rawat" });
  assert.equal(wrong.statusCode, 401);
  assert.equal(wrong.body.attemptsLeft, 4);

  const ok = await call(auth.verifyOtp, { phone: PHONE, otp: sent.body.devOtp, mode: "signup", name: "Asha Rawat" });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.tokenType, "Bearer");
  assert.equal(ok.body.user.phone, E164);
  assert.equal(ok.body.user.name, "Asha Rawat");
  assert.ok(ok.body.user.warningAcceptedAt);
  assert.ok(ok.body.warning.message);
  assert.ok(ok.body.expiresInSeconds > 6 * 24 * 3600);

  // a code works once
  const again = await call(auth.verifyOtp, { phone: PHONE, otp: sent.body.devOtp, mode: "signup", name: "Asha Rawat" });
  assert.equal(again.statusCode, 401);

  // the number now has an account: signing up again is refused, logging in works
  await skipWait();
  const dup = await sendCode("signup");
  assert.equal(dup.statusCode, 409);
  assert.equal(dup.body.code, "ALREADY_REGISTERED");

  const login = await sendCode("login");
  assert.equal(login.statusCode, 200);
  const back = await call(auth.verifyOtp, { phone: PHONE, otp: login.body.devOtp, mode: "login" });
  assert.equal(back.statusCode, 200);
  assert.equal(back.body.user.name, "Asha Rawat");
  assert.equal(User.rows.length, 1);
  assert.equal(User.rows[0].loginCount, 2);

  // the token opens a protected route, and /me is the user itself
  const req = { headers: { authorization: "Bearer " + back.body.token } };
  let reached = false;
  await requireAuth(req, res(), () => { reached = true; });
  assert.ok(reached);
  const mine = res();
  await auth.me(req, mine);
  assert.equal(mine.body.phone, E164);
  assert.equal(mine.body.name, "Asha Rawat");

  const none = res();
  await requireAuth({ headers: {} }, none, () => assert.fail("must not pass"));
  assert.equal(none.statusCode, 401);
  const forged = res();
  await requireAuth({ headers: { authorization: "Bearer " + back.body.token.slice(0, -2) + "xx" } }, forged, () => assert.fail("must not pass"));
  assert.equal(forged.statusCode, 401);

  // logging out ends the token
  await auth.logout({ user: await User.findOne({ phone: E164 }) }, res());
  const stale = res();
  await requireAuth(req, stale, () => assert.fail("must not pass"));
  assert.equal(stale.statusCode, 401);
});

test("one code every 30 seconds, and 5 wrong tries kill the code", async () => {
  await OtpRequest.deleteOne({ phone: E164 });
  const first = await sendCode("login");
  const soon = await sendCode("login");
  assert.equal(soon.statusCode, 429);
  assert.ok(soon.body.retryAfterSeconds > 0 && soon.body.retryAfterSeconds <= 30);

  const bad = first.body.devOtp === "123456" ? "654321" : "123456";
  for (let i = 0; i < 5; i++) assert.equal((await call(auth.verifyOtp, { phone: PHONE, otp: bad, mode: "login" })).statusCode, 401);
  // even the right code is refused now
  assert.equal((await call(auth.verifyOtp, { phone: PHONE, otp: first.body.devOtp, mode: "login" })).statusCode, 401);
});

test("at most 5 codes an hour", async () => {
  await OtpRequest.deleteOne({ phone: E164 });
  for (let i = 0; i < 5; i++) {
    assert.equal((await sendCode("login")).statusCode, 200);
    await skipWait();
  }
  const sixth = await sendCode("login");
  assert.equal(sixth.statusCode, 429);
  assert.equal(sixth.body.code, "TOO_MANY_CODES");
});

test("an expired code is refused, and a blocked number gets nothing", async () => {
  await OtpRequest.deleteOne({ phone: E164 });
  const sent = await sendCode("login");
  (await OtpRequest.findOne({ phone: E164 })).otpExpiresAt = new Date(Date.now() - 1000);
  assert.equal((await call(auth.verifyOtp, { phone: PHONE, otp: sent.body.devOtp, mode: "login" })).statusCode, 401);

  (await User.findOne({ phone: E164 })).blocked = true;
  assert.equal((await sendCode("login")).statusCode, 403);
});
