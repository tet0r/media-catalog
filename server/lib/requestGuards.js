// Two small guards against a web page — one the user merely happens to have
// open in another tab — quietly driving this server.
//
// The app has no login, so a browser on the same network can be made to send
// it requests. The worst of them need no JSON body (POST /api/movies/clear-all,
// the sync and scan buttons), which means a browser sends them straight away
// with no permission check first. Browsers do label where such a request came
// from, though, and that's what the first guard reads.

// Cross-site writes are refused. A request counts as same-site when the browser
// says so (Sec-Fetch-Site), or failing that when its Origin names this server.
// Requests with neither header (curl, scripts, the desktop app's own menu) are
// not browser page requests and are let through. ALLOWED_ORIGINS (a
// comma-separated list such as https://media.example.com) adds origins that
// are fine even when a reverse proxy changes the Host header.
function sameOriginGuard(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

  const site = req.headers['sec-fetch-site'];
  if (site) {
    if (site === 'same-origin' || site === 'none') return next();
    return refuse(res);
  }

  const origin = req.headers.origin;
  if (!origin) return next();

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return refuse(res); // "Origin: null" and anything unparseable
  }
  const hosts = [req.headers.host, req.headers['x-forwarded-host']].filter(Boolean).map((h) => String(h).split(',')[0].trim());
  if (hosts.includes(originHost)) return next();
  const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  if (extra.includes(origin.replace(/\/+$/, ''))) return next();
  return refuse(res);
}

function refuse(res) {
  res.status(403).json({ error: 'Cross-site request refused' });
}

// Optional: ALLOWED_HOSTS (comma-separated host names, no ports) restricts which
// names this server answers to. It's what stops DNS rebinding — an attacker's
// own domain briefly pointed at your server's address, so that a page from it
// is "same origin" with the server. Left unset, any name is accepted (the
// default, since people reach their server by IP, a .local name, or a domain
// of their own).
function hostGuard(req, res, next) {
  const allowed = (process.env.ALLOWED_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!allowed.length) return next();
  const host = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  if (allowed.includes(host)) return next();
  return res.status(421).json({ error: 'Unrecognised host name' });
}

module.exports = { sameOriginGuard, hostGuard };
