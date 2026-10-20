import jwt from 'jsonwebtoken';

export const authenticate = (req, res, next) => {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query?.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: token missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.SESSION_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Unauthorized: token invalid or expired' });
  }
};

export const requireAdmin = (req, res, next) => {
  if (!req.user?.isManagement) {
    return res.status(403).json({ message: 'Forbidden: hanya management yang diizinkan' });
  }
  next();
};

export const requireTakeHomeEditor = (req, res, next) => {
  const companyId = req.user?.company_id != null ? Number(req.user.company_id) : null;
  const isAllowed = companyId === 1 || companyId === 3 || Boolean(req.user?.isManagement);
  if (!isAllowed) {
    return res.status(403).json({
      message: 'Akses ditolak: Hanya user company_id = 1 atau 3 yang diizinkan memperbarui data Take Home',
    });
  }
  next();
};
