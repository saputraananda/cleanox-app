import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api.js';

export default function PosTransactionCreatePage() {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    customer_address: '',
    service_date: '',
    total_people: 1,
    notes: '',
    group_message_template: '',
    customer_message_template: '',
    items: [{ service_id: '', qty: 1, promo_id: '' }],
    worker_ids: [],
  });

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [serviceRes, workerRes] = await Promise.all([
          api.get('/pos-transactions/services'),
          api.get('/pos-transactions/workers'),
        ]);
        setServices(serviceRes.data.services || []);
        setWorkers(workerRes.data.workers || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Gagal memuat master POS');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const selectedTotals = useMemo(() => {
    return form.items.reduce(
      (acc, item) => {
        const service = services.find((row) => Number(row.id) === Number(item.service_id));
        if (!service) return acc;

        const qty = Math.max(1, Number(item.qty || 1));
        const promo = service.promos?.find((row) => Number(row.id) === Number(item.promo_id));
        const base = Number(service.price || 0);
        const discountPerUnit = promo
          ? promo.promo_type === 'persen'
            ? (base * Number(promo.promo_value || 0)) / 100
            : Number(promo.promo_value || 0)
          : 0;
        const safeDiscountPerUnit = Math.min(base, discountPerUnit);
        acc.subtotal += base * qty;
        acc.discount += safeDiscountPerUnit * qty;
        return acc;
      },
      { subtotal: 0, discount: 0 }
    );
  }, [form.items, services]);

  const handleItemChange = (index, key, value) => {
    const nextItems = [...form.items];
    nextItems[index] = { ...nextItems[index], [key]: value };
    if (key === 'service_id') {
      nextItems[index].promo_id = '';
    }
    setForm((prev) => ({ ...prev, items: nextItems }));
  };

  const addItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { service_id: '', qty: 1, promo_id: '' }],
    }));
  };

  const removeItem = (index) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const toggleWorker = (employeeId) => {
    const workerId = Number(employeeId);
    setForm((prev) => ({
      ...prev,
      worker_ids: prev.worker_ids.includes(workerId)
        ? prev.worker_ids.filter((id) => id !== workerId)
        : [...prev.worker_ids, workerId],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        total_people: Number(form.total_people || 1),
        items: form.items.map((item) => ({
          service_id: Number(item.service_id),
          qty: Number(item.qty || 1),
          promo_id: item.promo_id ? Number(item.promo_id) : null,
        })),
      };
      const { data } = await api.post('/pos-transactions', payload);
      navigate(`/pos-transactions/${data.transaction_id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal membuat transaksi POS');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="max-w-6xl mx-auto p-6 text-sm text-slate-500">Memuat form transaksi POS...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-500">POS Admin</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Buat Transaksi POS Baru</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Informasi Customer</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5 text-sm text-slate-600">
                <span>Nama Customer</span>
                <input
                  required
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </label>
              <label className="space-y-1.5 text-sm text-slate-600">
                <span>No. WhatsApp</span>
                <input
                  value={form.customer_phone}
                  onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </label>
              <label className="space-y-1.5 text-sm text-slate-600 md:col-span-2">
                <span>Alamat</span>
                <textarea
                  rows={3}
                  value={form.customer_address}
                  onChange={(e) => setForm({ ...form, customer_address: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </label>
              <label className="space-y-1.5 text-sm text-slate-600">
                <span>Tanggal Layanan</span>
                <input
                  type="datetime-local"
                  required
                  value={form.service_date}
                  onChange={(e) => setForm({ ...form, service_date: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </label>
              <label className="space-y-1.5 text-sm text-slate-600">
                <span>Jumlah Orang</span>
                <input
                  type="number"
                  min="1"
                  value={form.total_people}
                  onChange={(e) => setForm({ ...form, total_people: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Assignment Worker</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {workers.map((worker) => {
                const checked = form.worker_ids.includes(Number(worker.employee_id));
                return (
                  <label
                    key={worker.employee_id}
                    className={`rounded-xl border p-3 text-sm cursor-pointer ${
                      checked ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={checked}
                      onChange={() => toggleWorker(worker.employee_id)}
                    />
                    <div className="font-semibold text-slate-800">{worker.full_name}</div>
                    <div className="text-xs text-slate-500">{worker.phone_number || 'Tanpa nomor WA'}</div>
                  </label>
                );
              })}
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Item Service</h2>
            <button
              type="button"
              onClick={addItem}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Tambah Item
            </button>
          </div>

          <div className="space-y-4">
            {form.items.map((item, index) => {
              const service = services.find((row) => Number(row.id) === Number(item.service_id));
              return (
                <div key={index} className="grid gap-4 rounded-2xl border border-slate-200 p-4 lg:grid-cols-[2fr_1fr_2fr_auto]">
                  <label className="space-y-1.5 text-sm text-slate-600">
                    <span>Service</span>
                    <select
                      required
                      value={item.service_id}
                      onChange={(e) => handleItemChange(index, 'service_id', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <option value="">Pilih service</option>
                      {services.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name} - Rp {Number(row.price || 0).toLocaleString('id-ID')}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5 text-sm text-slate-600">
                    <span>Qty</span>
                    <input
                      type="number"
                      min="1"
                      value={item.qty}
                      onChange={(e) => handleItemChange(index, 'qty', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </label>

                  <label className="space-y-1.5 text-sm text-slate-600">
                    <span>Promo</span>
                    <select
                      value={item.promo_id}
                      onChange={(e) => handleItemChange(index, 'promo_id', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <option value="">Tanpa promo</option>
                      {(service?.promos || []).map((promo) => (
                        <option key={promo.id} value={promo.id}>
                          {promo.name} - {promo.promo_type === 'persen' ? `${promo.promo_value}%` : `Rp ${promo.promo_value.toLocaleString('id-ID')}`}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      disabled={form.items.length === 1}
                      className="rounded-xl border border-rose-200 px-3 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Template Pesan & Catatan</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-1.5 text-sm text-slate-600">
              <span>Template Pesan Group</span>
              <textarea
                rows={5}
                value={form.group_message_template}
                onChange={(e) => setForm({ ...form, group_message_template: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
            <label className="space-y-1.5 text-sm text-slate-600">
              <span>Template Pesan Customer</span>
              <textarea
                rows={5}
                value={form.customer_message_template}
                onChange={(e) => setForm({ ...form, customer_message_template: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
            <label className="space-y-1.5 text-sm text-slate-600 lg:col-span-2">
              <span>Catatan Admin</span>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <p className="text-sm text-slate-300">Subtotal</p>
              <p className="text-xl font-bold">Rp {selectedTotals.subtotal.toLocaleString('id-ID')}</p>
              <p className="mt-2 text-sm text-slate-300">Diskon: Rp {selectedTotals.discount.toLocaleString('id-ID')}</p>
              <p className="mt-1 text-sm text-slate-300">
                Estimasi total akhir: Rp {(selectedTotals.subtotal - selectedTotals.discount).toLocaleString('id-ID')}
              </p>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-60"
            >
              {saving ? 'Menyimpan...' : 'Simpan Transaksi POS'}
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
