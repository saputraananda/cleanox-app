import { useEffect, useState } from 'react';
import {
  getMethodsInGroup,
  getMethodsInSubGroup,
  getPaymentMethodGroups,
  getSubGroups,
} from '@web/utils/posPaymentMethods.js';

const TONE_ACTIVE = {
  slate: 'border-slate-900 bg-slate-900 text-white',
  indigo: 'border-indigo-700 bg-indigo-700 text-white',
};

const TONE_SIZE = {
  slate: 'px-3.5 py-2 text-sm',
  indigo: 'px-3 py-1.5 text-xs',
};

const INACTIVE_BUTTON = 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50';

function findMethod(paymentMethods, value) {
  if (!value) return null;
  return paymentMethods.find((m) => Number(m.id) === Number(value)) || null;
}

export default function PaymentMethodPicker({
  paymentMethods = [],
  value = '',
  onChange,
  excludeGroups = [],
  tone = 'slate',
  allowClear = false,
}) {
  const initialMethod = findMethod(paymentMethods, value);
  const [group, setGroup] = useState(initialMethod?.method_group || '');
  const [subGroup, setSubGroup] = useState(String(initialMethod?.sub_group || '').trim());

  useEffect(() => {
    const method = findMethod(paymentMethods, value);
    if (!method) return;
    setGroup(method.method_group || '');
    setSubGroup(String(method.sub_group || '').trim());
  }, [value, paymentMethods]);

  const methods = paymentMethods.filter(
    (m) => !excludeGroups.includes(String(m.method_group || ''))
  );
  const groups = getPaymentMethodGroups(methods);
  const inGroup = getMethodsInGroup(methods, group);
  const subGroups = getSubGroups(inGroup);
  const candidates =
    subGroups.length > 0
      ? subGroup
        ? getMethodsInSubGroup(methods, group, subGroup)
        : []
      : inGroup;
  const selected = candidates.find((m) => Number(m.id) === Number(value)) || null;

  const activeClass = TONE_ACTIVE[tone] || TONE_ACTIVE.slate;
  const groupSizeClass = TONE_SIZE[tone] || TONE_SIZE.slate;

  const handleGroupClick = (nextGroup) => {
    setGroup(nextGroup);
    setSubGroup('');
    const groupMethods = getMethodsInGroup(methods, nextGroup);
    if (getSubGroups(groupMethods).length === 0 && groupMethods.length === 1) {
      onChange(String(groupMethods[0].id), groupMethods[0], nextGroup);
      return;
    }
    onChange('', null, nextGroup);
  };

  const handleSubGroupClick = (nextSubGroup) => {
    setSubGroup(nextSubGroup);
    const subMethods = getMethodsInSubGroup(methods, group, nextSubGroup);
    if (subMethods.length === 1) {
      onChange(String(subMethods[0].id), subMethods[0], group);
      return;
    }
    if (subMethods.some((m) => Number(m.id) === Number(value))) return;
    onChange('', null, group);
  };

  const handleClear = () => {
    setGroup('');
    setSubGroup('');
    onChange('', null, '');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => handleGroupClick(g)}
            className={`rounded-xl border font-semibold transition ${groupSizeClass} ${
              group === g ? activeClass : INACTIVE_BUTTON
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {subGroups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {subGroups.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSubGroupClick(s)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                subGroup === s ? activeClass : INACTIVE_BUTTON
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {candidates.length > 1 && (
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-slate-600">
            {`Pilih ${group}${subGroup ? ` ${subGroup}` : ''}`}
          </span>
          <select
            value={selected ? String(selected.id) : ''}
            onChange={(e) => {
              const method = findMethod(candidates, e.target.value);
              onChange(e.target.value, method, group);
            }}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            <option value="">Pilih metode</option>
            {candidates.map((method) => (
              <option key={method.id} value={method.id}>
                {method.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {selected && candidates.length === 1 && group !== 'Collaboration' && (
        <p className="whitespace-pre-line rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          {selected.label || selected.name}
        </p>
      )}

      {allowClear && group && (
        <button
          type="button"
          onClick={handleClear}
          className="text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          Kosongkan
        </button>
      )}
    </div>
  );
}
