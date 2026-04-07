import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import api from '../utils/api.js';
import cleanoxLogo from '../assets/cleanox.png';

export default function RegisterPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    username: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Konfirmasi password tidak cocok');
      return;
    }
    if (form.password.length < 8) {
      setError('Password minimal 8 karakter');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/register', {
        name: form.name,
        email: form.email,
        username: form.username || undefined,
        phone: form.phone || undefined,
        password: form.password,
      });
      setSuccess('Registrasi berhasil! Mengarahkan ke halaman login…');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Registrasi gagal. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-700 to-brand-600 flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-up">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-3">
            <img
              src={cleanoxLogo}
              alt=""
              className="h-16 object-contain drop-shadow-lg"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Cleanox</h1>
          <p className="text-brand-200 mt-1 text-sm">PT Waschen Alora Indonesia</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Buat Akun Baru</h2>
          <p className="text-sm text-gray-400 mb-6">Isi data diri Anda untuk mendaftar</p>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 mb-5 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 bg-green-50 text-green-700 border border-green-200 rounded-lg p-3 mb-5 text-sm">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nama */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Nama Lengkap <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Nama lengkap"
                className="input-field"
                value={form.name}
                onChange={set('name')}
                required
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                placeholder="nama@email.com"
                className="input-field"
                value={form.email}
                onChange={set('email')}
                required
              />
            </div>

            {/* Username + No HP */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
                <input
                  type="text"
                  placeholder="username"
                  className="input-field"
                  value={form.username}
                  onChange={set('username')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">No. HP / WA</label>
                <input
                  type="tel"
                  placeholder="08xx-xxxx-xxxx"
                  className="input-field"
                  value={form.phone}
                  onChange={set('phone')}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="Min. 8 karakter"
                  className="input-field pr-10"
                  value={form.password}
                  onChange={set('password')}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {form.password && (
                <div className="flex gap-1 mt-1.5">
                  {[8, 12, 16].map((len, i) => (
                    <div
                      key={len}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        form.password.length >= len
                          ? i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-blue-500' : 'bg-green-500'
                          : 'bg-gray-100'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Konfirmasi Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Konfirmasi Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                placeholder="Ulangi password"
                className="input-field"
                value={form.confirmPassword}
                onChange={set('confirmPassword')}
                required
              />
              {form.confirmPassword && form.password !== form.confirmPassword && (
                <p className="text-xs text-red-500 mt-1">Password tidak cocok</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || Boolean(success)}
              className="btn-primary w-full py-2.5"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Memproses…
                </>
              ) : (
                'Daftar Sekarang'
              )}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Sudah punya akun?{' '}
            <Link to="/login" className="text-brand-600 hover:text-brand-700 font-semibold transition-colors">
              Masuk di sini
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-brand-300/60 mt-6">
          © {new Date().getFullYear()} PT Waschen Alora Indonesia
        </p>
      </div>
    </div>
  );
}
