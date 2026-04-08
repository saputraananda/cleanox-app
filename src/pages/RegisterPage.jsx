import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import api from '../utils/api.js';
import cleanoxLogo from '../assets/cleanox.png';
import AuthHeroPanel from '../components/AuthHeroPanel.jsx';

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
    <div className="h-screen flex overflow-hidden bg-gray-50">
      {/* Left: hero image slideshow */}
      <AuthHeroPanel />

      {/* Right: form panel */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <div className="flex-1 flex flex-col items-center justify-center px-8 sm:px-14 py-10">

          {/* Mobile-only brand header */}
          <div className="flex lg:hidden flex-col items-center mb-8">
            <img
              src={cleanoxLogo}
              alt="Cleanox"
              className="h-10 object-contain mb-2"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <p className="text-brand-800 font-bold text-xl tracking-tight">Cleanox</p>
            <p className="text-gray-400 text-xs mt-0.5">PT Waschen Alora Indonesia</p>
          </div>

          <div className="w-full max-w-[400px] animate-slide-up bg-white border border-gray-200 rounded-2xl shadow-sm px-8 py-8">
            {/* Desktop logo */}
            <div className="hidden lg:flex items-center gap-2 mb-8">
              <img
                src={cleanoxLogo}
                alt="Cleanox"
                className="h-7 object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <span className="text-brand-800 font-semibold text-sm tracking-tight">Cleanox</span>
            </div>

            {/* Heading */}
            <div className="mb-6">
              <h1 className="text-[26px] font-bold text-gray-900 leading-tight">Buat akun baru</h1>
              <p className="text-sm text-gray-400 mt-1.5">Isi data diri Anda untuk mendaftar</p>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 text-red-700 border border-red-100 rounded-xl p-3 mb-4 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="flex items-start gap-2 bg-green-50 text-green-700 border border-green-100 rounded-xl p-3 mb-4 text-sm">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Nama */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
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
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
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

              {/* Username + Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">Username</label>
                  <input
                    type="text"
                    placeholder="username"
                    className="input-field"
                    value={form.username}
                    onChange={set('username')}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">No. HP / WA</label>
                  <input
                    type="tel"
                    placeholder="08xx-xxxx"
                    className="input-field"
                    value={form.phone}
                    onChange={set('phone')}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {form.password && (
                  <div className="flex gap-1 mt-1">
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

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
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
                className="w-full mt-1 py-2.5 rounded-xl bg-brand-700 hover:bg-brand-800 active:bg-brand-900
                  text-white font-semibold text-sm transition-all duration-200
                  flex items-center justify-center gap-2
                  shadow-md shadow-brand-900/20 disabled:opacity-60 focus:outline-none
                  focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Memproses…
                  </>
                ) : 'Daftar Sekarang'}
              </button>
            </form>

            <div className="mt-5 pt-5 border-t border-gray-100 text-center text-sm text-gray-500">
              Sudah punya akun?{' '}
              <Link
                to="/login"
                className="text-brand-600 hover:text-brand-700 font-semibold transition-colors"
              >
                Masuk di sini
              </Link>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-300 pb-5 flex-shrink-0">
          © {new Date().getFullYear()} PT Waschen Alora Indonesia
        </p>
      </div>
    </div>
  );
}

