import { useEffect, useRef, useState } from 'react';
import { NODES } from './data';

const EMPTY_FORM = { title: '', type: 'fire', locationNode: NODES[0].id, address: '', peopleCount: 1 };
const TYPES = ['fire', 'accident', 'medical', 'other'];

export default function ReportModal({ open, onClose, onSubmit }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const titleInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    titleInputRef.current?.focus();
    function handleKey(e) { if (e.key === 'Escape') handleCancel(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!form.title.trim()) return setError('Give the emergency a short description.');
    if (!form.address.trim()) return setError('Add a street address or landmark.');
    if (form.peopleCount === '' || Number(form.peopleCount) < 1) return setError('Enter how many people are involved.');

    setSubmitting(true);
    try {
      await onSubmit({ ...form, title: form.title.trim(), address: form.address.trim(), peopleCount: Number(form.peopleCount) });
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err.message || 'Something went wrong — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    if (submitting) return;
    setForm(EMPTY_FORM);
    setError(null);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && handleCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
        <h2 id="report-modal-title">Report An Emergency</h2>
        <p className="sub">Provide basic situation details for optimal emergency dispatch.</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Emergency Description</label>
            <input
              ref={titleInputRef}
              type="text"
              placeholder="e.g. Structure Fire, Vehicle Collision"
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div className="field">
            <label>Emergency Type</label>
            <div className="type-grid">
              {TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`type-btn ${form.type === t ? 'active' : ''}`}
                  onClick={() => update('type', t)}
                  disabled={submitting}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Where is the emergency occurring?</label>
            <select value={form.locationNode} onChange={(e) => update('locationNode', e.target.value)} disabled={submitting}>
              {NODES.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </div>

          <div className="field">
            <label>Exact Street Address / Landmark</label>
            <input
              type="text"
              placeholder="e.g. Near Metro Gate 2"
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div className="field">
            <label>Estimated People Affected</label>
            <input
              type="number"
              min="1"
              value={form.peopleCount}
              onChange={(e) => update('peopleCount', e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-sec" onClick={handleCancel} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn-prim" disabled={submitting}>
              {submitting ? 'Dispatching…' : 'Dispatch Unit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
