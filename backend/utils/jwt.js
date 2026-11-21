// utils/jwt.js
// Signing and checking the JSON Web Tokens.
//   JWT_SECRET      required in production (at least 32 characters). In development, if it is
//                   missing, a random one is made at start-up (tokens stop working on restart).
//   JWT_EXPIRES_IN  how long a token lasts, default "7d" (e.g. "1h", "30d")

const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const ALGORITHM = "HS256";
let secret = null;

function getSecret() {
  if (secret) return secret;

  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 32) {
    secret = fromEnv;
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set to a random string of at least 32 characters");
  } else {
    secret = crypto.randomBytes(48).toString("hex");
    console.log(
      "JWT_SECRET is not set (or shorter than 32 characters): using a temporary one, " +
        "so sign-ins end when the server restarts. Set it in .env."
    );
  }
  return secret;
}

// the token holds only the user id and a version number, nothing private
function signToken(user) {
  return jwt.sign({ tv: user.tokenVersion || 0 }, getSecret(), {
    algorithm: ALGORITHM,
    subject: String(user._id),
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

// returns the payload, or throws if the token is wrong, tampered with or expired
function verifyToken(token) {
  return jwt.verify(token, getSecret(), { algorithms: [ALGORITHM] });
}

module.exports = { signToken, verifyToken, getSecret };
