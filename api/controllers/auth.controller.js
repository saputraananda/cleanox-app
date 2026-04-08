import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db/cleanox.js';

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
      'INSERT INTO users (name, email, username, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [name, email, username || null, passwordHash, 'admin']
    );
    const userId = userResult.insertId;

    // Buat employee_code dari user id
    const employeeCode = `EMP-${String(userId).padStart(4, '0')}`;

    // Insert ke tabel mst_employee dengan id yang sama
    await conn.query(
      `INSERT INTO mst_employee
         (id, employee_code, name, email, phone, status, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
      [userId, employeeCode, name, email, phone || null, userId, userId]
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

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name, username: user.username },
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
        role: user.role,
        avatar: user.avatar,
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
    return res.json({ user: rows[0] });
  } catch (err) {
    console.error('[getMe]', err.message);
    return res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

/* ── CRUD Users (admin only) ──────────────────────────── */
const ALLOWED_ROLES = ['admin', 'cleanox', 'frontliner'];

export const getUsers = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.username, u.role, u.created_at,
              e.phone
       FROM users u
       LEFT JOIN mst_employee e ON e.id = u.id
       ORDER BY u.name ASC`
    );
    return res.json(rows);
  } catch (err) {
    console.error('[getUsers]', err.message);
    return res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
};

export const createUser = async (req, res) => {
  const { name, email, username, phone, password, role } = req.body;

  if (!name || !email || !username || !password) {
    return res.status(400).json({ message: 'Nama, email, username, dan password wajib diisi' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password minimal 8 karakter' });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ message: 'Role tidak valid' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existingEmail] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingEmail.length > 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'Email sudah terdaftar' });
    }

    const [existingUsername] = await conn.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUsername.length > 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'Username sudah digunakan' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [userResult] = await conn.query(
      'INSERT INTO users (name, email, username, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [name, email, username, passwordHash, role]
    );
    const userId = userResult.insertId;

    const employeeCode = `EMP-${String(userId).padStart(4, '0')}`;
    await conn.query(
      `INSERT INTO mst_employee
         (id, employee_code, name, email, phone, status, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
      [userId, employeeCode, name, email, phone || null, req.user.id, req.user.id]
    );

    await conn.commit();
    return res.status(201).json({ message: 'User berhasil dibuat', id: userId });
  } catch (err) {
    await conn.rollback();
    console.error('[createUser]', err.message);
    return res.status(500).json({ message: 'Terjadi kesalahan server' });
  } finally {
    conn.release();
  }
};

export const updateUser = async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { name, email, username, phone, role, password } = req.body;

  if (!name || !email || !username) {
    return res.status(400).json({ message: 'Nama, email, dan username wajib diisi' });
  }
  if (role && !ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ message: 'Role tidak valid' });
  }
  if (password && password.length < 8) {
    return res.status(400).json({ message: 'Password minimal 8 karakter' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [userCheck] = await conn.query('SELECT id FROM users WHERE id = ?', [userId]);
    if (userCheck.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    const [dupEmail] = await conn.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
    if (dupEmail.length > 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'Email sudah digunakan user lain' });
    }

    const [dupUsername] = await conn.query('SELECT id FROM users WHERE username = ? AND id != ?', [username, userId]);
    if (dupUsername.length > 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'Username sudah digunakan user lain' });
    }

    if (password) {
      const passwordHash = await bcrypt.hash(password, 12);
      await conn.query(
        'UPDATE users SET name = ?, email = ?, username = ?, role = ?, password_hash = ?, updated_at = NOW() WHERE id = ?',
        [name, email, username, role, passwordHash, userId]
      );
    } else {
      await conn.query(
        'UPDATE users SET name = ?, email = ?, username = ?, role = ?, updated_at = NOW() WHERE id = ?',
        [name, email, username, role, userId]
      );
    }

    await conn.query(
      'UPDATE mst_employee SET name = ?, email = ?, phone = ?, updated_by = ?, updated_at = NOW() WHERE id = ?',
      [name, email, phone || null, req.user.id, userId]
    );

    await conn.commit();
    return res.json({ message: 'User berhasil diperbarui' });
  } catch (err) {
    await conn.rollback();
    console.error('[updateUser]', err.message);
    return res.status(500).json({ message: 'Terjadi kesalahan server' });
  } finally {
    conn.release();
  }
};

export const deleteUser = async (req, res) => {
  const userId = parseInt(req.params.id, 10);

  if (userId === req.user.id) {
    return res.status(400).json({ message: 'Tidak bisa menghapus akun sendiri' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [userCheck] = await conn.query('SELECT id FROM users WHERE id = ?', [userId]);
    if (userCheck.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    await conn.query('DELETE FROM mst_employee WHERE id = ?', [userId]);
    await conn.query('DELETE FROM users WHERE id = ?', [userId]);

    await conn.commit();
    return res.json({ message: 'User berhasil dihapus' });
  } catch (err) {
    await conn.rollback();
    console.error('[deleteUser]', err.message);
    return res.status(500).json({ message: 'Terjadi kesalahan server' });
  } finally {
    conn.release();
  }
};
