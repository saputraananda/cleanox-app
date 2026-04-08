import { useNavigate } from 'react-router-dom';
import { Sparkles, Building2, ChevronRight, Calendar, Factory, Users } from 'lucide-react';
import { getUser } from '../utils/auth.js';

const MENU_CARDS = [
  {
    id: 'cleanox',
    title: 'Cleanox',
    description: 'Manajemen dan monitoring data Cleanox internal.',
    icon: Sparkles,
    gradient: 'from-violet-500 to-purple-600',
    ring: 'ring-purple-200',
    soon: true,
    to: '/cleanox',
    roles: [],
  },
  {
    id: 'cleanox-by-waschen',
    title: 'Cleanox By Waschen',
    description: 'Laporan transaksi Cleanox & Karpet dari seluruh outlet Waschen.',
    icon: Building2,
    gradient: 'from-blue-500 to-indigo-600',
    ring: 'ring-blue-200',
    soon: false,
    to: '/cleanox-by-waschen',
    roles: [],
  },
  {
    id: 'status-produksi',
    title: 'Status Produksi',
    description: 'Pantau dan perbarui status pengerjaan order cleanox secara real-time.',
    icon: Factory,
    gradient: 'from-emerald-500 to-teal-600',
    ring: 'ring-emerald-200',
    soon: false,
    to: '/cleanox-by-waschen-production',
    roles: ['admin', 'cleanox', 'frontliner'],
  },
  {
    id: 'users',
    title: 'Manajemen User',
    description: 'Tambah, edit, dan kelola akun serta role seluruh pengguna sistem.',
    icon: Users,
    gradient: 'from-orange-400 to-rose-500',
    ring: 'ring-orange-200',
    soon: false,
    to: '/users',
    roles: ['admin'],
  },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = getUser();
  const firstName = user?.name?.split(' ')[0] || 'User';
  const today = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const visibleCards = MENU_CARDS.filter(
    (item) => item.roles.length > 0 && item.roles.includes(user?.role)
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Welcome banner */}
      <div className="card mb-8 bg-gradient-to-r from-blue-600 to-indigo-700 border-0 flex items-center justify-between overflow-hidden relative">
        <div className="absolute right-0 top-0 w-64 h-full opacity-10">
          <div className="w-full h-full bg-white rounded-full scale-150 translate-x-1/2 -translate-y-1/4" />
        </div>
        <div className="relative">
          <p className="text-blue-100 text-sm mb-1">Selamat datang kembali,</p>
          <h1 className="text-2xl font-bold text-white">{firstName}! 👋</h1>
          <div className="flex items-center gap-1.5 mt-2 text-blue-200 text-xs">
            <Calendar className="w-3.5 h-3.5" />
            {today}
          </div>
        </div>
        <div className="hidden sm:flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 relative z-10">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
      </div>

      {/* Menu cards */}
      <h2 className="text-base font-semibold text-gray-900 mb-4">Menu Utama</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {visibleCards.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(item.to)}
            className={`card text-left group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ring-1 ${item.ring} relative overflow-hidden`}
          >
            {/* Decorative blob */}
            <div
              className={`absolute -top-8 -right-8 w-32 h-32 rounded-full bg-gradient-to-br ${item.gradient} opacity-10 transition-all duration-300 group-hover:opacity-20`}
            />

            <div className="flex items-start justify-between relative">
              <div className="flex items-center gap-4">
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-md flex-shrink-0`}
                >
                  <item.icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-semibold text-gray-900">{item.title}</h3>
                    {item.soon && (
                      <span className="badge bg-yellow-100 text-yellow-700">Soon</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 leading-snug">{item.description}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-0.5" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
