import { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Pencil,
  Trash2,
  Search,
  X,
  Eye,
  EyeOff,
  ShieldCheck,
  Building2,
  UserCheck,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import api from '../utils/api.js';
import { getUser } from '../utils/auth.js';

/* ── Constants ────────────────────────────────────────── */
const ROLES = ['admin', 'cleanox', 'frontliner'];

const ROLE_CONFIG = {
  admin:      { label: 'Admin',      cls: 'bg-purple-100 text-purple-700 ring-1 ring-purple-200' },
  cleanox:    { label: 'Cleanox',    cls: 'bg-blue-100   text-blue-700   ring-1 ring-blue-200'   },
  frontliner: { label: 'Frontliner', cls: 'bg-green-100  text-green-700  ring-1 ring-green-200'  },
};

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500',   'bg-cyan-500', 'bg-indigo-500',  'bg-teal-500',
];

/* ── Helpers ──────────────────────────────────────────── */
function getInitials(name = '') {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

function avatarColor(id) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

function formatDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/* ── Sub-components ───────────────────────────────────── */
function StatCard({ icon: Icon, label, value, gradient }) {
  return (
    <div className={`rounded-2xl p-4 text-white bg-gradient-to-br ${gradient} shadow-sm`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/70 text-xs font-medium">{label}</p>
          <p className="text-2xl font-bold mt-0.5">{value}</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

/* ── Modal Overlay ────────────────────────────────────── */
function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative min-h-full flex items-center justify-center p-4">
        <div
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── Delete Confirmation ──────────────────────────────── */
function DeleteConfirm({ open, target, onConfirm, onCancel, loading }) {
  return (
    <Modal open={open} onClose={onCancel}>
      <div className="p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5">
          <AlertTriangle className="w-7 h-7 text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Hapus User?</h3>
        <p className="text-sm text-gray-500 mb-1">
          Akun <span className="font-semibold text-gray-700">{target?.name}</span> akan dihapus secara permanen.
        </p>
        <p className="text-xs text-red-400 mb-7">Data karyawan terkait juga akan ikut terhapus.</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 btn-secondary rounded-xl py-2.5"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
          >
            {loading ? 'Menghapus…' : 'Ya, Hapus'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ── User Form Modal ──────────────────────────────────── */
const EMPTY_FORM = {
  name: '', email: '', username: '', phone: '', role: 'frontliner', password: '', confirm: '',
};

function UserForm({ open, onClose, onSave, editUser }) {
  const isEdit = Boolean(editUser);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setShowPass(false);
    if (isEdit) {
      setForm({
        name: editUser.name ?? '',
        email: editUser.email ?? '',
        username: editUser.username ?? '',
        phone: editUser.phone ?? '',
        role: ROLES.includes(editUser.role) ? editUser.role : 'frontliner',
        password: '',
        confirm: '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, editUser]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const validate = () => {
    const e = {};
    if (!form.name.trim())     e.name     = 'Nama wajib diisi';
    if (!form.email.trim())    e.email    = 'Email wajib diisi';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Format email tidak valid';
    if (!form.username.trim()) e.username = 'Username wajib diisi';
    if (!isEdit && !form.password) e.password = 'Password wajib diisi';
    if (form.password && form.password.length < 8)
      e.password = 'Password minimal 8 karakter';
    if (form.password && form.password !== form.confirm)
      e.confirm = 'Konfirmasi password tidak cocok';
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }

    setLoading(true);
    try {
      const payload = {
        name:     form.name.trim(),
        email:    form.email.trim(),
        username: form.username.trim(),
        phone:    form.phone.trim() || null,
        role:     form.role,
      };
      if (!isEdit || form.password) payload.password = form.password;

      if (isEdit) {
        await api.put(`/auth/users/${editUser.id}`, payload);
      } else {
        await api.post('/auth/users', payload);
      }
      onSave();
    } catch (err) {
      setErrors({ submit: err.response?.data?.message ?? 'Terjadi kesalahan, coba lagi.' });
    } finally {
      setLoading(false);
    }
  };

  const inputCls = (k) =>
    `w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
      errors[k] ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'
    }`;

  return (
    <Modal open={open} onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
        <div>
          <h3 className="font-semibold text-gray-900">{isEdit ? 'Edit User' : 'Tambah User Baru'}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {isEdit ? 'Perbarui data akun pengguna' : 'Buat akun baru sekaligus data karyawan'}
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
        {errors.submit && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {errors.submit}
          </div>
        )}

        {/* Name + Username */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nama Lengkap" required error={errors.name}>
            <input
              className={inputCls('name')}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Nama lengkap"
            />
          </Field>
          <Field label="Username" required error={errors.username}>
            <input
              className={inputCls('username')}
              value={form.username}
              onChange={(e) => set('username', e.target.value)}
              placeholder="username"
            />
          </Field>
        </div>

        {/* Email */}
        <Field label="Email" required error={errors.email}>
          <input
            type="email"
            className={inputCls('email')}
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="email@example.com"
          />
        </Field>

        {/* Phone + Role */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="No. Telepon" error={errors.phone}>
            <input
              className={inputCls('phone')}
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="08xxxxxxxxxx"
            />
          </Field>
          <Field label="Role" required error={errors.role}>
            <select
              className={inputCls('role')}
              value={form.role}
              onChange={(e) => set('role', e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Password section */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {isEdit ? 'Ganti Password — kosongkan jika tidak ingin diubah' : 'Password'}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label={isEdit ? 'Password Baru' : 'Password'} required={!isEdit} error={errors.password}>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  className={inputCls('password') + ' pr-10'}
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder="Min. 8 karakter"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>
            <Field label="Konfirmasi Password" error={errors.confirm}>
              <input
                type={showPass ? 'text' : 'password'}
                className={inputCls('confirm')}
                value={form.confirm}
                onChange={(e) => set('confirm', e.target.value)}
                placeholder="Ulangi password"
              />
            </Field>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 pb-6 flex gap-3 border-t border-gray-50 pt-4">
        <button onClick={onClose} className="flex-1 btn-secondary rounded-xl py-2.5">
          Batal
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
        >
          {loading
            ? isEdit ? 'Menyimpan…' : 'Membuat…'
            : isEdit ? 'Simpan Perubahan' : 'Buat User'}
        </button>
      </div>
    </Modal>
  );
}

/* ── Main Page ────────────────────────────────────────── */
export default function UserManagementPage() {
  const currentUser = getUser();
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [formOpen, setFormOpen]     = useState(false);
  const [editUser, setEditUser]     = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/auth/users');
      setUsers(res.data);
    } catch { /* ignored */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      const matchSearch =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.username ?? '').toLowerCase().includes(q);
      const matchRole = !roleFilter || u.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [users, search, roleFilter]);

  const stats = useMemo(() => ({
    total:      users.length,
    admin:      users.filter((u) => u.role === 'admin').length,
    cleanox:    users.filter((u) => u.role === 'cleanox').length,
    frontliner: users.filter((u) => u.role === 'frontliner').length,
  }), [users]);

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await api.delete(`/auth/users/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchUsers();
    } catch { /* ignored */ }
    finally { setDeleteLoading(false); }
  };

  const handleSave = () => {
    setFormOpen(false);
    setEditUser(null);
    fetchUsers();
  };

  const openEdit = (u) => { setEditUser(u); setFormOpen(true); };
  const openCreate = () => { setEditUser(null); setFormOpen(true); };

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manajemen User</h1>
          <p className="text-sm text-gray-500 mt-0.5">Kelola akun dan role seluruh pengguna sistem</p>
        </div>
        <button
          onClick={fetchUsers}
          className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Users}      label="Total User"  value={stats.total}      gradient="from-blue-500 to-indigo-600"   />
        <StatCard icon={ShieldCheck} label="Admin"      value={stats.admin}      gradient="from-violet-500 to-purple-600" />
        <StatCard icon={Building2}  label="Cleanox"     value={stats.cleanox}    gradient="from-sky-500 to-blue-500"      />
        <StatCard icon={UserCheck}  label="Frontliner"  value={stats.frontliner} gradient="from-emerald-500 to-green-600" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, email, atau username…"
            className="w-full pl-10 pr-9 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Role filter */}
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700"
        >
          <option value="">Semua Role</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
          ))}
        </select>

        {/* Add button */}
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm whitespace-nowrap"
        >
          <UserPlus className="w-4 h-4" />
          Tambah User
        </button>
      </div>

      {/* Table card */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <div className="inline-flex items-center gap-2 text-sm text-gray-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Memuat data…
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    User
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">
                    Email
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">
                    No. Telepon
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Role
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">
                    Bergabung
                  </th>
                  <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-blue-50/30 transition-colors group">
                    {/* User cell */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-full ${avatarColor(u.id)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}
                        >
                          {getInitials(u.name)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800 leading-tight">
                            {u.name}
                            {u.id === currentUser?.id && (
                              <span className="ml-2 text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-md font-medium">
                                Anda
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {u.username ? `@${u.username}` : <span className="italic">no username</span>}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="px-5 py-4 text-gray-500 hidden md:table-cell">{u.email}</td>

                    {/* Phone */}
                    <td className="px-5 py-4 text-gray-400 hidden sm:table-cell">
                      {u.phone || <span className="italic text-xs">—</span>}
                    </td>

                    {/* Role */}
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${
                          ROLE_CONFIG[u.role]?.cls ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {ROLE_CONFIG[u.role]?.label ?? u.role}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-5 py-4 text-xs text-gray-400 hidden lg:table-cell">
                      {formatDate(u.created_at)}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(u)}
                          className="p-2 rounded-lg text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-all"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(u)}
                          disabled={u.id === currentUser?.id}
                          className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                          title={
                            u.id === currentUser?.id
                              ? 'Tidak bisa menghapus akun sendiri'
                              : 'Hapus user'
                          }
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center">
                      <p className="text-sm text-gray-400">
                        {search || roleFilter
                          ? 'Tidak ada user yang cocok dengan filter.'
                          : 'Belum ada data user.'}
                      </p>
                      {(search || roleFilter) && (
                        <button
                          onClick={() => { setSearch(''); setRoleFilter(''); }}
                          className="mt-2 text-xs text-blue-500 hover:underline"
                        >
                          Hapus filter
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-gray-400 mt-3 px-1">
          Menampilkan{' '}
          <span className="font-medium text-gray-600">{filtered.length}</span>{' '}
          dari{' '}
          <span className="font-medium text-gray-600">{users.length}</span>{' '}
          user
        </p>
      )}

      {/* Modals */}
      <UserForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditUser(null); }}
        onSave={handleSave}
        editUser={editUser}
      />

      <DeleteConfirm
        open={Boolean(deleteTarget)}
        target={deleteTarget}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteLoading}
      />
    </div>
  );
}
