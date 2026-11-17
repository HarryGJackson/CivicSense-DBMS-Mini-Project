'use client';

import { useRouter } from 'next/navigation';

const STATUSES = ['OPEN', 'ROUTED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export default function Filters({ wards, categories, current }) {
  const router = useRouter();

  function change(key, value) {
    const params = new URLSearchParams(current);
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/complaints?${params.toString()}`);
  }

  return (
    <div className="card tight">
      <div className="row">
        <select value={current.ward || ''} onChange={(e) => change('ward', e.target.value)}
                style={{ width: 'auto', minWidth: 150 }}>
          <option value="">All wards</option>
          {wards.map((w) => (
            <option key={w.ward_id} value={w.ward_id}>{w.ward_name}</option>
          ))}
        </select>

        <select value={current.category || ''} onChange={(e) => change('category', e.target.value)}
                style={{ width: 'auto', minWidth: 180 }}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
          ))}
        </select>

        <select value={current.status || ''} onChange={(e) => change('status', e.target.value)}
                style={{ width: 'auto', minWidth: 140 }}>
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>

        {(current.ward || current.category || current.status) && (
          <button className="secondary small" onClick={() => router.push('/complaints')}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
