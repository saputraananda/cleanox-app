import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Handshake, Inbox } from 'lucide-react';
import api from '../utils/api.js';

const MONTH_OPTIONS = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' },
];

function currentYearJakarta() {
  return Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
    }).format(new Date())
  );
}

function currentMonthJakarta() {
  return Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      month: 'numeric',
    }).format(new Date())
  );
}

export default function PosWaschenReferralPage() {
  const nowYear = currentYearJakarta();
  const [filterType, setFilterType] = useState('bulan');
  const [year, setYear] = useState(nowYear);
  const [month, setMonth] = useState(currentMonthJakarta());
  const [rows, setRows] = useState([]);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const yearOptions = useMemo(() => {
    const list = [];
    for (let y = nowYear; y >= nowYear - 5; y -= 1) list.push(y);
    return list;
  }, [nowYear]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        filter_type: filterType,
        year,
      };
      if (filterType === 'bulan') params.month = month;

      const { data } = await api.get('/pos-waschen-referral/leaderboard', { params });
      setRows(data.rows || []);
      setTotalCustomers(Number(data.total_customers || 0));
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat leaderboard referral Waschen');
      setRows([]);
      setTotalCustomers(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, year, month]);

  const periodLabel =
    filterType === 'bulan'
      ? `${MONTH_OPTIONS.find((m) => m.value === Number(month))?.label || month} ${year}`
      : `Tahun ${year}`;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">
            Cleanox Only
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Referral Waschen</h1>
          <p className="mt-1 text-sm text-slate-500">
            Performa pegawai Waschen yang berhasil membawa customer dengan transaksi
            (non-batal) pada periode {periodLabel}.
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-[12px] border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Muat ulang
        </button>
      </div>

      <div className="rounded-[20px] border border-slate-200 bg-white p-4 sm:p-5 space-y-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilterType('bulan')}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold border transition ${
              filterType === 'bulan'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Bulanan
          </button>
          <button
            type="button"
            onClick={() => setFilterType('tahun')}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold border transition ${
              filterType === 'tahun'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Tahunan
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block space-y-1.5 text-[12.5px] text-slate-600">
            <span className="font-medium">Tahun</span>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px]"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          {filterType === 'bulan' && (
            <label className="block space-y-1.5 text-[12.5px] text-slate-600">
              <span className="font-medium">Bulan</span>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px]"
              >
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">
              Total customer berhasil
            </p>
            <p className="mt-1 text-xl font-bold text-slate-900">{totalCustomers}</p>
          </div>
        </div>

        <p className="text-[11.5px] text-slate-400">
          Dihitung dari customer sumber Waschen yang punya transaksi non-batal pada{' '}
          <span className="font-semibold text-slate-500">service_date</span> periode terpilih.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="rounded-[20px] border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-14 text-center text-[13px] text-slate-500">Memuat data...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-gradient-to-r from-brand-900 to-brand-800 border-b border-brand-700">
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider w-16">
                    No
                  </th>
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider">
                    Nama Pegawai
                  </th>
                  <th className="px-4 py-3 text-right text-[12px] font-semibold text-white/90 uppercase tracking-wider">
                    Jumlah Customer Berhasil
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-16 text-center">
                      <Inbox className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                      <p className="text-gray-400 font-medium">
                        Belum ada pegawai dengan customer transaksi pada periode ini
                      </p>
                    </td>
                  </tr>
                ) : (
                  rows.map((row, index) => (
                    <tr
                      key={row.employee_id}
                      className="border-b border-gray-50 hover:bg-slate-50/40 transition-colors even:bg-slate-50/20"
                    >
                      <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-emerald-50 text-emerald-700">
                            <Handshake className="w-4 h-4" />
                          </span>
                          <span className="font-medium text-slate-900">{row.employee_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        {row.customer_count}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
