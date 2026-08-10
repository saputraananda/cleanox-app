import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cleanoxPool, { aloraPool as pool } from '../db/cleanox.js';

const getEmployeeContext = async (employeeId) => {
  const [empRows] = await pool.query(
    `SELECT e.company_id, e.exit_date, e.employee_code, c.company_name
     FROM mst_employee e
     LEFT JOIN mst_company c ON c.company_id = e.company_id
     WHERE e.employee_id = ?`,
    [employeeId]
  );

  const employee = empRows[0] || null;
  const companyId = employee?.company_id ?? null;
  const isManagement = companyId === 1 && employee?.exit_date === null;
  const employeeCode = employee?.employee_code || null;
  const companyName = employee?.company_name || null;

  return { companyId, isManagement, employeeCode, companyName };
};



/* ── Register ─────────────────────────────────────────── */
export const register = async (req, res) => {
  const { name, email, username, phone, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Nama, email, dan password wajib diisi' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password minimal 8 karakter' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Cek email duplikat
    const [existing] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'Email sudah terdaftar' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Insert ke tabel users
    const [userResult] = await conn.query(
      'INSERT INTO users (name, email, username, password_hash) VALUES (?, ?, ?, ?)',
      [name, email, username || null, passwordHash]
    );
    const userId = userResult.insertId;

    // Buat employee_code dari user id
    const employeeCode = `EMP-${String(userId).padStart(4, '0')}`;

    // Insert ke tabel mst_employee dengan id yang sama
    await conn.query(
      `INSERT INTO mst_employee
         (employee_id, employee_code, full_name, email, phone_number)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, employeeCode, name, email, phone || null]
    );

    // Insert ke tabel mst_role di CleanoxPool
    await cleanoxPool.query(
      `INSERT INTO mst_role (employee_id, role)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE role = ?`,
      [userId, 'frontliner', 'frontliner']
    );

    await conn.commit();

    return res.status(201).json({
      message: 'Registrasi berhasil',
      user: { id: userId, name, email, username: username || null },
    });
  } catch (err) {
    await conn.rollback();
    console.error('[register]', err.message);
    return res.status(500).json({ message: 'Terjadi kesalahan server saat registrasi' });
  } finally {
    conn.release();
  }
};

/* ── Login ────────────────────────────────────────────── */
export const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username dan password wajib diisi' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, username, password_hash, role, avatar FROM users WHERE username = ?',
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Username atau password salah' });
    }

    const user = rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ message: 'Username atau password salah' });
    }

    const { companyId, isManagement, employeeCode, companyName } = await getEmployeeContext(user.id);

    const [roleRows] = await cleanoxPool.query(
      'SELECT role FROM mst_role WHERE employee_id = ?',
      [user.id]
    );
    const userRole = roleRows.length > 0 ? roleRows[0].role : 'frontliner';

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: userRole,
        name: user.name,
        username: user.username,
        isManagement,
        company_id: companyId,
        company_name: companyName,
        employee_code: employeeCode,
      },
      process.env.SESSION_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: userRole,
        avatar: user.avatar,
        isManagement,
        company_id: companyId,
        company_name: companyName,
        employee_code: employeeCode,
      },
    });
  } catch (err) {
    console.error('[login]', err.message);
    return res.status(500).json({ message: 'Terjadi kesalahan server saat login' });
  }
};

/* ── Get Current User ─────────────────────────────────── */
export const getMe = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, username, role, avatar FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }
    const user = rows[0];

    const { companyId, isManagement, employeeCode, companyName } = await getEmployeeContext(user.id);

    const [roleRows] = await cleanoxPool.query(
      'SELECT role FROM mst_role WHERE employee_id = ?',
      [user.id]
    );
    const userRole = roleRows.length > 0 ? roleRows[0].role : 'frontliner';

    return res.json({
      user: {
        ...user,
        role: userRole,
        isManagement,
        company_id: companyId,
        company_name: companyName,
        employee_code: employeeCode,
      },
    });
  } catch (err) {
    console.error('[getMe]', err.message);
    return res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

export const logout = async (_req, res) => {
  return res.json({ message: 'Logout berhasil' });
};
