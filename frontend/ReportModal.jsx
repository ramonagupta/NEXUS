import { useEffect, useMemo, useRef, useState } from 'react';
import './auth.css';
import { FOLLOW_UPS, SERVICE_TITLE, EMPTY_ANSWERS, toAdditionalServices } from './followUps';

// the report types the backend accepts
const TYPES = ['fire', 'police', 'medical'];
const TYPE_LABEL = { fire: 'Fire', police: 'Police', medical: 'Medical' };
const STEP_TITLES = { details: 'Report an Emergency', extras: 'Additional Help', confirm: 'Check and Submit' };

const STEPS = ['details', 'extras', 'confirm'];
const SERVICE_LABEL = { medical: 'Ambulance', fire: 'Fire engine', police: 'Police unit' };

export default function ReportModal({ open, isOpen, city, onClose, onSubmit }) {
  // the places a report can be made: the localities of the map the backend sent
  const LOCATIONS = useMemo(() => city.nodes.filter((n) => n.kind === 'junction'), [city]);
  const EMPTY_FORM = useMemo(
    () => ({ title: '', type: 'fire', locationNode: LOCATIONS[0]?.id || '', address: '', peopleCount: 1 }),
    [LOCATIONS],
  );

  // Support both 'open' and 'isOpen' passed from parent components
  const isVisible = open ?? isOpen ?? false;

  const [step, setStep] = useState('details');
  const [form, setForm] = useState(EMPTY_FORM);
  const [answers, setAnswers] = useState(EMPTY_ANSWERS);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const titleInputRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!isVisible) return undefined;
    if (step === 'details') titleInputRef.current?.focus();
    function handleKey(e) { if (e.key === 'Escape') cancelRef.current?.(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isVisible, step]);

  function reset() {
    setForm(EMPTY_FORM);
    setAnswers(EMPTY_ANSWERS);
    setStep('details');
    setConfirmed(false);
    setError(null);
  }

  function handleCancel() {
    if (submitting) return;
    reset();
    onClose();
  }
  cancelRef.current = handleCancel;

  if (!isVisible) return null;

  const questions = FOLLOW_UPS[form.type] || [];
  const extras = toAdditionalServices(form.type, answers);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (field === 'type') setAnswers(EMPTY_ANSWERS);
  }

  function setAnswer(service, patch) {
    setAnswers((a) => ({ ...a, [service]: { ...a[service], ...patch } }));
  }

  function goToExtras(e) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) return setError('Please describe the emergency in a few words.');
    if (!form.address.trim()) return setError('Please enter an address or a nearby landmark.');
    if (form.peopleCount === '' || Number(form.peopleCount) < 1) return setError('Please enter how many people are affected.');
    setStep('extras');
  }

  function goToConfirm(e) {
    e.preventDefault();
    setError(null);
    if (questions.includes('medical') && answers.medical.needed) {
      const n = Number(answers.medical.peopleCount);
      if (!Number.isInteger(n) || n < 1) return setError('Please enter how many people need medical attention.');
    }
    setStep('confirm');
  }

  async function handleConfirm() {
    if (!confirmed) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        ...form,
        title: form.title.trim(),
        address: form.address.trim(),
        peopleCount: Number(form.peopleCount),
        confirmedReal: true,
        additionalServices: extras,
      });
      reset();
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const locationName = LOCATIONS.find((n) => n.id === form.locationNode)?.name || form.locationNode;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && handleCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
        <div className="step-label">Step {STEPS.indexOf(step) + 1} of {STEPS.length}</div>
        <div className="step-dots" aria-hidden="true">
          {STEPS.map((s) => (
            <span key={s} className={s === step ? 'active' : ''} />
          ))}
        </div>
        <h2 id="report-modal-title">{STEP_TITLES[step]}</h2>

        {step === 'details' && (
          <form onSubmit={goToExtras}>
            <div className="field">
              <label>Description</label>
              <input
                ref={titleInputRef}
                type="text"
                placeholder="e.g. Shop fire"
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
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
                  >
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Area</label>
              <select value={form.locationNode} onChange={(e) => update('locationNode', e.target.value)}>
                {LOCATIONS.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Address / Landmark</label>
              <input
                type="text"
                placeholder="e.g. Opposite Clock Tower"
                value={form.address}
                onChange={(e) => update('address', e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label>People Affected</label>
              <input
                type="number"
                min="1"
                value={form.peopleCount}
                onChange={(e) => update('peopleCount', e.target.value)}
                required
              />
            </div>

            {error && <p className="form-error" role="alert">{error}</p>}

            <div className="modal-actions">
              <button type="button" className="btn-sec" onClick={handleCancel}>Cancel</button>
              <button type="submit" className="btn-prim">Continue</button>
            </div>
          </form>
        )}

        {step === 'extras' && (
          <form onSubmit={goToConfirm}>
            <p className="sub">Is any other help required at the place of the emergency?</p>

            {questions.map((svc) => {
              const on = answers[svc].needed;
              return (
                <div className={`svc-card ${on ? 'on' : ''}`} key={svc}>
                  <button type="button" className="svc-main" role="switch" aria-checked={on} onClick={() => setAnswer(svc, { needed: !on })}>
                    <strong>{SERVICE_TITLE[svc]}</strong>
                    <span className={`switch ${on ? 'on' : ''}`} aria-hidden="true" />
                  </button>
                  {svc === 'medical' && on && (
                    <div className="svc-count">
                      <span>How many people need medical attention?</span>
                      <input
                        type="number" min="1" step="1"
                        value={answers.medical.peopleCount}
                        onChange={(e) => setAnswer('medical', { peopleCount: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {error && <p className="form-error" role="alert">{error}</p>}

            <div className="modal-actions">
              <button type="button" className="btn-sec" onClick={() => { setError(null); setStep('details'); }}>Back</button>
              <button type="submit" className="btn-prim">Continue</button>
            </div>
          </form>
        )}

        {step === 'confirm' && (
          <div>
            <div className="overview">
              <div className="ov-head">
                <span className={`ov-tag ${form.type}`}>{TYPE_LABEL[form.type]}</span>
                <strong>{form.title}</strong>
              </div>
              <div className="ov-line">📍 {form.address}, {locationName}</div>
              <div className="ov-line">👥 {form.peopleCount} {Number(form.peopleCount) === 1 ? 'person' : 'people'} affected</div>
              <div className="ov-help">
                <span>ADDITIONAL HELP REQUESTED</span>
                <div className="chips">
                  {extras.length === 0 && <span className="chip">None</span>}
                  {extras.map((x) => (
                    <span className="chip main" key={x.type}>
                      {SERVICE_LABEL[x.type]}{x.type === 'medical' ? ` · ${x.peopleCount} ${x.peopleCount === 1 ? 'person' : 'people'}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <label className="confirm-check">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={submitting} />
              <span>I confirm this emergency is happening right now. I understand that false reports can lead to legal action.</span>
            </label>

            {error && <p className="form-error" role="alert">{error}</p>}

            <div className="modal-actions">
              <button type="button" className="btn-sec" onClick={() => { setError(null); setStep('extras'); }} disabled={submitting}>Back</button>
              <button type="button" className="btn-prim" onClick={handleConfirm} disabled={!confirmed || submitting}>
                {submitting ? 'Sending…' : 'Submit Report'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
