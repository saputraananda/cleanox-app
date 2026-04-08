import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import api from '../utils/api.js';
import { setAuth } from '../utils/auth.js';
import cleanoxLogo from '../assets/cleanox.png';
import AuthHeroPanel from '../components/AuthHeroPanel.jsx';

export default function LoginPage() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', form);
      setAuth(data.token, data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Login gagal. Silakan coba lagi.');
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

          <div className="w-full max-w-[360px] animate-slide-up bg-white border border-gray-200 rounded-2xl shadow-sm px-8 py-8">
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
            <div className="mb-7">
              <h1 className="text-[26px] font-bold text-gray-900 leading-tight">
                Selamat datang
              </h1>
              <p className="text-sm text-gray-400 mt-1.5">
                Silahkan Login
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 text-red-700 border border-red-100 rounded-xl p-3 mb-5 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Username</label>
                <input
                  type="text"
                  placeholder="Masukkan username Anda"
                  className="input-field"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                  autoComplete="username"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    placeholder="Masukkan password"
                    className="input-field pr-10"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                    autoComplete="current-password"
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
              </div>

              <button
                type="submit"
                disabled={loading}
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
                ) : 'Masuk'}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-100 text-center text-sm text-gray-500">
              Belum punya akun?{' '}
              <Link
                to="/register"
                className="text-brand-600 hover:text-brand-700 font-semibold transition-colors"
              >
                Daftar di sini
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
