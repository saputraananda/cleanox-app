import { useEffect, useState } from 'react';
import { Building2, ChevronDown, Home, MapPin, Plus, Save, Sparkles, X } from 'lucide-react';
import api from '@shared/utils/api.js';
import BodyPortal from '@web/components/BodyPortal.jsx';

const inputClass =
  'w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-800 transition duration-150 focus:bg-white focus:border-blue-400 focus:outline-none focus:shadow-[0_0_0_3px_rgba(59,130,246,.12)]';

const labelEyebrowClass =
  'text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5';

const LABEL_PRESETS = ['Rumah', 'Kantor', 'Apartemen', 'Kost', 'Lainnya'];

export default function CustomerAddressModal({
  isOpen,
  onClose,
  customerId,
  addressToEdit = null,
  onSaved,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [label, setLabel] = useState('Rumah');
  const [customLabel, setCustomLabel] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');

  const [provinces, setProvinces] = useState([]);
  const [regencies, setRegencies] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [villages, setVillages] = useState([]);

  const [provinceId, setProvinceId] = useState('');
  const [regencyId, setRegencyId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [villageId, setVillageId] = useState('');

  const [streetDetail, setStreetDetail] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [addressNote, setAddressNote] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);

  const [loadingWilayah, setLoadingWilayah] = useState(false);

  // Load provinces on mount
  useEffect(() => {
    if (!isOpen) return;
    const loadProvinces = async () => {
      try {
        const res = await api.get('/wilayah/provinces');
        setProvinces(res.data.provinces || []);
      } catch (err) {
        console.error('[CustomerAddressModal] load provinces error:', err.message);
      }
    };
    loadProvinces();
  }, [isOpen]);

  // Reset or fill form when addressToEdit changes
  useEffect(() => {
    if (!isOpen) return;
    setError('');
    if (addressToEdit) {
      const isPreset = LABEL_PRESETS.includes(addressToEdit.label);
      setLabel(isPreset ? addressToEdit.label : 'Lainnya');
      setCustomLabel(isPreset ? '' : addressToEdit.label || '');
      setRecipientName(addressToEdit.recipient_name || '');
      setRecipientPhone(addressToEdit.recipient_phone || '');
      setProvinceId(addressToEdit.province_id ? String(addressToEdit.province_id) : '');
      setRegencyId(addressToEdit.regency_id ? String(addressToEdit.regency_id) : '');
      setDistrictId(addressToEdit.district_id ? String(addressToEdit.district_id) : '');
      setVillageId(addressToEdit.village_id ? String(addressToEdit.village_id) : '');
      setStreetDetail(addressToEdit.street_detail || '');
      setHouseNumber(addressToEdit.house_number || '');
      setAddressNote(addressToEdit.address_note || '');
      setIsPrimary(Boolean(addressToEdit.is_primary));
    } else {
      setLabel('Rumah');
      setCustomLabel('');
      setRecipientName('');
      setRecipientPhone('');
      setProvinceId('');
      setRegencyId('');
      setDistrictId('');
      setVillageId('');
      setStreetDetail('');
      setHouseNumber('');
      setAddressNote('');
      setIsPrimary(false);
    }
  }, [isOpen, addressToEdit]);

  // Load regencies when provinceId changes
  useEffect(() => {
    if (!isOpen || !provinceId) {
      setRegencies([]);
      return;
    }
    const loadRegencies = async () => {
      setLoadingWilayah(true);
      try {
        const { data } = await api.get('/wilayah/regencies', {
          params: { province_id: provinceId },
        });
        setRegencies(data.regencies || []);
      } catch (err) {
        console.error('[CustomerAddressModal] load regencies error:', err.message);
      } finally {
        setLoadingWilayah(false);
      }
    };
    loadRegencies();
  }, [isOpen, provinceId]);

  // Load districts when regencyId changes
  useEffect(() => {
    if (!isOpen || !regencyId) {
      setDistricts([]);
      return;
    }
    const loadDistricts = async () => {
      setLoadingWilayah(true);
      try {
        const { data } = await api.get('/wilayah/districts', {
          params: { regency_id: regencyId },
        });
        setDistricts(data.districts || []);
      } catch (err) {
        console.error('[CustomerAddressModal] load districts error:', err.message);
      } finally {
        setLoadingWilayah(false);
      }
    };
    loadDistricts();
  }, [isOpen, regencyId]);

  // Load villages when districtId changes
  useEffect(() => {
    if (!isOpen || !districtId) {
      setVillages([]);
      return;
    }
    const loadVillages = async () => {
      setLoadingWilayah(true);
      try {
        const { data } = await api.get('/wilayah/villages', {
          params: { district_id: districtId },
        });
        setVillages(data.villages || []);
      } catch (err) {
        console.error('[CustomerAddressModal] load villages error:', err.message);
      } finally {
        setLoadingWilayah(false);
      }
    };
    loadVillages();
  }, [isOpen, districtId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!customerId) {
      setError('ID customer tidak valid');
      return;
    }

    const effectiveLabel =
      label === 'Lainnya' ? customLabel.trim() || 'Lainnya' : label;

    if (!streetDetail.trim() && !provinceId) {
      setError('Mohon lengkapi minimal detail jalan atau wilayah');
      return;
    }

    setLoading(true);
    setError('');

    const payload = {
      label: effectiveLabel,
      recipient_name: recipientName.trim() || null,
      recipient_phone: recipientPhone.trim() || null,
      province_id: provinceId ? Number(provinceId) : null,
      regency_id: regencyId ? Number(regencyId) : null,
      district_id: districtId ? Number(districtId) : null,
      village_id: villageId ? Number(villageId) : null,
      street_detail: streetDetail.trim() || null,
      house_number: houseNumber.trim() || null,
      address_note: addressNote.trim() || null,
      is_primary: isPrimary,
    };

    try {
      let savedAddress = null;
      if (addressToEdit?.id) {
        const { data } = await api.put(
          `/pos-customers/${customerId}/addresses/${addressToEdit.id}`,
          payload
        );
        savedAddress = data.address;
      } else {
        const { data } = await api.post(`/pos-customers/${customerId}/addresses`, payload);
        savedAddress = data.address;
      }

      if (onSaved) {
        onSaved(savedAddress);
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan alamat');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div
          className="relative flex max-h-[90vh] w-full max-w-xl flex-col rounded-[24px] border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-blue-50 text-blue-600">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-[15px] font-extrabold text-slate-800">
                  {addressToEdit ? 'Edit Alamat Layanan' : 'Tambah Alamat Layanan'}
                </h3>
                <p className="text-[12px] text-slate-500">
                  Simpan lokasi pengerjaan / penjemputan customer
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
            {error && (
              <div className="rounded-[12px] border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-700">
                {error}
              </div>
            )}

            {/* Label Presets */}
            <div>
              <span className={labelEyebrowClass}>Label Alamat</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {LABEL_PRESETS.map((item) => {
                  const active = label === item;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setLabel(item)}
                      className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12px] font-bold transition ${
                        active
                          ? 'border border-blue-400 bg-blue-50 text-blue-700 shadow-sm'
                          : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                      }`}
                    >
                      {item === 'Rumah' && <Home className="w-3.5 h-3.5" />}
                      {item === 'Kantor' && <Building2 className="w-3.5 h-3.5" />}
                      {item}
                    </button>
                  );
                })}
              </div>
              {label === 'Lainnya' && (
                <input
                  type="text"
                  placeholder="Contoh: Villa Puncak, Toko Roti, dsb"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  className={`${inputClass} mt-2`}
                  maxLength={50}
                />
              )}
            </div>

            {/* Optional Recipient at Location */}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className={labelEyebrowClass}>Nama Penerima di Lokasi (Opsional)</span>
                <input
                  type="text"
                  placeholder="Misal: Bu Siti (ART) / Pak Joko"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1">
                <span className={labelEyebrowClass}>No. Telp di Lokasi (Opsional)</span>
                <input
                  type="tel"
                  placeholder="08xxxxxxxxxx"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>

            {/* Wilayah Dropdowns */}
            <div className="rounded-[16px] border border-slate-100 bg-slate-50/70 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-slate-700">Wilayah Administratif</span>
                {loadingWilayah && (
                  <span className="text-[11px] text-blue-600 animate-pulse">Memuat data...</span>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500">Provinsi</span>
                  <div className="relative">
                    <select
                      value={provinceId}
                      onChange={(e) => {
                        setProvinceId(e.target.value);
                        setRegencyId('');
                        setDistrictId('');
                        setVillageId('');
                      }}
                      className={`${inputClass} appearance-none pr-8`}
                    >
                      <option value="">Pilih Provinsi</option>
                      {provinces.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  </div>
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500">Kota / Kabupaten</span>
                  <div className="relative">
                    <select
                      value={regencyId}
                      onChange={(e) => {
                        setRegencyId(e.target.value);
                        setDistrictId('');
                        setVillageId('');
                      }}
                      disabled={!provinceId}
                      className={`${inputClass} appearance-none pr-8 disabled:opacity-50`}
                    >
                      <option value="">Pilih Kota/Kabupaten</option>
                      {regencies.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  </div>
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500">Kecamatan</span>
                  <div className="relative">
                    <select
                      value={districtId}
                      onChange={(e) => {
                        setDistrictId(e.target.value);
                        setVillageId('');
                      }}
                      disabled={!regencyId}
                      className={`${inputClass} appearance-none pr-8 disabled:opacity-50`}
                    >
                      <option value="">Pilih Kecamatan</option>
                      {districts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  </div>
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500">Kelurahan</span>
                  <div className="relative">
                    <select
                      value={villageId}
                      onChange={(e) => setVillageId(e.target.value)}
                      disabled={!districtId}
                      className={`${inputClass} appearance-none pr-8 disabled:opacity-50`}
                    >
                      <option value="">Pilih Kelurahan</option>
                      {villages.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  </div>
                </label>
              </div>
            </div>

            {/* Street Detail & House Number */}
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <label className="space-y-1">
                <span className={labelEyebrowClass}>Nama Jalan / Blok / Unit</span>
                <input
                  type="text"
                  placeholder="Misal: Jl. Boulevard Raya Blok AA"
                  value={streetDetail}
                  onChange={(e) => setStreetDetail(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1">
                <span className={labelEyebrowClass}>No. Rumah</span>
                <input
                  type="text"
                  placeholder="Misal: 15B"
                  value={houseNumber}
                  onChange={(e) => setHouseNumber(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>

            {/* Address Note / Patokan */}
            <label className="block space-y-1">
              <span className={labelEyebrowClass}>Patokan / Catatan Alamat</span>
              <input
                type="text"
                placeholder="Misal: Pagar hitam depan pos satpam, masuk gang kedua"
                value={addressNote}
                onChange={(e) => setAddressNote(e.target.value)}
                className={inputClass}
              />
            </label>

            {/* Primary Address Checkbox */}
            <label className="flex items-center gap-2.5 pt-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
              />
              <span className="text-[12.5px] font-semibold text-slate-700">
                Jadikan sebagai alamat utama (default saat pesan)
              </span>
            </label>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-[12px] border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-bold text-slate-600 transition hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-[12px] px-5 py-2.5 text-[13px] font-bold text-white transition duration-150 hover:-translate-y-0.5 active:scale-[.98]"
                style={{ background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)' }}
              >
                <Save className="w-4 h-4" />
                {loading ? 'Menyimpan...' : addressToEdit ? 'Simpan Perubahan' : 'Tambah Alamat'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </BodyPortal>
  );
}
