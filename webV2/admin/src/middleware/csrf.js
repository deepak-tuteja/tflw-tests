import { randomUUID } from 'node:crypto';

// A synchronizer token for THIS app's own forms — distinct from the csrfToken apiV2 issues at
// session-login (that one is forwarded server-side in apiClient.js and never reaches the
// browser at all). Without this, every full-page-nav POST here would be a real CSRF hole: this
// console authenticates the browser with a plain session cookie and nothing else.
export function attachCsrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomUUID();
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

export function verifyCsrf(req, res, next) {
  if (req.body?._csrf !== req.session.csrfToken) {
    return res.status(403).render('error', {
      title: 'Forbidden',
      message: 'Missing or invalid CSRF token — go back and resubmit the form.',
    });
  }
  next();
}
