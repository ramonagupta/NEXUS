// routes/authRoutes.js

const express = require("express");
const router = express.Router();

const { getWarning, requestOtp, verifyOtp, me, logout } = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");
const { rateLimit } = require("../utils/rateLimit");

// per IP address (the per-phone limits are in the controller)
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: "Too many sign-in attempts, try again later" });

router.get("/warning", getWarning);
router.post("/send-otp", limiter, requestOtp);
router.post("/request-otp", limiter, requestOtp); // the older name
router.post("/verify-otp", limiter, verifyOtp);
router.get("/me", requireAuth, me);
router.post("/logout", requireAuth, logout);

module.exports = router;
