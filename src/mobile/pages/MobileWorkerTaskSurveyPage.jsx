import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardCheck } from 'lucide-react';
import api from '@shared/utils/api.js';
import MobileConfirmDialog from '@mobile/components/MobileConfirmDialog.jsx';
import {
  CSAT_OPTIONS,
  SURVEY_FEEDBACK_TAGS,
  SURVEY_FEEDBACK_TEXT_MAX,
  SURVEY_LAYANAN_OPTIONS,
  normalizeLayananList,
  normalizeTagsList,
  npsCategoryFromScore,
} from '@mobile/utils/satisfactionSurveyFields.js';

const emptyForm = {
  layanan: [],
  csat_score: '',
  nps_score: null,
  tags: [],
  feedback_text: '',
};

const NPS_CATEGORY_UI = {
  Detractor: { text: 'Detractor', tone: 'text-rose-700 bg-rose-50 border-rose-200' },
  Passive: { text: 'Passive', tone: 'text-amber-700 bg-amber-50 border-amber-200' },
  Promoter: { text: 'Promoter', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
};

function toggleInList(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export default function MobileWorkerTaskSurveyPage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [task, setTask] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [blockMessage, setBlockMessage] = useState('');
  const [alertOpen, setAlertOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      setBlockMessage('');
      try {
        const { data } = await api.get(`/mobile-tasks/${assignmentId}`);
        const nextTask = data.task || null;
        const items = data.items || [];
        setTask(nextTask);

        if (!nextTask) {
          setBlockMessage('Task tidak ditemukan.');
          return;
        }
        if (nextTask.assignment_status !== 'On_Progress') {
          setBlockMessage('Survey hanya bisa diisi untuk task On Progress.');
          return;
        }
        if (String(nextTask.service_mode || nextTask.transaction?.service_mode) === 'take_home') {
          if (!nextTask.evidence?.has_takehome_complete) {
            setBlockMessage('Lengkapi semua stage take-home terlebih dahulu sebelum mengisi survey.');
            return;
          }
        } else if (!nextTask.evidence?.has_after) {
          setBlockMessage('Lengkapi foto after terlebih dahulu sebelum mengisi survey.');
          return;
        }

        const answers = nextTask.evidence?.survey_answers || null;
        const savedLayanan = normalizeLayananList(answers?.layanan);
        const itemLayanan = normalizeLayananList((items || []).map((item) => item.service_name));
        const csatRaw = answers?.csat_score ?? answers?.overall ?? nextTask.evidence?.survey_rating;
        const csatScore = Number(csatRaw);
        const npsRaw = answers?.nps_score;
        const npsScore = Number(npsRaw);

        setForm({
          layanan: savedLayanan.length > 0 ? savedLayanan : itemLayanan,
          csat_score: Number.isInteger(csatScore) && csatScore >= 1 && csatScore <= 5 ? csatScore : '',
          nps_score: Number.isInteger(npsScore) && npsScore >= 0 && npsScore <= 10 ? npsScore : null,
          tags: normalizeTagsList(answers?.feedback_tags ?? answers?.tags),
          feedback_text: answers?.feedback_text ?? answers?.note ?? nextTask.evidence?.survey_note ?? '',
        });
      } catch (err) {
        setError(err.response?.data?.message || 'Gagal memuat data survey');
        setBlockMessage('Gagal memuat data survey.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [assignmentId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || blockMessage) return;

    const layanan = normalizeLayananList(form.layanan);
    const csatScore = Number(form.csat_score);
    const npsScore = Number(form.nps_score);
    const tags = normalizeTagsList(form.tags);
    const feedbackText = String(form.feedback_text || '').trim();

    if (layanan.length < 1) {
      setError('Pilih minimal satu layanan.');
      setAlertOpen(true);
      return;
    }
    if (!Number.isInteger(csatScore) || csatScore < 1 || csatScore > 5) {
      setError('Skor CSAT wajib dipilih (1–5).');
      setAlertOpen(true);
      return;
    }
    if (!Number.isInteger(npsScore) || npsScore < 0 || npsScore > 10) {
      setError('Skor NPS wajib dipilih (0–10).');
      setAlertOpen(true);
      return;
    }
    if (feedbackText.length > SURVEY_FEEDBACK_TEXT_MAX) {
      setError(`Kritik dan saran maksimal ${SURVEY_FEEDBACK_TEXT_MAX} karakter.`);
      setAlertOpen(true);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await api.post(`/mobile-tasks/${assignmentId}/survey`, {
        layanan,
        csat_score: csatScore,
        nps_score: npsScore,
        tags,
        feedback_text: feedbackText,
      });
      navigate('/mobile-worker/tasks', { replace: true, state: { tab: 'On_Progress', surveySaved: true } });
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan survey kepuasan');
      setAlertOpen(true);
    } finally {
      setSubmitting(false);
    }
  };

  const customerName = task?.transaction?.customer_name || 'Pelanggan';
  const transactionNo = task?.transaction?.transaction_no || '—';
  const npsCategory = form.nps_score == null ? null : npsCategoryFromScore(form.nps_score);
  const npsUi = npsCategory ? NPS_CATEGORY_UI[npsCategory] : null;

  return (
    <div className="mobile-worker-font min-h-[100dvh] bg-slate-100 flex justify-center">
      <div className="w-full max-w-[430px] min-h-[100dvh] bg-slate-50 flex flex-col shadow-[0_0_0_1px_rgba(0,0,0,.04),0_8px_48px_rgba(0,0,0,.08)] relative overflow-hidden">
        <div
          className="relative overflow-hidden rounded-b-[28px] flex-shrink-0 pb-[18px]"
          style={{ background: 'linear-gradient(180deg, #163A22 0%, #20492C 58%, #295733 100%)' }}
        >
          <div className="relative z-[1] flex items-center justify-between px-[18px] pt-[14px]">
            <div className="flex items-center gap-2.5 min-w-0">
              <Link
                to="/mobile-worker/tasks"
                className="w-9 h-9 rounded-[11px] bg-white/10 border border-white/12 text-white grid place-items-center flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="min-w-0">
                <div className="text-[14px] font-extrabold text-white truncate">Survey Kepuasan</div>
                <div className="text-[10.5px] text-white/50 font-medium truncate mt-px">
                  {customerName} · {transactionNo}
                </div>
              </div>
            </div>
            <div className="w-9 h-9 rounded-[11px] bg-white/10 border border-white/12 text-white grid place-items-center">
              <ClipboardCheck className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-[14px] pt-3 pb-[calc(28px+env(safe-area-inset-bottom))] flex flex-col gap-2.5">
          {loading ? (
            <p className="text-sm text-slate-500 px-1 py-6 text-center">Memuat survey...</p>
          ) : blockMessage ? (
            <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-5 space-y-3">
              <p className="text-[13px] font-extrabold text-amber-900">Survey belum bisa diisi</p>
              <p className="text-[12px] text-amber-800 leading-relaxed">{blockMessage}</p>
              <Link
                to="/mobile-worker/tasks"
                className="inline-flex h-[40px] items-center justify-center rounded-[12px] bg-[#163A22] px-4 text-[12px] font-extrabold text-white"
              >
                Kembali ke Task
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2.5">
              <section className="rounded-[18px] border border-slate-200 bg-white p-4">
                <p className="text-[13px] font-extrabold text-slate-900">Form Feedback Pelanggan</p>
                <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
                  Isi survey ini berdasarkan feedback pelanggan di lokasi. Layanan, CSAT, dan NPS wajib diisi.
                </p>
              </section>

              <section className="rounded-[18px] border border-slate-200 bg-white p-4 space-y-3">
                <div>
                  <p className="text-[12.5px] font-extrabold text-slate-900">Layanan apa yang digunakan?</p>
                  <p className="mt-0.5 text-[10.5px] text-slate-500">Pilih satu atau lebih layanan.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {SURVEY_LAYANAN_OPTIONS.map((label) => {
                    const selected = form.layanan.includes(label);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({ ...prev, layanan: toggleInList(prev.layanan, label) }))
                        }
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
                          selected
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[18px] border border-slate-200 bg-white p-4 space-y-3">
                <div>
                  <p className="text-[12.5px] font-extrabold text-slate-900">Seberapa puas dengan layanan kami?</p>
                  <p className="mt-0.5 text-[10.5px] text-slate-500">CSAT · pilih skor 1–5</p>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {CSAT_OPTIONS.map((option) => {
                    const selected = Number(form.csat_score) === option.score;
                    return (
                      <button
                        key={option.score}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, csat_score: option.score }))}
                        className={`min-h-[58px] rounded-[10px] border px-1 py-1.5 text-center transition ${
                          selected
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="text-[13px] font-extrabold leading-none">{option.score}</div>
                        <div className="mt-1 text-[8.5px] font-semibold leading-tight">{option.label}</div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[18px] border border-slate-200 bg-white p-4 space-y-3">
                <div>
                  <p className="text-[12.5px] font-extrabold text-slate-900">
                    Apakah akan merekomendasikan kami ke teman dan keluarga?
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-slate-500">NPS · 0 = Tidak mungkin · 10 = Pasti rekomendasikan</p>
                </div>
                {npsUi ? (
                  <div className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-extrabold ${npsUi.tone}`}>
                    {npsUi.text} — Skor {form.nps_score}
                  </div>
                ) : null}
                <div className="grid grid-cols-11 gap-1">
                  {Array.from({ length: 11 }, (_, score) => {
                    const selected = form.nps_score === score;
                    return (
                      <button
                        key={score}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, nps_score: score }))}
                        className={`aspect-square rounded-[8px] border text-[11px] font-extrabold transition ${
                          selected
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        {score}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[18px] border border-slate-200 bg-white p-4 space-y-3">
                <div>
                  <p className="text-[12.5px] font-extrabold text-slate-900">Ada yang ingin disampaikan?</p>
                  <p className="mt-0.5 text-[10.5px] text-slate-500">Pilih area masukan (opsional)</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {SURVEY_FEEDBACK_TAGS.map((label) => {
                    const selected = form.tags.includes(label);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, tags: toggleInList(prev.tags, label) }))}
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
                          selected
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <label className="block">
                  <span className="text-[12px] font-extrabold text-slate-900">Kritik dan Saran</span>
                  <span className="mt-0.5 block text-[10.5px] text-slate-500">Opsional</span>
                  <textarea
                    rows={4}
                    maxLength={SURVEY_FEEDBACK_TEXT_MAX}
                    value={form.feedback_text}
                    onChange={(e) => setForm((prev) => ({ ...prev, feedback_text: e.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12.5px] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7BC32C]"
                    placeholder="Tuliskan kritik atau saran pelanggan di sini..."
                  />
                  <span className="mt-1 block text-right text-[10px] text-slate-400">
                    {String(form.feedback_text || '').length} / {SURVEY_FEEDBACK_TEXT_MAX}
                  </span>
                </label>
              </section>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-[44px] rounded-[12px] bg-[#163A22] text-white text-[13px] font-extrabold disabled:opacity-60"
              >
                {submitting ? 'Menyimpan Survey...' : task?.evidence?.has_survey ? 'Update Survey' : 'Simpan Survey'}
              </button>
            </form>
          )}
        </div>
      </div>

      <MobileConfirmDialog
        open={alertOpen}
        variant="danger"
        title="Survey Belum Lengkap"
        description={error || 'Lengkapi semua pertanyaan wajib sebelum menyimpan.'}
        confirmLabel="Mengerti"
        cancelLabel="Tutup"
        onConfirm={() => setAlertOpen(false)}
        onCancel={() => setAlertOpen(false)}
        onClose={() => setAlertOpen(false)}
      />
    </div>
  );
}
