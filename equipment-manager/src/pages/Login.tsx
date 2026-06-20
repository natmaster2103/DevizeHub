import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    setError('')
    setLoading(true)
    try {
      await login({ username, password })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') submit()
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, var(--bg) 0%, var(--surface-2) 100%)', padding: 24
    }}>
      <div style={{
        width: 380, background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--rad-lg)', boxShadow: '0 12px 40px rgba(15,23,42,.12)', padding: '36px 32px'
      }}>
        {/* Logo + title */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 26 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 'var(--rad-lg)', background: 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 18px color-mix(in srgb, var(--primary) 35%, transparent)'
          }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.01em' }}>Quản lý Thiết bị</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Hệ thống cấp phát nội bộ</div>
          </div>
        </div>

        {/* Username */}
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Tên đăng nhập</label>
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={onKeyDown}
          style={{
            width: '100%', height: 40, padding: '0 12px', border: '1px solid var(--border)',
            borderRadius: 'var(--rad-sm)', background: 'var(--surface-2)', color: 'var(--text)',
            fontSize: 14, marginBottom: 16, outline: 'none', boxSizing: 'border-box'
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.background = 'var(--surface)' }}
          onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.background = 'var(--surface-2)' }}
        />

        {/* Password */}
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Mật khẩu</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={onKeyDown}
          style={{
            width: '100%', height: 40, padding: '0 12px', border: '1px solid var(--border)',
            borderRadius: 'var(--rad-sm)', background: 'var(--surface-2)', color: 'var(--text)',
            fontSize: 14, marginBottom: 8, outline: 'none', boxSizing: 'border-box'
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.background = 'var(--surface)' }}
          onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.background = 'var(--surface-2)' }}
        />

        {/* Remember + forgot */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 22px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" defaultChecked style={{ accentColor: 'var(--primary)' }} />
            Ghi nhớ đăng nhập
          </label>
          <span style={{ fontSize: 13, color: 'var(--primary)', cursor: 'pointer' }}>Quên mật khẩu?</span>
        </div>

        {/* Error */}
        {error && (
          <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 10 }}>{error}</div>
        )}

        {/* Login button */}
        <button
          onClick={submit}
          disabled={loading}
          style={{
            width: '100%', height: 42, border: 'none', borderRadius: 'var(--rad-sm)',
            background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
            boxShadow: '0 4px 12px color-mix(in srgb, var(--primary) 30%, transparent)'
          }}
          onMouseEnter={e => { if (!loading) (e.target as HTMLButtonElement).style.background = 'var(--primary-hover)' }}
          onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'var(--primary)' }}
        >
          {loading ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 20 }}>
          Phiên bản 2.4.1 · Ngoại tuyến
        </div>
      </div>
    </div>
  )
}
