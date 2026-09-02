import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { DEMO_USERS, DEMO_PASSWORD, ROLES } from '../data/roles'
import { KPIS } from '../data/insights'
import { compact } from '../lib/format'
import Logo from '../components/Logo'
import Icon from '../lib/icons'

export default function Login() {
  const { signIn } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  // Prefill only in dev; the public site starts with empty credentials.
  const isDev = import.meta.env.DEV
  const [email, setEmail] = useState(isDev ? 'warehouse@megawide.com.ph' : '')
  const [password, setPassword] = useState(isDev ? DEMO_PASSWORD : '')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const k = KPIS()

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await signIn(email.trim(), password)
    setBusy(false)
    if (error) setError(error.message || 'Unable to sign in. Check your credentials.')
    else navigate('/dashboard')
  }

  const quick = (u) => {
    setEmail(u.email)
    setPassword(DEMO_PASSWORD)
  }

  return (
    <div className="login-wrap">
      <div className="login-hero">
        <Logo variant="white" height={44} />
        <div>
          <h1>Warehouse Management System</h1>
          <p>
            End-to-end inventory monitoring, material movement, and reservations for Megawide's
            construction operations — built for warehouse, procurement, project site, and management
            teams.
          </p>
          {/* The dataset lives in Postgres behind the login, so before signing in
              there are no figures to show. Rendering the tiles anyway would display
              three confident zeroes, which reads as an empty warehouse rather than
              as "not loaded yet". */}
          {k.skuCount > 0 && (
            <div className="hero-stats" style={{ marginTop: 28 }}>
              <div>
                <div className="n">{compact(k.total)}</div>
                <div className="l">Units in stock</div>
              </div>
              <div>
                <div className="n">{k.skuCount}</div>
                <div className="l">Active SKUs</div>
              </div>
              <div>
                <div className="n">₱{compact(k.value)}</div>
                <div className="l">Inventory value</div>
              </div>
            </div>
          )}
        </div>
        <div style={{ opacity: 0.85, fontSize: 12 }}>Engineering a First-World Philippines · © {new Date().getFullYear()} Megawide Construction Corporation</div>
      </div>

      <div className="login-form-side">
        <div className="login-card">
          <div className="spread" style={{ marginBottom: 24 }}>
            <div className="chip"><Icon name="warehouse" size={14} /> Enterprise Portal</div>
            <button className="icon-btn" onClick={toggle} title="Toggle theme">
              <Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} />
            </button>
          </div>
          <h2>Sign in</h2>
          <p className="muted" style={{ marginTop: 0, marginBottom: 22 }}>Access your warehouse dashboard.</p>

          <form onSubmit={submit}>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label>Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            <div className="spread" style={{ margin: '14px 0 18px' }}>
              <label className="checkbox">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me
              </label>
              <a className="link" href="#" onClick={(e) => e.preventDefault()}>Forgot password?</a>
            </div>
            {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Signing in…' : 'Login'}
            </button>
          </form>

          {/* Demo quick sign-in — dev builds only, never on the public site. */}
          {isDev && (
            <>
              <div className="divider" />
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Quick sign-in as a role (demo)</div>
              <div className="demo-roles">
                {DEMO_USERS.map((u) => (
                  <button key={u.email} className="demo-role" onClick={() => quick(u)}>
                    <b>{ROLES[u.role].short}</b>
                    <span>{u.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
