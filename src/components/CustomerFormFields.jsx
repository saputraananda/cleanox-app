import { useEffect, useState } from 'react';
import api from '../utils/api.js';

export const emptyCustomerForm = {
  name: '',
  phone: '',
  birth_date: '',
  province_id: '',
  regency_id: '',
  district_id: '',
  village_id: '',
  house_number: '',
  street_detail: '',
  address_note: '',
  referral_source_id: '',
  referral_employee_id: '',
  tier: '',
  status: 'Aktif',
};

export const inputClass =
  'w-full rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-800 transition duration-150 focus:bg-white focus:border-blue-400 focus:outline-none focus:shadow-[0_0_0_3px_rgba(59,130,246,.12)]';

export function customerToForm(row = {}) {
  return {
    name: row.name || '',
    phone: row.phone || '',
    birth_date: row.birth_date ? String(row.birth_date).slice(0, 10) : '',
    province_id: row.province_id ? String(row.province_id) : '',
    regency_id: row.regency_id ? String(row.regency_id) : '',
    district_id: row.district_id ? String(row.district_id) : '',
    village_id: row.village_id ? String(row.village_id) : '',
    house_number: row.house_number || '',
    street_detail: row.street_detail || '',
    address_note: row.address_note || '',
    referral_source_id: row.referral_source_id ? String(row.referral_source_id) : '',
    referral_employee_id: row.referral_employee_id ? String(row.referral_employee_id) : '',
    tier: row.tier || '',
    status: row.status || 'Aktif',
  };
}

export function formToPayload(form) {
  return {
    name: form.name.trim(),
    phone: form.phone.trim() || null,
    birth_date: form.birth_date || null,
    province_id: form.province_id ? Number(form.province_id) : null,
    regency_id: form.regency_id ? Number(form.regency_id) : null,
    district_id: form.district_id ? Number(form.district_id) : null,
    village_id: form.village_id ? Number(form.village_id) : null,
    house_number: form.house_number.trim() || null,
    street_detail: form.street_detail.trim() || null,
    address_note: form.address_note.trim() || null,
    referral_source_id: form.referral_source_id ? Number(form.referral_source_id) : null,
    referral_employee_id: form.referral_employee_id ? Number(form.referral_employee_id) : null,
    tier: form.tier.trim() || null,
    status: form.status || 'Aktif',
  };
}

