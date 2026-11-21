// middleware/auth.js
// requireAuth   the request must carry a valid token:  Authorization: Bearer <token>
//               then req.user is the signed-in user.
// optionalAuth  same, but a request without a token goes on with req.user = null.
//
// Not applied to the existing routes yet (the frontend doesn't send a token). To protect one,
// add it in its routes file, e.g. in routes/emergencyRoutes.js:
//     const { requireAuth } = require("../middleware/auth");
//     router.post("/", requireAuth, createEmergency);

const User = require("../models/User");
const { verifyToken } = require("../utils/jwt");

async function authenticate(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return { error: "Sign in first (send 'Authorization: Bearer <token>')" };

  let payload;
  try {
    payload = verifyToken(match[1]);
  } catch (error) {
    return { error: error.name === "TokenExpiredError" ? "Your sign-in has expired, sign in again" : "Invalid token" };
  }

  const user = await User.findById(payload.sub);
  if (!user) return { error: "Invalid token" };
  if (user.blocked) return { error: "This number is blocked", status: 403 };
  if ((user.tokenVersion || 0) !== payload.tv) return { error: "You were signed out, sign in again" };

  return { user };
}

async function requireAuth(req, res, next) {
  try {
    const { user, error, status } = await authenticate(req);
    if (!user) return res.status(status || 401).json({ message: error });
    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function optionalAuth(req, res, next) {
  try {
    const { user } = await authenticate(req);
    req.user = user || null;
    next();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = { requireAuth, optionalAuth };
