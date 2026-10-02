require('dotenv').config();
const jwt = require('jsonwebtoken');

// Standard error format used by every route.
function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

// Allows only authenticated administrators.
// No or invalid token -> 401. Valid token but not admin -> 403.
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return sendError(res, 401, 'UNAUTHENTICATED', 'Missing token');
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return sendError(res, 401, 'UNAUTHENTICATED', 'Invalid token');
  }

  if (payload.role !== 'admin') {
    return sendError(res, 403, 'FORBIDDEN', 'Administrator access required');
  }

  req.user = payload;
  next();
}

module.exports = { requireAdmin, sendError };
