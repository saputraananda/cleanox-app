import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, ImagePlus, RefreshCw, X } from 'lucide-react';
import api from '@shared/utils/api.js';

const STATUS_BADGE = {
  draft: 'border-slate-200 bg-slate-50 text-slate-600',
  scheduled: 'border-violet-200 bg-violet-50 text-violet-700',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  cancelled: 'border-rose-200 bg-rose-50 text-rose-700',
};

const STATUS_LABEL = {
  draft: 'Draft',
  scheduled: 'Terjadwal',
  completed: 'Completed',
  cancelled: 'Dibatalkan',
};

const OTHER_TYPE_LABEL = {
  meeting: 'Meeting',
  training_teknisi: 'Training Teknisi',
  event_pameran_bazaar: 'Event / Pameran / Bazaar',
  survey_site_visit: 'Survey & Site Visit',
  lainnya: 'Lainnya',
};

export default function PosAgendaDetailPage() {
  const { id } = useParams();
  const fileInputRef = useRef(null);
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewMap, setPreviewMap] = useState({});

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/pos-agenda/${id}`);
      setBundle(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat detail agenda');
      setBundle(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const loadPreviews = async () => {
      const next = {};
      for (const photo of bundle?.activity_photos || []) {
        try {
          const rawPath = String(photo.photo_path || '')
            .replace(/^\/api/, '')
            .replace(/^\//, '');
          const blobRes = await api.get(rawPath, { responseType: 'blob' });
          next[String(photo.id)] = URL.createObjectURL(blobRes.data);
        } catch {
          // optional
        }
      }
      if (!cancelled) {
        setPreviewMap((prev) => {
          Object.values(prev).forEach((url) => {
            if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
          });
          return next;
        });
      }
    };
    loadPreviews();
    return () => {
      cancelled = true;
    };
  }, [bundle?.activity_photos]);

  const agenda = bundle?.agenda;
  const kindLabel =
    agenda?.agenda_kind === 'special_collaboration'
      ? 'Special Collaboration'
      : agenda?.other_type === 'lainnya'
        ? agenda.other_type_label || 'Lainnya'
        : OTHER_TYPE_LABEL[agenda?.other_type] || agenda?.other_type || '-';

  const handleSchedule = async () => {
    setError('');
    try {
      const { data } = await api.post(`/pos-agenda/${id}/schedule`);
      setBundle(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menjadwalkan');
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Batalkan agenda ini?')) return;
    setError('');
    try {
      const { data } = await api.post(`/pos-agenda/${id}/cancel`);
      setBundle(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal membatalkan');
    }
  };

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || []).filter((f) => /^image\//.test(f.type));
    event.target.value = '';
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('photos', file));
      const { data } = await api.post(`/pos-agenda/${id}/activity-photos`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setBundle(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal upload foto kegiatan');
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = async (photoId) => {
    setError('');
    try {
      const { data } = await api.delete(`/pos-agenda/${id}/activity-photos/${photoId}`);
      setBundle(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal hapus foto');
    }
  };

  if (loading) {
    return <div className="p-5 text-sm text-slate-500">Memuat detail agenda...</div>;
  }

  if (!agenda) {
    return (
      <div className="p-5 space-y-3">
        <p className="text-sm text-rose-600">{error || 'Agenda tidak ditemukan'}</p>
        <Link to="/cleanox-only/agenda" className="text-sm font-semibold text-violet-700">
          Kembali
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 bg-slate-50 p-3 sm:p-5 min-h-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/cleanox-only/agenda"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali ke Agenda
        </Link>
        <button
          type="button"
          onClick={loadData}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Agenda</p>
            <h1 className="mt-1 text-xl font-extrabold text-slate-900">{agenda.name}</h1>
            <p className="mt-1 text-sm text-slate-600">{agenda.location}</p>
          </div>
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
              STATUS_BADGE[agenda.status] || STATUS_BADGE.draft
            }`}
          >
            {STATUS_LABEL[agenda.status] || agenda.status}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <div>
            <p className="text-xs uppercase text-slate-400">Jenis</p>
            <p className="mt-1 font-semibold text-slate-800">{kindLabel}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-400">Hari</p>
            <p className="mt-1 font-semibold text-slate-800">{agenda.day_label}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-400">Tanggal</p>
            <p className="mt-1 font-semibold text-slate-800">
              {agenda.start_date}
              {agenda.end_date && agenda.end_date !== agenda.start_date
                ? ` – ${agenda.end_date}`
                : ''}
              {agenda.agenda_time ? ` · ${agenda.agenda_time}` : ''}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-400">Isi</p>
            <p className="mt-1 font-semibold text-slate-800">
              {agenda.content_type === 'item_service' ? 'Item Service' : 'Deskripsi'}
            </p>
          </div>
        </div>

        {agenda.content_type === 'description' && (
          <div>
            <p className="text-xs uppercase text-slate-400">Deskripsi</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
              {agenda.description || '-'}
            </p>
          </div>
        )}

        {agenda.notes && (
          <div>
            <p className="text-xs uppercase text-slate-400">Catatan</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{agenda.notes}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {agenda.status === 'draft' && (
            <button
              type="button"
              onClick={handleSchedule}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <CalendarDays className="h-4 w-4" /> Jadwalkan
            </button>
          )}
          {!['completed', 'cancelled'].includes(agenda.status) && (
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700"
            >
              Batalkan
            </button>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-900">Teknisi</p>
        {(bundle.workers || []).length === 0 ? (
          <p className="text-sm text-slate-500">Tidak ada teknisi.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {bundle.workers.map((w) => (
              <div key={w.id} className="rounded-xl border border-slate-200 px-3 py-2.5">
                <p className="text-sm font-semibold text-slate-900">{w.employee_name}</p>
                <p className="text-xs text-slate-500">{w.assignment_status}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {agenda.content_type === 'item_service' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-900">Item Service & Evidence</p>
          {(bundle.items || []).map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {item.service_name_snapshot}
                  </p>
                  <p className="text-xs text-slate-500">
                    Qty {item.qty}
                    {item.meter != null ? ` · Meter ${item.meter}` : ''}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    item.evidence?.is_complete
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700'
                  }`}
                >
                  Before {item.evidence?.before_count || 0} · After {item.evidence?.after_count || 0}
                </span>
              </div>
            </div>
          ))}
        </section>
      )}

      {agenda.content_type === 'description' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">Foto Kegiatan</p>
              <p className="text-xs text-slate-500">
                Upload admin · Completed otomatis jika ada foto & lewat H+1 setelah tanggal selesai
              </p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleUpload}
              />
              <button
                type="button"
                disabled={uploading || agenda.status === 'cancelled'}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50"
              >
                <ImagePlus className="h-4 w-4" />
                {uploading ? 'Mengunggah...' : 'Tambah foto'}
              </button>
            </div>
          </div>
          {(bundle.activity_photos || []).length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada foto kegiatan.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {bundle.activity_photos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                >
                  <button
                    type="button"
                    onClick={() => handleDeletePhoto(photo.id)}
                    className="absolute right-1.5 top-1.5 z-[1] inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  {previewMap[String(photo.id)] ? (
                    <img
                      src={previewMap[String(photo.id)]}
                      alt="Foto kegiatan"
                      className="h-28 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-28 items-center justify-center text-xs text-slate-400">
                      Memuat...
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
