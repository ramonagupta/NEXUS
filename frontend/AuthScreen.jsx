import { useEffect, useState } from 'react';
import * as api from './api';
import './auth.css';

const RESEND_SECONDS = 30;
const isValidPhone = (digits) => /^[6-9]\d{9}$/.test(digits);

const POINTS = [
  { title: 'Reports ranked by severity', accent: 'var(--red)' },
  { title: 'Nearest available unit dispatched', accent: 'var(--teal)' },
  { title: 'Routes updated for live traffic', accent: 'var(--steel)' },
];

export default function AuthScreen({ onLoggedIn }) {
  const [mode, setMode] = useState('signup');
  const [step, setStep] = useState('phone');
  const [digits, setDigits] = useState('');
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const phone = `+91${digits}`;

  function switchMode(next) {
    setMode(next);
    setError(null);
  }

  async function requestCode() {
    setError(null);
    setBusy(true);
    try {
      const result = await api.sendOtp({ phone, mode });
      setDevOtp(result?.devOtp ?? null);
      setOtp('');
      setStep('code');
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function submitPhone(e) {
    e.preventDefault();
    if (mode === 'signup' && name.trim().length < 2) return setError('Please enter your name.');
    if (!isValidPhone(digits)) return setError('Enter a valid 10-digit mobile number.');
    if (mode === 'signup' && !agreed) return setError('Please accept the terms to continue.');
    return requestCode();
  }

  async function submitCode(e) {
    e.preventDefault();
    if (otp.length !== 6) return setError('Enter the 6-digit code.');
    setError(null);
    setBusy(true);
    try {
      const user = await api.verifyOtp({ phone, otp, mode, name: mode === 'signup' ? name.trim() : undefined });
      return onLoggedIn(user);
    } catch (err) {
      setError(err.message);
      return setBusy(false);
    }
  }

  const title = step === 'code' ? 'Enter your code' : mode === 'signup' ? 'Create account' : 'Welcome back';
  const lead =
    step === 'code'
      ? 'We sent a 6-digit code by SMS.'
      : mode === 'signup'
        ? 'Verify your mobile number to start reporting emergencies.'
        : 'Log in with your mobile number. No password needed.';

  return (
    <div className="auth-stage">
      <div className="auth-shell">
        <aside className="auth-aside" aria-hidden="true">
          <h2 className="auth-headline">Nexus</h2>
          <p className="auth-tagline">Emergency management and resource optimisation system</p>
          <ul className="auth-services">
            {POINTS.map((p) => (
              <li key={p.title} style={{ '--accent': p.accent }}>{p.title}</li>
            ))}
          </ul>
        </aside>

        <div className="auth-card">
          <div id="recaptcha-container" />

          <h2 className="auth-title">{title}</h2>
          <p className="auth-lead">{lead}</p>

          <div className="auth-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} disabled={step === 'code'} onClick={() => switchMode('signup')}>
              Sign up
            </button>
            <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} disabled={step === 'code'} onClick={() => switchMode('login')}>
              Log in
            </button>
          </div>

          {step === 'phone' && (
            <form onSubmit={submitPhone} noValidate>
              {mode === 'signup' && (
                <div className="field">
                  <label htmlFor="auth-name">Full name</label>
                  <input id="auth-name" type="text" autoComplete="name" maxLength={60} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              )}

              <div className="field">
                <label htmlFor="auth-phone">Mobile number</label>
                <div className="phone-row">
                  <span className="phone-prefix">+91</span>
                  <input
                    id="auth-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={10}
                    placeholder="98765 43210"
                    autoFocus
                    value={digits}
                    onChange={(e) => setDigits(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>

              {mode === 'signup' && (
                <label className="auth-agree">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                  <span>I understand that false reports are an offence and that my number is recorded with every report.</span>
                </label>
              )}

              {error && <p className="form-error" role="alert">{error}</p>}

              <div className="modal-actions">
                <button type="submit" className="btn-prim" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
              </div>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={submitCode} noValidate>
              <p className="auth-sent">Code sent to <strong>+91 {digits}</strong></p>
              {devOtp && <p className="auth-notice">Demo mode: your code is {devOtp}</p>}

              <div className="field">
                <label htmlFor="auth-otp">6-digit code</label>
                <input
                  id="auth-otp"
                  className="otp-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="······"
                  autoFocus
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              {error && <p className="form-error" role="alert">{error}</p>}

              <div className="modal-actions">
                <button type="submit" className="btn-prim" disabled={busy}>
                  {busy ? 'Checking…' : mode === 'signup' ? 'Create account' : 'Log in'}
                </button>
              </div>

              <div className="auth-links">
                <button type="button" className="auth-link" disabled={busy} onClick={() => { setStep('phone'); setError(null); setOtp(''); }}>
                  Change number
                </button>
                <button type="button" className="auth-link" disabled={cooldown > 0 || busy} onClick={requestCode}>
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
