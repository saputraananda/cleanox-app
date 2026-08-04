import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../utils/api.js';

const STATUS_OPTIONS = [
  'Draft',
  'Menunggu_Konfirmasi',
  'Dijadwalkan',
  'Dalam_Proses',
  'Selesai',
  'Dibatalkan',
];

const formatCurrency = (value) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDateTime = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function PosTransactionDetailPage() {
  const { id } = useParams();
  const [detail, setDetail] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusForm, setStatusForm] = useState({ status: '', title: '', description: '' });
  const [groupForm, setGroupForm] = useState({ recipient: '', message: '' });
  const [customerForm, setCustomerForm] = useState({ recipient: '', message: '' });
  const [assignmentIds, setAssignmentIds] = useState([]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [detailRes, workerRes] = await Promise.all([
        api.get(`/pos-transactions/${id}`),
        api.get('/pos-transactions/workers'),
      ]);
      const nextDetail = detailRes.data;
      setDetail(nextDetail);
      setWorkers(workerRes.data.workers || []);
      setAssignmentIds((nextDetail.assignments || []).map((row) => Number(row.employee_id)));
      setStatusForm((prev) => ({ ...prev, status: nextDetail.transaction.status || 'Draft' }));
      setGroupForm({
        recipient: '',
        message:
          nextDetail.transaction.group_message_template ||
          `Transaksi ${nextDetail.transaction.transaction_no} untuk ${nextDetail.transaction.customer_name} sudah dijadwalkan.`,
      });
      setCustomerForm({
        recipient: nextDetail.transaction.customer_phone || '',
        message:
          nextDetail.transaction.customer_message_template ||
          `Halo ${nextDetail.transaction.customer_name}, transaksi ${nextDetail.transaction.transaction_no} sedang kami proses.`,
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat detail transaksi POS');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const itemSummary = useMemo(() => {
    if (!detail) return '';
    return detail.items.map((item) => `${item.service_name} x${item.qty}`).join(', ');
  }, [detail]);

  const handleStatusSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/pos-transactions/${id}/status`, statusForm);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memperbarui status');
    }
  };

  const handleAssignmentSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/pos-transactions/${id}/assignments`, { worker_ids: assignmentIds });
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memperbarui assignment');
    }
  };

  const handleSendGroup = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/pos-transactions/${id}/notify-group`, groupForm);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengirim pesan group');
    }
  };

  const handleSendCustomer = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/pos-transactions/${id}/notify-customer`, customerForm);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengirim pesan customer');
    }
  };

  if (loading) {
    return <div className="max-w-7xl mx-auto p-6 text-sm text-slate-500">Memuat detail transaksi POS...</div>;
  }

  if (!detail) {
    return <div className="max-w-7xl mx-auto p-6 text-sm text-rose-600">Detail transaksi tidak ditemukan.</div>;
  }

  const { transaction, items, assignments, tracking, notifications } = detail;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <Link to="/pos-transactions" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
            Kembali ke daftar POS
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{transaction.transaction_no}</h1>
          <p className="mt-1 text-sm text-slate-500">{transaction.customer_name} • {itemSummary}</p>
        </div>
        <div className="rounded-2xl bg-slate-900 px-5 py-4 text-white">
          <p className="text-xs uppercase tracking-wide text-slate-300">Total Akhir</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(transaction.final_amount)}</p>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Ringkasan Transaksi</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Customer</p>
              <p className="mt-1 font-semibold text-slate-900">{transaction.customer_name}</p>
              <p className="text-sm text-slate-500">{transaction.customer_phone || '-'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Tanggal Layanan</p>
              <p className="mt-1 font-semibold text-slate-900">{formatDateTime(transaction.service_date)}</p>
              <p className="text-sm text-slate-500">{transaction.total_people} orang</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
              <p className="mt-1 font-semibold text-slate-900">{transaction.status}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Catatan</p>
              <p className="mt-1 text-sm text-slate-600">{transaction.notes || '-'}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-3">Service</th>
                  <th className="px-3 py-3">Qty</th>
                  <th className="px-3 py-3">Promo</th>
                  <th className="px-3 py-3 text-right">Harga Final</th>
                  <th className="px-3 py-3 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-3 font-medium text-slate-800">{item.service_name}</td>
                    <td className="px-3 py-3 text-slate-600">{item.qty}</td>
                    <td className="px-3 py-3 text-slate-600">{item.promo_name_snapshot || '-'}</td>
                    <td className="px-3 py-3 text-right text-slate-700">{formatCurrency(item.final_price_snapshot)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatCurrency(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Update Status</h2>
          <form onSubmit={handleStatusSubmit} className="space-y-3">
            <select
              value={statusForm.status}
              onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <input
              value={statusForm.title}
              onChange={(e) => setStatusForm({ ...statusForm, title: e.target.value })}
              placeholder="Judul tracking"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <textarea
              rows={3}
              value={statusForm.description}
              onChange={(e) => setStatusForm({ ...statusForm, description: e.target.value })}
              placeholder="Catatan perubahan status"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
              Simpan Status
            </button>
          </form>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Assignment Worker</h2>
          <form onSubmit={handleAssignmentSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {workers.map((worker) => {
                const checked = assignmentIds.includes(Number(worker.employee_id));
                return (
                  <label
                    key={worker.employee_id}
                    className={`rounded-xl border p-3 cursor-pointer ${checked ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={checked}
                      onChange={() =>
                        setAssignmentIds((prev) =>
                          checked
                            ? prev.filter((id) => id !== Number(worker.employee_id))
                            : [...prev, Number(worker.employee_id)]
                        )
                      }
                    />
                    <div className="font-semibold text-slate-800">{worker.full_name}</div>
                    <div className="text-xs text-slate-500">{worker.phone_number || 'Tanpa nomor WA'}</div>
                  </label>
                );
              })}
            </div>
            <button className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Simpan Assignment
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">Worker aktif pada transaksi ini</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {assignments.length === 0 ? (
                <li>Belum ada worker ditugaskan.</li>
              ) : (
                assignments.map((item) => (
                  <li key={item.id}>
                    {item.employee_name} • {item.assignment_status}
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Notifikasi</h2>

          <form onSubmit={handleSendGroup} className="space-y-3 rounded-xl border border-slate-200 p-4">
            <p className="font-semibold text-slate-900">Kirim ke Group</p>
            <input
              value={groupForm.recipient}
              onChange={(e) => setGroupForm({ ...groupForm, recipient: e.target.value })}
              placeholder="Group ID / nomor WA"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <textarea
              rows={4}
              value={groupForm.message}
              onChange={(e) => setGroupForm({ ...groupForm, message: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
              Kirim Pesan Group
            </button>
          </form>

          <form onSubmit={handleSendCustomer} className="space-y-3 rounded-xl border border-slate-200 p-4">
            <p className="font-semibold text-slate-900">Kirim ke Customer</p>
            <input
              value={customerForm.recipient}
              onChange={(e) => setCustomerForm({ ...customerForm, recipient: e.target.value })}
              placeholder="Nomor customer"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <textarea
              rows={4}
              value={customerForm.message}
              onChange={(e) => setCustomerForm({ ...customerForm, message: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <button className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
              Kirim Pesan Customer
            </button>
          </form>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Tracking Timeline</h2>
          <div className="mt-4 space-y-3">
            {tracking.length === 0 ? (
              <p className="text-sm text-slate-500">Belum ada tracking.</p>
            ) : (
              tracking.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">{item.title}</p>
                    <span className="text-xs font-semibold text-slate-500">{item.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{item.description || '-'}</p>
                  <p className="mt-2 text-xs text-slate-400">{formatDateTime(item.created_at)}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Log Notifikasi</h2>
          <div className="mt-4 space-y-3">
            {notifications.length === 0 ? (
              <p className="text-sm text-slate-500">Belum ada notifikasi terkirim.</p>
            ) : (
              notifications.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">{item.channel}</p>
                    <span className="text-xs font-semibold text-slate-500">{item.delivery_status}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{item.recipient}</p>
                  <p className="mt-2 text-sm text-slate-500 whitespace-pre-wrap">{item.message}</p>
                  <p className="mt-2 text-xs text-slate-400">{formatDateTime(item.sent_at || item.created_at)}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
