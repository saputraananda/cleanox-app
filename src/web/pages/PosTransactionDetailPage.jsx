import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, FileSpreadsheet, FileText, ArrowLeft, Save, Copy, Send, ImagePlus, X, Plus, Minus, Pencil, Trash2 } from 'lucide-react';
import api from '@shared/utils/api.js';
import BodyPortal from '@web/components/BodyPortal.jsx';
import { buildCustomerOrderMessage } from '@web/utils/posCustomerOrderMessage.js';
import { buildGroupOrderMessage } from '@web/utils/posGroupOrderMessage.js';
import {
  isGeneralCleaningCategory,
  transactionHasGeneralCleaning,
} from '@web/utils/posGeneralCleaningBilling.js';
import {
  isMeterPricedService,
  isMeterPricingPending,
  resolveMeterFromDimensions,
  transactionHasMeterPending,
} from '@web/utils/posMeterServices.js';
import { downloadPosEReceiptPdf, loadImageAsDataUrl } from '@web/utils/posEReceipt.js';
import { downloadPosInternalInvoicePdf } from '@web/utils/posInternalInvoicePdf.js';
import { downloadPosOrderFormPdf } from '@web/utils/posOrderFormPdf.js';
import PosTakehomeStageTimeline from '@web/components/PosTakehomeStageTimeline.jsx';
import cleanoxLogo from '../../assets/cleanox.png';

