export function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.session.user?.role)) {
      return res.status(403).render('error', {
        title: 'Forbidden',
        message: `This page requires the ${roles.join(' or ')} role.`,
      });
    }
    next();
  };
}
