import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import api from '../utils/api.js';
import { getLandingRoute, setAuth } from '../utils/auth.js';
import cleanoxLogo from '../assets/cleanox.png';
import AuthHeroPanel, { AUTH_HERO_SLIDES } from '../components/AuthHeroPanel.jsx';

export default function LoginPage() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentMobileSlide, setCurrentMobileSlide] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const id = setInterval(
      () => setCurrentMobileSlide((c) => (c + 1) % AUTH_HERO_SLIDES.length),
      4500
    );
    return () => clearInterval(id);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', form);
      setAuth(data.token, data.user);
      navigate(getLandingRoute(data.user), { replace: true });
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
        <div className="flex-1 flex flex-col lg:items-center lg:justify-center lg:px-8 sm:px-14 lg:py-10 bg-white">
          <div className="lg:hidden relative min-h-[44dvh] overflow-hidden bg-brand-900 px-5 pt-7 pb-12">
            {AUTH_HERO_SLIDES.map((slide, i) => (
              <img
                key={i}
                src={slide.img}
                alt=""
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1200ms] ${
                  i === currentMobileSlide ? 'opacity-100' : 'opacity-0'
                }`}
                draggable={false}
              />
            ))}
            <div className="absolute inset-0 bg-gradient-to-r from-brand-900/70 to-brand-900/20" />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-900 via-brand-900/10 to-brand-900/55" />
            <div className="absolute -top-20 -left-20 h-72 w-72 rounded-full bg-white/[0.03] pointer-events-none" />
            <div className="absolute top-1/3 -right-16 h-48 w-48 rounded-full bg-white/[0.04] pointer-events-none" />

            <div className="relative z-10 flex h-full flex-col justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={cleanoxLogo}
                  alt="Cleanox"
                  className="h-9 object-contain drop-shadow-lg"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div>
                  <p className="text-white font-bold text-[17px] tracking-tight leading-none">
                    Aplikasi Tracking Produksi Cleanox
                  </p>
                  <p className="text-brand-200/50 text-[10px] font-medium tracking-wide mt-0.5">
                    by Waschen Alora
                  </p>
                </div>
              </div>

              <div className="mt-10 space-y-4">
                <div>
                  <span className="inline-block text-[9px] font-semibold text-white/40 uppercase tracking-[0.25em] mb-2">
                    Tim Cleanox Alora
                  </span>
                  <h2 className="max-w-[250px] text-white text-[28px] font-bold leading-tight drop-shadow-sm">
                    {AUTH_HERO_SLIDES[currentMobileSlide]?.caption ||
                      'Dipercaya oleh ribuan pelanggan setia'}
                  </h2>
                </div>
                <div className="flex items-center gap-1.5">
                  {AUTH_HERO_SLIDES.map((_, i) => (
                    <span
                      key={i}
                      className={`h-[3px] rounded-full ${
                        i === currentMobileSlide ? 'bg-white w-8' : 'bg-white/25 w-2'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-3 w-full rounded-t-[30px] bg-white px-6 pt-7 pb-2 shadow-[0_-8px_28px_rgba(15,23,42,.08)] lg:mx-auto lg:mt-0 lg:max-w-[360px] lg:rounded-2xl lg:border lg:border-gray-200 lg:px-8 lg:py-8 lg:shadow-sm">
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

            <form onSubmit={handleSubmit} className="max-w-[360px] mx-auto space-y-4">
              <div className="space-y-4 lg:space-y-4">
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
              </div>

              <div className="mt-7 translate-y-2 lg:mt-1 lg:translate-y-0">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full lg:mt-1 py-2.5 rounded-xl bg-brand-700 hover:bg-brand-800 active:bg-brand-900
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
              </div>
            </form>
          </div>
        </div>

        <p className="text-center text-xs text-gray-300 pb-4 pt-2 lg:pt-0 flex-shrink-0">
          © {new Date().getFullYear()} PT Waschen Alora Indonesia
        </p>
      </div>
    </div>
  );
}