const emptyAddItemDraft = () => ({
  service_id: '',
  qty: 1,
  meter_length: '',
  meter_width: '',
});

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
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const toDateKeyJakarta = (value) => {
  if (!value) return null;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

const todayKeyJakarta = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const addDaysKey = (dateKey, days) => {
  if (!dateKey) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
};

const toDatetimeLocalValue = (value) => {
  const raw = String(value || '');
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (match) return `${match[1]}T${match[2]}:${match[3]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const key = toDateKeyJakarta(date);
  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = timeParts.find((p) => p.type === 'hour')?.value || '08';
  const minute = timeParts.find((p) => p.type === 'minute')?.value || '00';
  return key ? `${key}T${hour}:${minute}` : '';
};

const evidencePreviewKey = (assignmentId, kind, photo, index) =>
  `${assignmentId}-${kind}-${photo?.id ?? photo?.photo_file ?? index}`;

const sanitizeFilePart = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 80);

const buildEvidenceDownloadName = ({ transactionNo, employeeName, kind, index, photo }) => {
  const trx = sanitizeFilePart(transactionNo);
  const emp = sanitizeFilePart(employeeName);
  const kindPart = kind === 'after' ? 'after' : 'before';
  if (trx || emp) {
    return `${trx || 'trx'}_${emp || 'pekerja'}_${kindPart}_${Number(index) + 1}.jpg`;
  }
  const basename = String(photo?.photo_file || '')
    .split(/[/\\]/)
    .pop();
  if (basename) return basename;
  return `evidence-${kindPart}-${Number(index) + 1}.jpg`;
};

export default function PosTransactionDetailPage() {
  const { id } = useParams();
  const [detail, setDetail] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [groupForm, setGroupForm] = useState({ recipient: '' });
  const [assignmentIds, setAssignmentIds] = useState([]);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [orderFormLoading, setOrderFormLoading] = useState(false);
  const [evidencePreviewMap, setEvidencePreviewMap] = useState({});
  const evidencePreviewMapRef = useRef({});
  const [customerPreviewMap, setCustomerPreviewMap] = useState({});
  const customerPreviewMapRef = useRef({});
  const [takehomePreviewMap, setTakehomePreviewMap] = useState({});
  const takehomePreviewMapRef = useRef({});
  const customerFileInputRef = useRef(null);
  const paymentProofFileInputRef = useRef(null);
  const [customerPhotoUploading, setCustomerPhotoUploading] = useState(false);
  const [paymentProofUploading, setPaymentProofUploading] = useState(false);
  const [paymentPreviewMap, setPaymentPreviewMap] = useState({});
  const paymentPreviewMapRef = useRef({});
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentForm, setPaymentForm] = useState({
    payment_method_id: '',
    payment_status: 'belum_lunas',
    payment_group: '',
  });
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [meterDrafts, setMeterDrafts] = useState({});
  const [meterSavingId, setMeterSavingId] = useState(null);
  const [services, setServices] = useState([]);
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [itemModalMode, setItemModalMode] = useState('add');
  const [editingItemId, setEditingItemId] = useState(null);
  const [addItemDraft, setAddItemDraft] = useState(emptyAddItemDraft());
  const [addItemSaving, setAddItemSaving] = useState(false);
  const [addItemError, setAddItemError] = useState('');
  const [deletingItemId, setDeletingItemId] = useState(null);
  const [serviceSearch, setServiceSearch] = useState('');
  const [scheduleDateInput, setScheduleDateInput] = useState('');
  const [cancelNote, setCancelNote] = useState('');
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [scheduleSuccess, setScheduleSuccess] = useState('');
  const [scheduleConfirm, setScheduleConfirm] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  const openPhotoPreview = (src, title) => {
    if (!src) return;
    setPhotoPreview({ src, title });
  };

  const closePhotoPreview = () => setPhotoPreview(null);

  const refreshBlobPreviews = async (entries, setMap) => {
    const next = {};
    await Promise.all(
      [...entries.entries()].map(async ([key, photoPath]) => {
        try {
          const rawPath = String(photoPath || '')
            .replace(/^\/api/, '')
            .replace(/^\//, '');
          const blobRes = await api.get(rawPath, { responseType: 'blob' });
          next[key] = URL.createObjectURL(blobRes.data);
        } catch {
          // preview optional
        }
      })
    );

    setMap((prev) => {
      Object.values(prev).forEach((url) => {
        if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
      return next;
    });
  };

  const refreshEvidencePreviews = async (assignmentList = []) => {
    const needed = new Map();
    for (const assignment of assignmentList) {
      const assignmentId = assignment.id;
      (assignment.before_photos || []).forEach((photo, index) => {
        if (!photo?.photo_path) return;
        needed.set(evidencePreviewKey(assignmentId, 'before', photo, index), photo.photo_path);
      });
      (assignment.after_photos || []).forEach((photo, index) => {
        if (!photo?.photo_path) return;
        needed.set(evidencePreviewKey(assignmentId, 'after', photo, index), photo.photo_path);
      });
    }
    await refreshBlobPreviews(needed, setEvidencePreviewMap);
  };

  const refreshCustomerPreviews = async (photos = []) => {
    const needed = new Map();
    for (const photo of photos) {
      if (!photo?.id || !photo?.photo_path) continue;
      needed.set(String(photo.id), photo.photo_path);
    }
    await refreshBlobPreviews(needed, setCustomerPreviewMap);
  };

  const refreshPaymentPreviews = async (photos = []) => {
    const needed = new Map();
    for (const photo of photos) {
      if (!photo?.id || !photo?.photo_path) continue;
      needed.set(String(photo.id), photo.photo_path);
    }
    await refreshBlobPreviews(needed, setPaymentPreviewMap);
  };

  const refreshTakehomePreviews = async (progress) => {
    const needed = new Map();
    for (const stage of progress?.stages || []) {
      if (!stage?.photo_path) continue;
      needed.set(stage.photo_path, stage.photo_path);
    }
    await refreshBlobPreviews(needed, setTakehomePreviewMap);
  };

  const downloadEvidencePhoto = async ({ blobUrl, photoPath, fileName }) => {
    let url = blobUrl || null;
    let shouldRevoke = false;
    try {
      if (!url && photoPath) {
        const rawPath = String(photoPath || '')
          .replace(/^\/api/, '')
          .replace(/^\//, '');
        const blobRes = await api.get(rawPath, { responseType: 'blob' });
        url = URL.createObjectURL(blobRes.data);
        shouldRevoke = true;
      }
      if (!url) {
        setError('Gagal mengunduh foto evidence');
        return;
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'evidence.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      setError('Gagal mengunduh foto evidence');
    } finally {
      if (shouldRevoke && url) URL.revokeObjectURL(url);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [detailRes, paymentRes, serviceRes] = await Promise.all([
        api.get(`/pos-transactions/${id}`),
        api.get('/pos-master/payment-methods', { params: { is_active: 1 } }),
        api.get('/pos-transactions/services'),
      ]);
      const nextDetail = detailRes.data;
      const methods = paymentRes.data.data || [];
      setPaymentMethods(methods);
      setServices(serviceRes.data.services || []);
      const serviceDate = nextDetail.transaction?.service_date;
      const workerRes = await api.get('/pos-transactions/workers', {
        params: serviceDate
          ? { service_date: serviceDate, exclude_transaction_id: id }
          : {},
      });
      setDetail(nextDetail);
      setWorkers(workerRes.data.workers || []);
      setAssignmentIds(
        (nextDetail.assignments || [])
          .filter((row) => ['Assigned', 'In_Schedule', 'On_Progress'].includes(row.assignment_status))
          .map((row) => Number(row.employee_id))
      );
      setGroupForm({ recipient: '' });
      setScheduleDateInput(toDatetimeLocalValue(nextDetail.transaction?.service_date));
      setCancelNote('');
      setScheduleSuccess('');
      const tx = nextDetail.transaction || {};
      setPaymentForm({
        payment_method_id: tx.payment_method_id ? String(tx.payment_method_id) : '',
        payment_status: tx.payment_status || 'belum_lunas',
        payment_group: tx.payment_method?.method_group || '',
      });
      await Promise.all([
        refreshEvidencePreviews(nextDetail.assignments || []),
        refreshCustomerPreviews(nextDetail.customer_photos || []),
        refreshPaymentPreviews(nextDetail.payment_proofs || []),
        refreshTakehomePreviews(nextDetail.takehome_progress),
      ]);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat detail transaksi POS');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    evidencePreviewMapRef.current = evidencePreviewMap;
  }, [evidencePreviewMap]);

  useEffect(() => {
    customerPreviewMapRef.current = customerPreviewMap;
  }, [customerPreviewMap]);

  useEffect(() => {
    paymentPreviewMapRef.current = paymentPreviewMap;
  }, [paymentPreviewMap]);

  useEffect(() => {
    takehomePreviewMapRef.current = takehomePreviewMap;
  }, [takehomePreviewMap]);

  useEffect(() => {
    if (!photoPreview) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closePhotoPreview();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [photoPreview]);

  useEffect(() => {
    return () => {
      Object.values(evidencePreviewMapRef.current).forEach((url) => {
        if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
      Object.values(customerPreviewMapRef.current).forEach((url) => {
        if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
      Object.values(paymentPreviewMapRef.current).forEach((url) => {
        if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
      Object.values(takehomePreviewMapRef.current).forEach((url) => {
        if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
    };
  }, []);

  const itemSummary = useMemo(() => {
    if (!detail) return '';
    return detail.items.map((item) => `${item.service_name} x${item.qty}`).join(', ');
  }, [detail]);

  const customerMessagePreview = useMemo(() => {
    if (!detail?.transaction) return '';
    const { transaction, items } = detail;
    if (!items?.length) {
      return (
        transaction.customer_message_template ||
        `Halo ${transaction.customer_name}, transaksi ${transaction.transaction_no} sedang kami proses.`
      );
    }

    return buildCustomerOrderMessage({
      customerName: transaction.customer_name,
      customerPhone: transaction.customer_phone,
      customerAddress: transaction.customer_address,
      serviceDate: transaction.service_date,
      items: items.map((item) => ({
        service_name: item.service_name,
        qty: item.qty,
        base_price: item.base_price_snapshot,
        original_price: item.original_price_snapshot,
        final_price_per_unit: item.final_price_snapshot,
        line_total: item.line_total,
        promo_type: item.promo_type_snapshot,
        promo_value: item.promo_value_snapshot,
        category_name: item.category_name || null,
      })),
      totalPeople: transaction.total_people,
      finalAmount: transaction.final_amount,
      pricingFinalized: Boolean(transaction.pricing_finalized_at),
    });
  }, [detail]);

  const groupMessagePreview = useMemo(() => {
    if (!detail?.transaction) return '';
    const { transaction, items, assignments } = detail;
    if (!items?.length) {
      return (
        transaction.group_message_template ||
        `Transaksi ${transaction.transaction_no} untuk ${transaction.customer_name} sudah dijadwalkan.`
      );
    }

    const assignmentWorkers = (assignments || []).map((row) => {
      const workerFromMaster = workers.find(
        (worker) => Number(worker.employee_id) === Number(row.employee_id)
      );
      return {
        full_name: row.employee_name,
        phone_number: row.employee_phone || workerFromMaster?.phone_number || null,
      };
    });

    return buildGroupOrderMessage({
      customerName: transaction.customer_name,
      customerPhone: transaction.customer_phone,
      customerAddress: transaction.customer_address,
      serviceDate: transaction.service_date,
      items: items.map((item) => ({
        service_name: item.service_name,
        qty: item.qty,
        base_price: item.base_price_snapshot,
        original_price: item.original_price_snapshot,
        final_price_per_unit: item.final_price_snapshot,
        line_total: item.line_total,
        promo_type: item.promo_type_snapshot,
        promo_value: item.promo_value_snapshot,
        category_name: item.category_name || null,
      })),
      totalPeople: transaction.total_people,
      notes: transaction.notes,
      finalAmount: transaction.final_amount,
      pricingFinalized: Boolean(transaction.pricing_finalized_at),
      workers: assignmentWorkers,
    });
  }, [detail, workers]);

  const handleCopyCustomerMessage = async () => {
    try {
      await navigator.clipboard.writeText(customerMessagePreview);
    } catch {
      setError('Gagal menyalin pesan customer');
    }
  };

  const handleCopyGroupMessage = async () => {
    try {
      await navigator.clipboard.writeText(groupMessagePreview);
    } catch {
      setError('Gagal menyalin pesan group');
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

  const handleDownloadEReceipt = async () => {
    if (!detail?.transaction) return;
    setReceiptLoading(true);
    setError('');
    try {
      let logoDataUrl = null;
      try {
        logoDataUrl = await loadImageAsDataUrl(cleanoxLogo);
      } catch {
        logoDataUrl = null;
      }
      await downloadPosEReceiptPdf({
        transaction: detail.transaction,
        items: detail.items || [],
        logoDataUrl,
      });
    } catch (err) {
      setError(err.message || 'Gagal membuat e-receipt PDF');
    } finally {
      setReceiptLoading(false);
    }
  };

  const handleDownloadInternalInvoice = async () => {
    if (!detail?.transaction) return;
    setInvoiceLoading(true);
    setError('');
    try {
      let logoDataUrl = null;
      try {
        logoDataUrl = await loadImageAsDataUrl(cleanoxLogo);
      } catch {
        logoDataUrl = null;
      }
      await downloadPosInternalInvoicePdf({
        transaction: detail.transaction,
        items: detail.items || [],
        assignments: detail.assignments || [],
        logoDataUrl,
      });
    } catch (err) {
      setError(err.message || 'Gagal membuat invoice internal PDF');
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleDownloadOrderForm = async () => {
    if (!detail?.transaction) return;
    setOrderFormLoading(true);
    setError('');
    try {
      let logoDataUrl = null;
      try {
        logoDataUrl = await loadImageAsDataUrl(cleanoxLogo);
      } catch {
        logoDataUrl = null;
      }
      await downloadPosOrderFormPdf({
        transaction: detail.transaction,
        items: detail.items || [],
        logoDataUrl,
      });
    } catch (err) {
      setError(err.message || 'Gagal membuat Cleanox Order Form PDF');
    } finally {
      setOrderFormLoading(false);
    }
  };

  const handleSendGroup = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/pos-transactions/${id}/notify-group`, {
        recipient: groupForm.recipient,
        message: groupMessagePreview,
      });
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengirim pesan group');
    }
  };

  if (loading) {
    return <div className="max-w-7xl mx-auto p-6 text-sm text-slate-500">Memuat detail transaksi POS...</div>;
  }

  if (!detail) {
    return <div className="max-w-7xl mx-auto p-6 text-sm text-rose-600">Detail transaksi tidak ditemukan.</div>;
  }

  const { transaction, items, assignments, tracking, customer_photos: customerPhotos = [], payment_proofs: paymentProofs = [], takehome_progress: takehomeProgress } = detail;
  const isTakeHome = String(transaction.service_mode || 'home_service') === 'take_home';
  const isHistoryEntry = Boolean(transaction.is_history_entry);
  const canMutateItems =
    !isHistoryEntry &&
    transaction.status !== 'Cancelled' &&
    transaction.status !== 'Completed';
  const historyStartedAt = (assignments || [])
    .map((row) => row.started_at)
    .filter(Boolean)
    .sort((a, b) => new Date(a) - new Date(b))[0] || null;
  const historyEndedAt = (assignments || [])
    .map((row) => row.completed_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0] || null;
  const serviceDateKey = toDateKeyJakarta(transaction.service_date);
  const tomorrowKey = addDaysKey(todayKeyJakarta(), 1);
  const hasProgressOrDone = (assignments || []).some((row) =>
    ['On_Progress', 'Done'].includes(row.assignment_status)
  );
  const isTerminalStatus = ['Completed', 'Cancelled'].includes(transaction.status);
  const hasGc = transactionHasGeneralCleaning(items);
  const hasMeterPending = transactionHasMeterPending(items);
  const canReschedule =
    !isHistoryEntry &&
    !isTerminalStatus &&
    Boolean(serviceDateKey) &&
    serviceDateKey >= tomorrowKey &&
    !hasProgressOrDone;
  const canCancel = !isHistoryEntry && !isTerminalStatus;
  const canUploadCustomerPhotos =
    transaction.status !== 'Cancelled' && customerPhotos.length < 10;
  const canEditPayment = transaction.status !== 'Cancelled';
  const canUploadPaymentProofs =
    canEditPayment && paymentProofs.length < 10;
  const edcPaymentMethods = paymentMethods.filter((m) => m.method_group === 'EDC');
  const selectedPaymentMethod =
    paymentMethods.find((m) => Number(m.id) === Number(paymentForm.payment_method_id)) ||
    transaction.payment_method ||
    null;

  const handlePaymentGroupChange = (group) => {
    setPaymentForm((prev) => {
      if (group === 'EDC') {
        const stillEdc = edcPaymentMethods.some(
          (m) => Number(m.id) === Number(prev.payment_method_id)
        );
        return {
          ...prev,
          payment_group: group,
          payment_method_id: stillEdc ? prev.payment_method_id : '',
        };
      }
      const method = paymentMethods.find((m) => m.method_group === group);
      return {
        ...prev,
        payment_group: group,
        payment_method_id: method ? String(method.id) : '',
      };
    });
  };

  const handleSavePayment = async () => {
    if (!canEditPayment || paymentSaving) return;
    if (!paymentForm.payment_method_id) {
      setError('Metode pembayaran wajib dipilih');
      return;
    }
    if (paymentForm.payment_status === 'lunas' && paymentProofs.length < 1) {
      setError('Unggah bukti pembayaran terlebih dahulu sebelum menandai lunas');
      return;
    }
    setPaymentSaving(true);
    setError('');
    try {
      await api.patch(`/pos-transactions/${id}/payment`, {
        payment_method_id: Number(paymentForm.payment_method_id),
        payment_status: paymentForm.payment_status,
      });
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan pembayaran');
    } finally {
      setPaymentSaving(false);
    }
  };

  const handlePaymentProofsSelected = async (event) => {
    const files = Array.from(event.target.files || []).filter((file) => /^image\//.test(file.type));
    event.target.value = '';
    if (files.length === 0 || paymentProofUploading) return;

    const remaining = Math.max(0, 10 - paymentProofs.length);
    if (remaining === 0) {
      setError('Maksimal 10 bukti pembayaran');
      return;
    }

    const toUpload = files.slice(0, remaining);
    setPaymentProofUploading(true);
    setError('');
    try {
      for (const file of toUpload) {
        const formData = new FormData();
        formData.append('photo', file);
        await api.post(`/pos-transactions/${id}/payment-proofs`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengunggah bukti pembayaran');
    } finally {
      setPaymentProofUploading(false);
    }
  };

  const handleDeletePaymentProof = async (photoId) => {
    if (paymentProofUploading) return;
    setPaymentProofUploading(true);
    setError('');
    try {
      await api.delete(`/pos-transactions/${id}/payment-proofs/${photoId}`);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus bukti pembayaran');
    } finally {
      setPaymentProofUploading(false);
    }
  };

  const handleSaveItemMeter = async (itemId) => {
    const draft = meterDrafts[itemId] || { length: '', width: '' };
    if (!draft.length || !draft.width) {
      setError('Panjang dan lebar wajib diisi');
      return;
    }
    setMeterSavingId(itemId);
    setError('');
    try {
      await api.patch(`/pos-transactions/${id}/items/${itemId}/meter`, {
        length: Number(draft.length),
        width: Number(draft.width),
      });
      setMeterDrafts((prev) => ({
        ...prev,
        [itemId]: { length: '', width: '' },
      }));
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan ukuran meter');
    } finally {
      setMeterSavingId(null);
    }
  };

  const openAddItemModal = () => {
    setItemModalMode('add');
    setEditingItemId(null);
    setAddItemDraft(emptyAddItemDraft());
    setAddItemError('');
    setServiceSearch('');
    setAddItemModalOpen(true);
  };

  const openEditItemModal = (item) => {
    setItemModalMode('edit');
    setEditingItemId(item.id);
    setAddItemDraft({
      service_id: String(item.service_id || ''),
      qty: Math.max(1, Number(item.qty || 1)),
      meter_length: '',
      meter_width: '',
    });
    setAddItemError('');
    setServiceSearch('');
    setAddItemModalOpen(true);
  };

  const closeAddItemModal = () => {
    setAddItemModalOpen(false);
    setItemModalMode('add');
    setEditingItemId(null);
    setAddItemDraft(emptyAddItemDraft());
    setAddItemError('');
    setServiceSearch('');
  };

  const handleAddItemDraftChange = (key, value) => {
    setAddItemDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'service_id') {
        const nextService = services.find((row) => Number(row.id) === Number(value));
        if (!isMeterPricedService({ satuanName: nextService?.satuan_name })) {
          next.meter_length = '';
          next.meter_width = '';
        }
      }
      return next;
    });
  };

  const handleSaveAddItem = async (e) => {
    e.preventDefault();
    if (!addItemDraft.service_id) {
      setAddItemError('Pilih service terlebih dahulu');
      return;
    }
    const service = services.find((row) => Number(row.id) === Number(addItemDraft.service_id));
    const isGc = isGeneralCleaningCategory(service?.category_name);
    const needsMeter = isMeterPricedService({ satuanName: service?.satuan_name });
    const meterValue = resolveMeterFromDimensions({
      satuanName: service?.satuan_name,
      length: addItemDraft.meter_length,
      width: addItemDraft.meter_width,
    });
    const qtyValue = isGc ? 1 : Math.max(1, Number(addItemDraft.qty || 1));
    const payload = {
      service_id: Number(addItemDraft.service_id),
      qty: qtyValue,
      meter: needsMeter && !isGc ? meterValue : null,
      meter_length:
        needsMeter && !isGc && meterValue != null ? Number(addItemDraft.meter_length) : null,
      meter_width:
        needsMeter && !isGc && meterValue != null ? Number(addItemDraft.meter_width) : null,
    };

    setAddItemSaving(true);
    setAddItemError('');
    setError('');
    try {
      if (itemModalMode === 'edit' && editingItemId) {
        await api.patch(`/pos-transactions/${id}/items/${editingItemId}`, payload);
      } else {
        await api.post(`/pos-transactions/${id}/items`, payload);
      }
      closeAddItemModal();
      await loadData();
    } catch (err) {
      setAddItemError(
        err.response?.data?.message ||
          (itemModalMode === 'edit' ? 'Gagal mengubah layanan' : 'Gagal menambah layanan')
      );
    } finally {
      setAddItemSaving(false);
    }
  };

  const handleDeleteItem = async (item) => {
    if (deletingItemId || !item?.id) return;
    if (items.length <= 1) {
      setError('Minimal satu layanan harus tersisa');
      return;
    }
    const confirmed = window.confirm(
      `Hapus layanan "${item.service_name}" dari transaksi ini?`
    );
    if (!confirmed) return;

    setDeletingItemId(item.id);
    setError('');
    try {
      await api.delete(`/pos-transactions/${id}/items/${item.id}`);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus layanan');
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleCustomerPhotosSelected = async (event) => {
    const files = Array.from(event.target.files || []).filter((file) => /^image\//.test(file.type));
    event.target.value = '';
    if (files.length === 0 || customerPhotoUploading) return;

    const remaining = Math.max(0, 10 - customerPhotos.length);
    if (remaining === 0) {
      setError('Maksimal 10 foto referensi customer');
      return;
    }

    const toUpload = files.slice(0, remaining);
    setCustomerPhotoUploading(true);
    setError('');
    try {
      for (const file of toUpload) {
        const formData = new FormData();
        formData.append('photo', file);
        await api.post(`/pos-transactions/${id}/customer-photos`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengunggah foto referensi customer');
    } finally {
      setCustomerPhotoUploading(false);
    }
  };

  const handleDeleteCustomerPhoto = async (photoId) => {
    if (customerPhotoUploading) return;
    setCustomerPhotoUploading(true);
    setError('');
    try {
      await api.delete(`/pos-transactions/${id}/customer-photos/${photoId}`);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus foto referensi customer');
    } finally {
      setCustomerPhotoUploading(false);
    }
  };

  let rescheduleBlockedReason = '';
  if (isTerminalStatus) rescheduleBlockedReason = 'Completed/cancelled transactions cannot be rescheduled.';
  else if (hasProgressOrDone) rescheduleBlockedReason = 'Cannot reschedule: a worker is On Progress or Done.';
  else if (serviceDateKey && serviceDateKey < tomorrowKey) {
    rescheduleBlockedReason = 'Reschedule is only allowed at least 1 day before the service date.';
  }

  const handleRescheduleSubmit = async () => {
    if (!scheduleDateInput || scheduleSubmitting) return;
    setScheduleSubmitting(true);
    setError('');
    setScheduleSuccess('');
    try {
      await api.patch(`/pos-transactions/${id}/reschedule`, {
        service_date: scheduleDateInput,
      });
      setScheduleSuccess('Jadwal layanan berhasil dipindah. Pekerja akan mendapat notifikasi.');
      setScheduleConfirm(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memindah jadwal');
    } finally {
      setScheduleSubmitting(false);
    }
  };

  const handleCancelSubmit = async () => {
    if (scheduleSubmitting) return;
    setScheduleSubmitting(true);
    setError('');
    setScheduleSuccess('');
    try {
      await api.patch(`/pos-transactions/${id}/cancel`, { note: cancelNote || undefined });
      setScheduleSuccess('Transaction cancelled. Active assignments were cancelled.');
      setScheduleConfirm(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal membatalkan transaksi');
    } finally {
      setScheduleSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <Link to="/cleanox-only/transactions" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800">
            <ArrowLeft className="w-4 h-4" />
            Kembali ke daftar POS
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{transaction.transaction_no}</h1>
          <p className="mt-1 text-sm text-slate-500">{transaction.customer_name} • {itemSummary}</p>
          {isHistoryEntry && (
            <span className="mt-2 inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
              Input History
            </span>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadEReceipt}
            disabled={receiptLoading || invoiceLoading || orderFormLoading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            <Download className="w-4 h-4" />
            {receiptLoading ? 'Menyiapkan PDF...' : 'Unduh E-Receipt'}
          </button>
          <button
            type="button"
            onClick={handleDownloadOrderForm}
            disabled={receiptLoading || invoiceLoading || orderFormLoading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-60"
          >
            <FileText className="w-4 h-4" />
            {orderFormLoading ? 'Menyiapkan PDF...' : 'Cleanox Order Form'}
          </button>
          <button
            type="button"
            onClick={handleDownloadInternalInvoice}
            disabled={invoiceLoading || receiptLoading || orderFormLoading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {invoiceLoading ? 'Menyiapkan PDF...' : 'Invoice Internal A4'}
          </button>
          <div className="rounded-2xl bg-slate-900 px-5 py-4 text-white">
            <p className="text-xs uppercase tracking-wide text-slate-300">Total Akhir</p>
            {hasGc && !transaction.pricing_finalized_at ? (
              <>
                <p className="mt-1 text-lg font-bold leading-snug">Menyesuaikan jam pengerjaan</p>
                <p className="mt-1 text-xs text-slate-300">Nota tersedia setelah Done</p>
              </>
            ) : (
              <>
                <p className="mt-1 text-2xl font-bold">{formatCurrency(transaction.final_amount)}</p>
                {transaction.billing_hours != null && (
                  <p className="mt-1 text-xs text-slate-300">
                    Durasi: {Number(transaction.billing_hours)} jam
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {scheduleSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {scheduleSuccess}
        </div>
      )}

      <div className="grid gap-6">
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
            {isHistoryEntry && (
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Jam Mulai / Selesai</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {historyStartedAt ? formatDateTime(historyStartedAt) : '-'}
                </p>
                <p className="text-sm text-slate-500">
                  s/d {historyEndedAt ? formatDateTime(historyEndedAt) : '-'}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
              <p className="mt-1 font-semibold text-slate-900">{transaction.status}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Promo</p>
              <p className="mt-1 font-semibold text-slate-900">
                {transaction.promo_name_snapshot || '-'}
              </p>
              {transaction.promo_type_snapshot && transaction.promo_value_snapshot != null && (
                <p className="text-sm text-slate-500">
                  {transaction.promo_type_snapshot === 'persen'
                    ? `${Number(transaction.promo_value_snapshot)}%`
                    : formatCurrency(transaction.promo_value_snapshot)}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Diskon</p>
              <p className="mt-1 font-semibold text-slate-900">
                {formatCurrency(transaction.discount_amount)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Mode Layanan</p>
              <p className="mt-1">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                    isTakeHome
                      ? 'bg-violet-50 text-violet-700 border border-violet-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {isTakeHome ? 'Take Home' : 'Home Service'}
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Pembayaran</p>
              <p className="mt-1 font-semibold text-slate-900">
                {transaction.payment_method?.label ||
                  transaction.payment_method?.name ||
                  'Belum dipilih'}
              </p>
              <span
                className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                  transaction.payment_status === 'lunas'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700'
                }`}
              >
                {transaction.payment_status === 'lunas' ? 'Lunas' : 'Belum lunas'}
              </span>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Catatan</p>
              <p className="mt-1 text-sm text-slate-600">{transaction.notes || '-'}</p>
            </div>
          </div>

          {canEditPayment && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Ubah Pembayaran</p>
                <p className="mt-1 text-xs text-slate-500">
                  Metode dan status dapat diubah. Status lunas wajib punya minimal 1 bukti.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {['Tunai', 'BCA', 'EDC'].map((group) => {
                  const active =
                    (paymentForm.payment_group || selectedPaymentMethod?.method_group || '') ===
                    group;
                  return (
                    <button
                      key={group}
                      type="button"
                      onClick={() => handlePaymentGroupChange(group)}
                      className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
                        active
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {group}
                    </button>
                  );
                })}
              </div>
              {(paymentForm.payment_group || selectedPaymentMethod?.method_group) === 'BCA' &&
                selectedPaymentMethod && (
                  <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                    {selectedPaymentMethod.label}
                  </p>
                )}
              {(paymentForm.payment_group || selectedPaymentMethod?.method_group) === 'EDC' && (
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-slate-600">Jenis kartu EDC BCA</span>
                  <select
                    value={paymentForm.payment_method_id}
                    onChange={(e) =>
                      setPaymentForm((prev) => ({
                        ...prev,
                        payment_method_id: e.target.value,
                        payment_group: 'EDC',
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="">Pilih jenis kartu</option>
                    {edcPaymentMethods.map((method) => (
                      <option key={method.id} value={method.id}>
                        {method.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">Status pembayaran</span>
                <select
                  value={paymentForm.payment_status}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({ ...prev, payment_status: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="belum_lunas">Belum lunas</option>
                  <option value="lunas">Lunas</option>
                </select>
                {paymentForm.payment_status === 'lunas' && paymentProofs.length < 1 && (
                  <p className="text-xs text-amber-700">Unggah bukti dulu sebelum menandai lunas.</p>
                )}
              </label>
              <button
                type="button"
                disabled={
                  paymentSaving ||
                  !paymentForm.payment_method_id ||
                  (paymentForm.payment_status === 'lunas' && paymentProofs.length < 1)
                }
                onClick={handleSavePayment}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {paymentSaving ? 'Menyimpan...' : 'Simpan pembayaran'}
              </button>
            </div>
          )}

          {!isHistoryEntry && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Ubah / Batalkan Jadwal</p>
              <p className="mt-1 text-xs text-slate-500">
                Setelah konfirmasi customer via WA: pindahkan tanggal (minimal H−1) atau batalkan transaksi.
                Reschedule tidak meminta accept ulang dari pekerja.
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <label className="text-xs font-semibold text-slate-600">Tanggal layanan baru</label>
                <input
                  type="datetime-local"
                  value={scheduleDateInput}
                  onChange={(e) => setScheduleDateInput(e.target.value)}
                  disabled={!canReschedule || scheduleSubmitting}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:opacity-60"
                />
              </div>
              <button
                type="button"
                disabled={!canReschedule || scheduleSubmitting || !scheduleDateInput}
                onClick={() => setScheduleConfirm({ type: 'reschedule' })}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                Simpan jadwal baru
              </button>
            </div>
            {!canReschedule && rescheduleBlockedReason && (
              <p className="text-xs text-amber-700">{rescheduleBlockedReason}</p>
            )}

            <div className="border-t border-slate-200 pt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Catatan pembatalan (opsional)</label>
                <input
                  type="text"
                  value={cancelNote}
                  onChange={(e) => setCancelNote(e.target.value)}
                  disabled={!canCancel || scheduleSubmitting}
                  placeholder="Contoh: customer batal via WA"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:opacity-60"
                />
              </div>
              <button
                type="button"
                disabled={!canCancel || scheduleSubmitting}
                onClick={() => setScheduleConfirm({ type: 'cancel' })}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
              >
                Batalkan transaksi
              </button>
            </div>
          </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">Item layanan</h3>
            {canMutateItems && (
              <button
                type="button"
                onClick={openAddItemModal}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
              >
                <Plus className="h-4 w-4" />
                Tambah Layanan
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-[15px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-sm uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-3">Service</th>
                  <th className="px-3 py-3">Qty / Ukuran</th>
                  <th className="px-3 py-3">Promo</th>
                  <th className="px-3 py-3 text-right">Harga Final</th>
                  <th className="px-3 py-3 text-right">Line Total</th>
                  {canMutateItems && <th className="px-3 py-3 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => {
                  const isGc = isGeneralCleaningCategory(item.category_name);
                  const pendingGc = isGc && !transaction.pricing_finalized_at;
                  const isMeter = isMeterPricedService({ satuanName: item.satuan_name, unitLabel: item.unit_label });
                  const pendingMeter = isMeterPricingPending({
                    satuanName: item.satuan_name, unitLabel: item.unit_label,
                    meter: item.meter,
                  });
                  const draft = meterDrafts[item.id] || { length: '', width: '' };
                  const canEditMeter = isMeter && canMutateItems;
                  return (
                  <tr key={item.id}>
                    <td className="px-3 py-3 font-medium text-slate-800">
                      {item.service_name}
                      {pendingMeter && (
                        <span className="ml-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          Pending meter
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {pendingGc ? (
                        '—'
                      ) : isMeter ? (
                        <div className="space-y-2">
                          <p>
                            Qty {item.qty}
                            {!pendingMeter ? ` · ${Number(item.meter)} m²` : ''}
                          </p>
                          {canEditMeter && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                placeholder="P"
                                value={draft.length}
                                onChange={(e) =>
                                  setMeterDrafts((prev) => ({
                                    ...prev,
                                    [item.id]: { ...draft, length: e.target.value },
                                  }))
                                }
                                className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                disabled={meterSavingId === item.id}
                              />
                              <span className="text-xs font-bold text-slate-400">×</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                placeholder="L"
                                value={draft.width}
                                onChange={(e) =>
                                  setMeterDrafts((prev) => ({
                                    ...prev,
                                    [item.id]: { ...draft, width: e.target.value },
                                  }))
                                }
                                className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                                disabled={meterSavingId === item.id}
                              />
                              <button
                                type="button"
                                disabled={meterSavingId === item.id}
                                onClick={() => handleSaveItemMeter(item.id)}
                                className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
                              >
                                {meterSavingId === item.id
                                  ? '...'
                                  : pendingMeter
                                    ? 'Simpan'
                                    : 'Update'}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        item.qty
                      )}
                      {isGc && transaction.pricing_finalized_at ? ' jam' : ''}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{item.promo_name_snapshot || '-'}</td>
                    <td className="px-3 py-3 text-right text-slate-700">
                      {item.original_price_snapshot != null && (
                        <div className="text-[12px] text-slate-400 line-through">
                          {formatCurrency(item.original_price_snapshot)}
                        </div>
                      )}
                      {formatCurrency(item.final_price_snapshot)}
                      {isGc ? ' / jam' : ''}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900">
                      {pendingGc
                        ? 'Pending jam'
                        : pendingMeter
                          ? 'Pending meter'
                          : formatCurrency(item.line_total)}
                    </td>
                    {canMutateItems && (
                      <td className="px-3 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditItemModal(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={deletingItemId === item.id || items.length <= 1}
                            onClick={() => handleDeleteItem(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {deletingItemId === item.id ? '...' : 'Hapus'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {(hasGc && !transaction.pricing_finalized_at) || hasMeterPending ? (
            <p className="text-xs text-amber-700">
              Ada harga yang masih pending
              {hasGc && !transaction.pricing_finalized_at ? ' (jam GC)' : ''}
              {hasMeterPending ? ' (ukuran meter)' : ''}. Total transaksi belum final.
            </p>
          ) : null}
        </section>
      </div>

      <div className="grid gap-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Assignment Worker</h2>
            {(assignments || []).some((item) => item.assignment_status === 'Rejected') && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 border border-amber-200">
                Ada reject menunggu plotting
              </span>
            )}
          </div>
          {!isHistoryEntry && (
          <form onSubmit={handleAssignmentSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {workers.map((worker) => {
                const checked = assignmentIds.includes(Number(worker.employee_id));
                const busy = Boolean(worker.is_busy) && !checked;
                return (
                  <label
                    key={worker.employee_id}
                    className={`rounded-xl border p-3 ${
                      checked
                        ? 'border-brand-500 bg-brand-50 cursor-pointer'
                        : busy
                          ? 'border-amber-200 bg-amber-50/70 cursor-not-allowed'
                          : 'border-slate-200 cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={checked}
                      disabled={busy}
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
                    {busy && (
                      <div className="mt-1 text-[11px] font-semibold text-amber-700">
                        Sibuk: {worker.busy_reason || 'tugas aktif di tanggal ini'}
                      </div>
                    )}
                  </label>
                );
              })}
            </div>
            <button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Save className="w-4 h-4" />
              Simpan Assignment
            </button>
          </form>
          )}

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">Worker aktif pada transaksi ini</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {(assignments || []).filter((item) =>
                isHistoryEntry
                  ? item.assignment_status === 'Done'
                  : ['Assigned', 'In_Schedule', 'On_Progress'].includes(item.assignment_status)
              ).length === 0 ? (
                <li>Belum ada worker ditugaskan.</li>
              ) : (
                (assignments || [])
                  .filter((item) =>
                    isHistoryEntry
                      ? item.assignment_status === 'Done'
                      : ['Assigned', 'In_Schedule', 'On_Progress'].includes(item.assignment_status)
                  )
                  .map((item) => (
                    <li key={item.id}>
                      {item.employee_name} • {item.assignment_status}
                    </li>
                  ))
              )}
            </ul>
          </div>

          {(assignments || []).some((item) => item.assignment_status === 'Done') && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
              <p className="text-sm font-semibold text-slate-900">Worker selesai (Done)</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {(assignments || [])
                  .filter((item) => item.assignment_status === 'Done')
                  .map((item) => (
                    <li key={item.id}>
                      {item.employee_name} • Done
                      {item.completed_at ? ` • ${formatDateTime(item.completed_at)}` : ''}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {(assignments || []).some((item) => item.assignment_status === 'Rejected') && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <p className="text-sm font-semibold text-slate-900">Riwayat reject / menunggu re-plot</p>
              <ul className="mt-3 space-y-3 text-sm text-slate-700">
                {(assignments || [])
                  .filter((item) => item.assignment_status === 'Rejected')
                  .map((item) => (
                    <li key={item.id} className="rounded-lg border border-amber-100 bg-white p-3 space-y-1">
                      <div className="font-semibold text-slate-900">{item.employee_name} • Rejected</div>
                      <div className="text-slate-600">Alasan: {item.assignment_note || '—'}</div>
                      <div className="text-slate-600">
                        Rekomendasi: {item.recommended_employee_name || '—'}
                      </div>
                      <div className="text-xs text-slate-400">
                        {item.responded_at ? formatDateTime(item.responded_at) : '—'}
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </section>

        {!isHistoryEntry && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Pesan & Notifikasi</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <form onSubmit={handleSendGroup} className="flex h-full flex-col space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-slate-900">Kirim ke Group</p>
                <button
                  type="button"
                  onClick={handleCopyGroupMessage}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-600 transition duration-150 hover:-translate-y-0.5 hover:bg-slate-50 active:scale-[.95]"
                  aria-label="Salin pesan group"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                value={groupForm.recipient}
                onChange={(e) => setGroupForm({ ...groupForm, recipient: e.target.value })}
                placeholder="Group ID / nomor WA"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <pre className="min-h-[140px] flex-1 whitespace-pre-wrap rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3.5 font-sans text-[12.5px] leading-relaxed text-slate-700">
                {groupMessagePreview}
              </pre>
              <p className="text-xs text-slate-400">
                Format pesan tidak dapat diubah — isi mengikuti data transaksi.
              </p>
              <button className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
                <Send className="w-4 h-4" />
                Kirim Pesan Group
              </button>
            </form>

            <div className="flex h-full flex-col space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-slate-900">Pesan Customer</p>
                <button
                  type="button"
                  onClick={handleCopyCustomerMessage}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-600 transition duration-150 hover:-translate-y-0.5 hover:bg-slate-50 active:scale-[.95]"
                  aria-label="Salin pesan customer"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <pre className="min-h-[140px] flex-1 whitespace-pre-wrap rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3.5 font-sans text-[12.5px] leading-relaxed text-slate-700">
                {customerMessagePreview}
              </pre>
              <p className="text-xs text-slate-400">
                Format pesan tidak dapat diubah — salin lalu kirim manual via WhatsApp.
              </p>
            </div>
          </div>
        </section>
        )}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Bukti Pembayaran</h2>
            <p className="mt-1 text-sm text-slate-500">
              Lampiran bukti transfer/EDC/tunai · {paymentProofs.length}/10
            </p>
          </div>
          <div>
            <input
              ref={paymentProofFileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePaymentProofsSelected}
            />
            <button
              type="button"
              disabled={!canUploadPaymentProofs || paymentProofUploading}
              onClick={() => paymentProofFileInputRef.current?.click()}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ImagePlus className="h-4 w-4" />
              {paymentProofUploading ? 'Mengunggah...' : 'Tambah bukti'}
            </button>
          </div>
        </div>

        <div className="mt-4">
          {paymentProofs.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada bukti pembayaran.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {paymentProofs.map((photo) => (
                <div
                  key={photo.id}
                  className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                >
                  {canEditPayment && (
                    <button
                      type="button"
                      disabled={paymentProofUploading}
                      onClick={() => handleDeletePaymentProof(photo.id)}
                      className="absolute right-1.5 top-1.5 z-[1] inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white shadow-lg disabled:opacity-60"
                      aria-label="Hapus bukti pembayaran"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {paymentPreviewMap[String(photo.id)] ? (
                    <button
                      type="button"
                      onClick={() =>
                        openPhotoPreview(paymentPreviewMap[String(photo.id)], 'Bukti Pembayaran')
                      }
                      aria-label="Preview bukti pembayaran"
                      className="block w-full cursor-pointer"
                    >
                      <img
                        src={paymentPreviewMap[String(photo.id)]}
                        alt="Bukti pembayaran"
                        className="h-36 w-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="flex h-36 w-full items-center justify-center text-xs text-slate-400">
                      Memuat...
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {transaction.status === 'Cancelled' && (
          <p className="mt-3 text-xs text-amber-700">
            Transaction cancelled — payment proof upload is disabled.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Referensi Customer</h2>
            <p className="mt-1 text-sm text-slate-500">
              Foto before dari customer — terlihat pekerja di mobile sebagai acuan · {customerPhotos.length}/10
            </p>
          </div>
          <div>
            <input
              ref={customerFileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleCustomerPhotosSelected}
            />
            <button
              type="button"
              disabled={!canUploadCustomerPhotos || customerPhotoUploading}
              onClick={() => customerFileInputRef.current?.click()}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ImagePlus className="h-4 w-4" />
              {customerPhotoUploading ? 'Mengunggah...' : 'Tambah foto'}
            </button>
          </div>
        </div>

        <div className="mt-4">
          {customerPhotos.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada foto referensi customer.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {customerPhotos.map((photo) => (
                <div key={photo.id} className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {transaction.status !== 'Cancelled' && (
                    <button
                      type="button"
                      disabled={customerPhotoUploading}
                      onClick={() => handleDeleteCustomerPhoto(photo.id)}
                      className="absolute right-1.5 top-1.5 z-[1] inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white shadow-lg disabled:opacity-60"
                      aria-label="Hapus foto referensi"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {customerPreviewMap[String(photo.id)] ? (
                    <button
                      type="button"
                      onClick={() =>
                        openPhotoPreview(customerPreviewMap[String(photo.id)], 'Referensi Customer')
                      }
                      aria-label="Preview foto referensi customer"
                      className="block w-full cursor-pointer"
                    >
                      <img
                        src={customerPreviewMap[String(photo.id)]}
                        alt="Referensi customer"
                        className="h-36 w-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="flex h-36 w-full items-center justify-center text-xs text-slate-400">
                      Memuat...
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {transaction.status === 'Cancelled' && (
          <p className="mt-3 text-xs text-amber-700">Transaction cancelled — customer reference upload is disabled.</p>
        )}
      </section>

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

        {isTakeHome ? (
          <PosTakehomeStageTimeline
            transactionId={transaction.id}
            progress={takehomeProgress}
            previewMap={takehomePreviewMap}
            workers={workers}
            disabled={transaction.status === 'Cancelled'}
            onUpdated={async (nextProgress) => {
              setDetail((prev) => (prev ? { ...prev, takehome_progress: nextProgress } : prev));
              await refreshTakehomePreviews(nextProgress);
            }}
          />
        ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Bukti Pengerjaan</h2>
          <p className="mt-1 text-sm text-slate-500">
            Gabungan foto before/after dari semua pekerja pada transaksi ini.
          </p>
          <div className="mt-4 space-y-4">
            {(assignments || []).length === 0 ? (
              <p className="text-sm text-slate-500">Belum ada assignment pekerja.</p>
            ) : (
              (() => {
                const assignmentById = new Map(
                  (assignments || []).map((row) => [Number(row.id), row])
                );
                const mergePhotos = (kind) => {
                  const seen = new Set();
                  const merged = [];
                  for (const assignment of assignments || []) {
                    const list =
                      kind === 'before'
                        ? assignment.before_photos || []
                        : assignment.after_photos || [];
                    for (const photo of list) {
                      const dedupeKey = photo?.id ?? `${assignment.id}-${photo?.photo_path}`;
                      if (seen.has(dedupeKey)) continue;
                      seen.add(dedupeKey);
                      merged.push({
                        ...photo,
                        assignment_id: photo.assignment_id ?? assignment.id,
                        employee_name:
                          assignmentById.get(Number(photo.assignment_id ?? assignment.id))
                            ?.employee_name || assignment.employee_name,
                      });
                    }
                  }
                  return merged;
                };
                const beforePhotos = mergePhotos('before');
                const afterPhotos = mergePhotos('after');

                const renderPhotoGrid = (kind, photos) => {
                  if (photos.length === 0) {
                    return (
                      <p className="text-sm text-slate-500">
                        Belum ada foto {kind === 'before' ? 'before' : 'after'}
                      </p>
                    );
                  }
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {photos.map((photo, index) => {
                        const assignmentId = Number(photo.assignment_id);
                        const key = evidencePreviewKey(assignmentId, kind, photo, index);
                        const preview = evidencePreviewMap[key];
                        return preview ? (
                          <div key={key} className="relative">
                            <img
                              src={preview}
                              alt={`${kind} ${photo.employee_name || ''}`}
                              className="h-28 w-full rounded-xl object-cover border border-slate-200"
                            />
                            {photo.employee_name ? (
                              <p className="mt-1 truncate text-[11px] text-slate-500">
                                {photo.employee_name}
                              </p>
                            ) : null}
                            <button
                              type="button"
                              aria-label={`Unduh foto ${kind}`}
                              onClick={() =>
                                downloadEvidencePhoto({
                                  blobUrl: preview,
                                  photoPath: photo?.photo_path,
                                  fileName: buildEvidenceDownloadName({
                                    transactionNo: transaction.transaction_no,
                                    employeeName: photo.employee_name,
                                    kind,
                                    index,
                                    photo,
                                  }),
                                })
                              }
                              className="absolute right-1.5 top-1.5 z-[1] inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white shadow-lg"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div key={key} className="h-28 w-full rounded-xl bg-slate-200 animate-pulse" />
                        );
                      })}
                    </div>
                  );
                };

                return (
                  <div className="rounded-xl border border-slate-200 p-4 space-y-4">
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-slate-800">Before</p>
                      {renderPhotoGrid('before', beforePhotos)}
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-slate-800">After</p>
                      {renderPhotoGrid('after', afterPhotos)}
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </section>
        )}
      </div>

      {scheduleConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-4">
            {scheduleConfirm.type === 'reschedule' ? (
              <>
                <h3 className="text-lg font-semibold text-slate-900">Pindahkan jadwal?</h3>
                <p className="text-sm text-slate-600">
                  Tanggal lama: <span className="font-semibold">{formatDateTime(transaction.service_date)}</span>
                  <br />
                  Tanggal baru:{' '}
                  <span className="font-semibold">
                    {formatDateTime(scheduleDateInput.replace('T', ' '))}
                  </span>
                </p>
                <p className="text-xs text-slate-500">
                  Status assignment pekerja tidak diubah. Pekerja akan mendapat notifikasi di Home & Riwayat.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-slate-900">Cancel transaction?</h3>
                <p className="text-sm text-slate-600">
                  Status becomes <span className="font-semibold">Cancelled</span>. Active assignments
                  (Assigned / In Schedule / On Progress) become <span className="font-semibold">Cancelled</span>.
                </p>
                {cancelNote && (
                  <p className="text-sm text-slate-500">Note: {cancelNote}</p>
                )}
              </>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={scheduleSubmitting}
                onClick={() => setScheduleConfirm(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={scheduleSubmitting}
                onClick={() =>
                  scheduleConfirm.type === 'reschedule' ? handleRescheduleSubmit() : handleCancelSubmit()
                }
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${
                  scheduleConfirm.type === 'cancel'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {scheduleSubmitting ? 'Menyimpan...' : 'Konfirmasi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {addItemModalOpen && (
        <BodyPortal>
          <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-900/40 p-3">
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[20px] border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <h3 className="text-[15px] font-bold text-slate-900">
                  {itemModalMode === 'edit' ? 'Edit Layanan' : 'Tambah Layanan'}
                </h3>
                <button
                  type="button"
                  onClick={closeAddItemModal}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-slate-200 text-slate-600"
                  aria-label="Tutup"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form onSubmit={handleSaveAddItem} className="space-y-4 px-5 py-4">
                {addItemError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {addItemError}
                  </div>
                )}
                <label className="block space-y-1.5">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400">
                    Cari service
                  </span>
                  <input
                    type="search"
                    value={serviceSearch}
                    onChange={(e) => setServiceSearch(e.target.value)}
                    placeholder="Ketik nama service..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-blue-400 focus:bg-white focus:outline-none"
                  />
                </label>
                <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {services
                    .filter((row) => {
                      const term = serviceSearch.trim().toLowerCase();
                      if (!term) return true;
                      return String(row.name || '')
                        .toLowerCase()
                        .includes(term);
                    })
                    .map((row) => {
                      const selected = Number(addItemDraft.service_id) === Number(row.id);
                      return (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => handleAddItemDraftChange('service_id', String(row.id))}
                          className={`flex w-full items-start justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                            selected
                              ? 'border-blue-300 bg-blue-50 text-blue-900'
                              : 'border-transparent bg-white text-slate-800 hover:bg-slate-50'
                          }`}
                        >
                          <span className="font-semibold">{row.name}</span>
                          <span className="shrink-0 text-xs text-slate-500">
                            {formatCurrency(row.coret_price != null ? row.coret_price : row.price)}
                          </span>
                        </button>
                      );
                    })}
                </div>

                {(() => {
                  const draftService = services.find(
                    (row) => Number(row.id) === Number(addItemDraft.service_id)
                  );
                  const draftIsGc = isGeneralCleaningCategory(draftService?.category_name);
                  const draftNeedsMeter = isMeterPricedService({ satuanName: draftService?.satuan_name });
                  const draftArea = resolveMeterFromDimensions({
                    satuanName: draftService?.satuan_name,
                    length: addItemDraft.meter_length,
                    width: addItemDraft.meter_width,
                  });
                  if (!draftService) return null;
                  return (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                      {!draftIsGc && (
                        <label className="block space-y-1.5">
                          <span className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400">
                            Qty
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleAddItemDraftChange(
                                  'qty',
                                  Math.max(1, Number(addItemDraft.qty || 1) - 1)
                                )
                              }
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white"
                              aria-label="Kurangi qty"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <input
                              type="text"
                              readOnly
                              value={addItemDraft.qty}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-sm font-bold"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleAddItemDraftChange(
                                  'qty',
                                  Math.max(1, Number(addItemDraft.qty || 1) + 1)
                                )
                              }
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white"
                              aria-label="Tambah qty"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        </label>
                      )}
                      {draftNeedsMeter && (
                        <div className="space-y-1.5">
                          <span className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-slate-400">
                            Ukuran (panjang × lebar)
                          </span>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={addItemDraft.meter_length}
                              onChange={(e) =>
                                handleAddItemDraftChange('meter_length', e.target.value)
                              }
                              placeholder="P"
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                            />
                            <span className="text-sm font-bold text-slate-400">×</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={addItemDraft.meter_width}
                              onChange={(e) =>
                                handleAddItemDraftChange('meter_width', e.target.value)
                              }
                              placeholder="L"
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                            />
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {draftArea != null
                              ? `Total ${draftArea} m²`
                              : 'Opsional — bisa diisi nanti'}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeAddItemModal}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={addItemSaving || !addItemDraft.service_id}
                    className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {addItemSaving
                      ? 'Menyimpan...'
                      : itemModalMode === 'edit'
                        ? 'Simpan Perubahan'
                        : 'Tambah Layanan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </BodyPortal>
      )}

      {photoPreview && (
        <BodyPortal>
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4"
            onClick={closePhotoPreview}
          >
            <button
              type="button"
              onClick={closePhotoPreview}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
              aria-label="Tutup preview"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={photoPreview.src}
              alt={photoPreview.title}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-xl"
            />
          </div>
        </BodyPortal>
      )}
    </div>
  );
}