export default function CustomerFormFields({
  form,
  setForm,
  showStatus = true,
  showTier = true,
}) {
  const [provinces, setProvinces] = useState([]);
  const [regencies, setRegencies] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [villages, setVillages] = useState([]);
  const [referralSources, setReferralSources] = useState([]);
  const [waschenEmployees, setWaschenEmployees] = useState([]);
  const [loadingWilayah, setLoadingWilayah] = useState(false);

  const selectedReferral = referralSources.find(
    (row) => Number(row.id) === Number(form.referral_source_id)
  );
  const isWaschenReferral = String(selectedReferral?.code || '').toLowerCase() === 'waschen';

  useEffect(() => {
    const loadMaster = async () => {
      try {
        const [provinceRes, referralRes] = await Promise.all([
          api.get('/wilayah/provinces'),
          api.get('/wilayah/referral-sources'),
        ]);
        setProvinces(provinceRes.data.provinces || []);
        setReferralSources(referralRes.data.referral_sources || []);
      } catch (err) {
        console.error('[CustomerFormFields/master]', err.message);
      }
    };
    loadMaster();
  }, []);

  useEffect(() => {
    if (!isWaschenReferral) return;
    const loadEmployees = async () => {
      try {
        const { data } = await api.get('/pos-customers/waschen-employees');
        setWaschenEmployees(data.employees || []);
      } catch (err) {
        console.error('[CustomerFormFields/waschenEmployees]', err.message);
      }
    };
    loadEmployees();
  }, [isWaschenReferral]);

  useEffect(() => {
    const loadRegencies = async () => {
      if (!form.province_id) {
        setRegencies([]);
        return;
      }
      setLoadingWilayah(true);
      try {
        const { data } = await api.get('/wilayah/regencies', {
          params: { province_id: form.province_id },
        });
        setRegencies(data.regencies || []);
      } finally {
        setLoadingWilayah(false);
      }
    };
    loadRegencies();
  }, [form.province_id]);

  useEffect(() => {
    const loadDistricts = async () => {
      if (!form.regency_id) {
        setDistricts([]);
        return;
      }
      setLoadingWilayah(true);
      try {
        const { data } = await api.get('/wilayah/districts', {
          params: { regency_id: form.regency_id },
        });
        setDistricts(data.districts || []);
      } finally {
        setLoadingWilayah(false);
      }
    };
    loadDistricts();
  }, [form.regency_id]);

  useEffect(() => {
    const loadVillages = async () => {
      if (!form.district_id) {
        setVillages([]);
        return;
      }
      setLoadingWilayah(true);
      try {
        const { data } = await api.get('/wilayah/villages', {
          params: { district_id: form.district_id },
        });
        setVillages(data.villages || []);
      } finally {
        setLoadingWilayah(false);
      }
    };
    loadVillages();
  }, [form.district_id]);

  const updateField = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'province_id') {
        next.regency_id = '';
        next.district_id = '';
        next.village_id = '';
      }
      if (key === 'regency_id') {
        next.district_id = '';
        next.village_id = '';
      }
      if (key === 'district_id') {
        next.village_id = '';
      }
      if (key === 'referral_source_id') {
        const source = referralSources.find((row) => Number(row.id) === Number(value));
        const waschen = String(source?.code || '').toLowerCase() === 'waschen';
        if (!waschen) next.referral_employee_id = '';
      }
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block space-y-1.5 text-[12.5px] text-slate-600 md:col-span-2">
          <span className="font-medium">Nama</span>
          <input
            required
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            className={inputClass}
            placeholder="Contoh: Anada"
          />
        </label>
        <label className="block space-y-1.5 text-[12.5px] text-slate-600">
          <span className="font-medium">Telepon / WhatsApp</span>
          <input
            value={form.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            className={inputClass}
            placeholder="Contoh: 628111111"
          />
        </label>
        <label className="block space-y-1.5 text-[12.5px] text-slate-600">
          <span className="font-medium">Tanggal Lahir</span>
          <input
            type="date"
            value={form.birth_date}
            onChange={(e) => updateField('birth_date', e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block space-y-1.5 text-[12.5px] text-slate-600">
          <span className="font-medium">Provinsi</span>
          <select
            value={form.province_id}
            onChange={(e) => updateField('province_id', e.target.value)}
            className={inputClass}
          >
            <option value="">Pilih provinsi</option>
            {provinces.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5 text-[12.5px] text-slate-600">
          <span className="font-medium">Kabupaten / Kota</span>
          <select
            value={form.regency_id}
            onChange={(e) => updateField('regency_id', e.target.value)}
            disabled={!form.province_id}
            className={inputClass}
          >
            <option value="">Pilih kabupaten/kota</option>
            {regencies.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5 text-[12.5px] text-slate-600">
          <span className="font-medium">Kecamatan</span>
          <select
            value={form.district_id}
            onChange={(e) => updateField('district_id', e.target.value)}
            disabled={!form.regency_id}
            className={inputClass}
          >
            <option value="">Pilih kecamatan</option>
            {districts.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5 text-[12.5px] text-slate-600">
          <span className="font-medium">Kelurahan</span>
          <select
            value={form.village_id}
            onChange={(e) => updateField('village_id', e.target.value)}
            disabled={!form.district_id}
            className={inputClass}
          >
            <option value="">Pilih kelurahan</option>
            {villages.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loadingWilayah && (
        <p className="text-[11.5px] text-slate-400">Memuat data wilayah...</p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block space-y-1.5 text-[12.5px] text-slate-600">
          <span className="font-medium">Nomor Rumah</span>
          <input
            value={form.house_number}
            onChange={(e) => updateField('house_number', e.target.value)}
            className={inputClass}
            placeholder="Contoh: 14"
          />
        </label>
        <label className="block space-y-1.5 text-[12.5px] text-slate-600">
          <span className="font-medium">Tahu Cleanox Dari</span>
          <select
            value={form.referral_source_id}
            onChange={(e) => updateField('referral_source_id', e.target.value)}
            className={inputClass}
          >
            <option value="">Pilih sumber</option>
            {referralSources.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        {isWaschenReferral && (
          <label className="block space-y-1.5 text-[12.5px] text-slate-600">
            <span className="font-medium">Pegawai Waschen</span>
            <select
              required
              value={form.referral_employee_id}
              onChange={(e) => updateField('referral_employee_id', e.target.value)}
              className={inputClass}
            >
              <option value="">Pilih pegawai</option>
              {waschenEmployees.map((row) => (
                <option key={row.employee_id} value={row.employee_id}>
                  {row.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block space-y-1.5 text-[12.5px] text-slate-600 md:col-span-2">
          <span className="font-medium">Detail Lengkap (Nama Jalan)</span>
          <textarea
            rows={2}
            value={form.street_detail}
            onChange={(e) => updateField('street_detail', e.target.value)}
            className={inputClass}
            placeholder="Contoh: Jl. Melati Raya Blok A"
          />
        </label>
        <label className="block space-y-1.5 text-[12.5px] text-slate-600 md:col-span-2">
          <span className="font-medium">Catatan Patokan Alamat</span>
          <textarea
            rows={2}
            value={form.address_note}
            onChange={(e) => updateField('address_note', e.target.value)}
            className={inputClass}
            placeholder="Contoh: Sebelah warung makan, pagar hitam"
          />
        </label>
      </div>

      {(showTier || showStatus) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {showTier && (
            <label className="block space-y-1.5 text-[12.5px] text-slate-600">
              <span className="font-medium">Tier (opsional)</span>
              <input
                value={form.tier}
                onChange={(e) => updateField('tier', e.target.value)}
                placeholder="Contoh: Regular"
                className={inputClass}
              />
            </label>
          )}
          {showStatus && (
            <label className="block space-y-1.5 text-[12.5px] text-slate-600">
              <span className="font-medium">Status</span>
              <select
                value={form.status}
                onChange={(e) => updateField('status', e.target.value)}
                className={inputClass}
              >
                <option value="Aktif">Aktif</option>
                <option value="Nonaktif">Nonaktif</option>
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
