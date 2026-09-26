import { Fragment, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Handshake, Inbox, ChevronDown, ChevronRight, Download } from 'lucide-react';
import api from '@shared/utils/api.js';

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

function getJakartaParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Aktif cutoff: hari ≥ 26 → bulan berikutnya (mirror CleanoxOnlyDashboardPage) */
function getActiveCutoffPeriod(now = new Date()) {
  const { year, month, day } = getJakartaParts(now);
  if (day >= 26) {
    if (month === 12) return { yr: year + 1, mo: 1 };
    return { yr: year, mo: month + 1 };
  }
  return { yr: year, mo: month };
}

function formatRp(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDateId(value) {
  if (!value) return '—';
  const raw = String(value);
  const ymd = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
  if (ymd) {
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

function formatCutoffLabel(dateStart, dateEnd) {
  if (!dateStart || !dateEnd) return null;
  return `${formatDateId(dateStart)} – ${formatDateId(dateEnd)}`;
}

export default function PosWaschenReferralPage() {
  const activeCutoff = useMemo(() => getActiveCutoffPeriod(), []);
  const [filterType, setFilterType] = useState('bulan');
  const [year, setYear] = useState(activeCutoff.yr);
  const [month, setMonth] = useState(activeCutoff.mo);
  const [rows, setRows] = useState([]);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [totalNominal, setTotalNominal] = useState(0);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [expandedKey, setExpandedKey] = useState(null);

  const yearOptions = useMemo(() => {
    const list = [];
    for (let y = activeCutoff.yr; y >= activeCutoff.yr - 5; y -= 1) list.push(y);
    return list;
  }, [activeCutoff.yr]);

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
      setTotalNominal(Number(data.total_nominal || 0));
      setDateStart(data.filter?.date_start || '');
      setDateEnd(data.filter?.date_end || '');
      setExpandedKey(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat leaderboard referral Waschen');
      setRows([]);
      setTotalCustomers(0);
      setTotalNominal(0);
      setDateStart('');
      setDateEnd('');
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

  const cutoffLabel = formatCutoffLabel(dateStart, dateEnd);

  const handleExport = async () => {
    setExporting(true);
    setError('');
    try {
      const params = {
        filter_type: filterType,
        year,
      };
      if (filterType === 'bulan') params.month = month;

      const res = await api.get('/pos-waschen-referral/export', {
        params,
        responseType: 'blob',
      });

      const contentType = res.headers?.['content-type'] || '';
      if (contentType.includes('application/json')) {
        const text = await res.data.text();
        let message = 'Gagal export Excel referral Waschen';
        try {
          message = JSON.parse(text)?.message || message;
        } catch {
          /* keep default */
        }
        throw new Error(message);
      }

      const disposition = res.headers?.['content-disposition'] || '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename =
        match?.[1] ||
        `referral-waschen-${dateStart || 'start'}_sd_${dateEnd || 'end'}.xlsx`;

      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      let message = err.message || 'Gagal export Excel referral Waschen';
      const data = err.response?.data;
      if (data instanceof Blob) {
        try {
          const text = await data.text();
          message = JSON.parse(text)?.message || message;
        } catch {
          /* keep message */
        }
      } else if (data?.message) {
        message = data.message;
      }
      setError(message);
    } finally {
      setExporting(false);
    }
  };

  const toggleExpand = (groupKey) => {
    setExpandedKey((prev) => (prev === groupKey ? null : groupKey));
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">
            Cleanox Only
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Referral Waschen</h1>
          <p className="mt-1 text-sm text-slate-500">
            Performa pegawai Waschen berdasarkan transaksi pertama customer (non-batal) pada
            periode cutoff {periodLabel}
            {cutoffLabel ? ` (${cutoffLabel})` : ''}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={loading || exporting}
            className="inline-flex items-center gap-2 rounded-[12px] border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <Download className={`w-4 h-4 ${exporting ? 'animate-pulse' : ''}`} />
            {exporting ? 'Mengekspor...' : 'Export Excel'}
          </button>
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              <span className="font-medium">Bulan cutoff</span>
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
          <div className="rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">
              Total nominal
            </p>
            <p className="mt-1 text-lg font-bold text-slate-900">{formatRp(totalNominal)}</p>
          </div>
        </div>

        {cutoffLabel && (
          <p className="text-[12px] font-medium text-slate-600">
            Cutoff: <span className="text-slate-900">{cutoffLabel}</span>
          </p>
        )}

        <p className="text-[11.5px] text-slate-400">
          Dihitung dari <span className="font-semibold text-slate-500">transaksi pertama</span>{' '}
          customer sumber Waschen (non-batal) yang{' '}
          <span className="font-semibold text-slate-500">service_date</span>-nya masuk cutoff.
          Klik baris pegawai untuk melihat detail.
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
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-gradient-to-r from-brand-900 to-brand-800 border-b border-brand-700">
                  <th className="px-4 py-3 text-left text-[12px] font-semibold text-white/90 uppercase tracking-wider w-12" />
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
                    <td colSpan={4} className="px-4 py-16 text-center">
                      <Inbox className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                      <p className="text-gray-400 font-medium">
                        Belum ada pegawai dengan customer transaksi pertama pada periode cutoff ini
                      </p>
                    </td>
                  </tr>
                ) : (
                  rows.map((row, index) => {
                    const key = row.group_key || row.employee_id || `manual-${row.employee_name}`;
                    const isOpen = expandedKey === key;
                    const customers = row.customers || [];
                    return (
                      <Fragment key={key}>
                        <tr
                          onClick={() => toggleExpand(key)}
                          className="border-b border-gray-50 hover:bg-slate-50/40 transition-colors even:bg-slate-50/20 cursor-pointer"
                        >
                          <td className="px-4 py-3 text-slate-400">
                            {isOpen ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </td>
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
                        {isOpen && (
                          <tr className="bg-slate-50/60">
                            <td colSpan={4} className="px-4 py-3">
                              {customers.length === 0 ? (
                                <p className="text-[12px] text-slate-400 py-2">
                                  Tidak ada detail customer.
                                </p>
                              ) : (
                                <div className="overflow-x-auto rounded-[12px] border border-slate-200 bg-white">
                                  <table className="w-full text-[12.5px] min-w-[640px]">
                                    <thead>
                                      <tr className="border-b border-slate-100 bg-slate-50">
                                        <th className="px-3 py-2 text-left font-semibold text-slate-500">
                                          Customer
                                        </th>
                                        <th className="px-3 py-2 text-left font-semibold text-slate-500">
                                          Tgl trx awal
                                        </th>
                                        <th className="px-3 py-2 text-left font-semibold text-slate-500">
                                          No trx
                                        </th>
                                        <th className="px-3 py-2 text-right font-semibold text-slate-500">
                                          Nominal
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {customers.map((c) => (
                                        <tr
                                          key={`${c.customer_id}-${c.transaction_id}`}
                                          className="border-b border-slate-50 last:border-0"
                                        >
                                          <td className="px-3 py-2 text-slate-800 font-medium">
                                            {c.customer_name}
                                          </td>
                                          <td className="px-3 py-2 text-slate-600">
                                            {formatDateId(c.service_date)}
                                          </td>
                                          <td className="px-3 py-2 text-slate-600 font-mono text-[11.5px]">
                                            {c.transaction_no}
                                          </td>
                                          <td className="px-3 py-2 text-right text-slate-800 font-semibold">
                                            {formatRp(c.final_amount)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
