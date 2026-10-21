import { useState } from 'react'
import { api, ApiError } from '../lib/apiClient'
import type { MeDto } from '../lib/apiClient'

// 登录 / 注册屏（PRD：账号密码，皮克斯黄昏风，与揭晓屏同源皮肤）。
// 双 tab：登录 / 注册；成功后拉取 /api/me 全量状态交回 App（统一会话恢复入口）。
export default function Auth({
  onSkip,
  onAuthed,
}: {
  onSkip: () => void
  onAuthed: (me: MeDto) => void
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setErrorCode(null)
    const name = username.trim()
    if (name.length < 2 || name.length > 20) {
      setError('用户名需 2-20 位（字母、数字、下划线或中文）')
      return
    }
    if (password.length < 8 || password.length > 64) {
      setError('密码需 8-64 位')
      return
    }
    setLoading(true)
    try {
      if (mode === 'register') {
        await api.register(name, password)
      } else {
        await api.login(name, password)
      }
      // 拉全量会话状态（box/cards/supply/drawsLeft）交回 App
      const me = await api.me()
      onAuthed(me)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '网络开小差了，请稍后再试')
      setErrorCode(err instanceof ApiError ? err.code ?? null : null)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (next: 'login' | 'register') => {
    setMode(next)
    setError(null)
    setErrorCode(null)
  }

  return (
    <div className="auth">
      <div className="auth__bg" aria-hidden="true" />
      <div className="auth__stars" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <span
            key={i}
            className="auth__star"
            style={{
              left: `${8 + ((i * 137) % 84)}%`,
              top: `${10 + ((i * 53) % 56)}%`,
              fontSize: `${7 + ((i * 23) % 9)}px`,
              animationDelay: `${((i * 41) % 22) / 10}s`,
            }}
          >
            ✦
          </span>
        ))}
      </div>

      <button className="auth__skip" onClick={onSkip} aria-label="跳过，返回首页">
        跳过 ›
      </button>

      <div className="auth__panel">
        <div className="brand brand--pill auth__brand">
          <span className="brand__zh">盒隙</span>
          <span className="brand__en">BLINDGAP</span>
        </div>

        <h1 className="auth__title">进入第六大道</h1>

        <div className="auth__tabs" role="tablist">
          <button
            role="tab"
            aria-selected={mode === 'login'}
            className={`auth__tab${mode === 'login' ? ' is-active' : ''}`}
            onClick={() => switchMode('login')}
          >
            登录
          </button>
          <button
            role="tab"
            aria-selected={mode === 'register'}
            className={`auth__tab${mode === 'register' ? ' is-active' : ''}`}
            onClick={() => switchMode('register')}
          >
            注册
          </button>
        </div>

        <form className="auth__form" onSubmit={submit}>
          <label className="auth__field">
            <span className="auth__label">用户名</span>
            <input
              className="auth__input"
              type="text"
              autoComplete="username"
              placeholder="2-20 位，字母/数字/下划线/中文"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={20}
            />
          </label>
          <label className="auth__field">
            <span className="auth__label">密码</span>
            <input
              className="auth__input"
              type="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              placeholder="8-64 位"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={64}
            />
          </label>

          {error && (
            <p className="auth__error" role="alert">
              {error}
              {errorCode === 'NO_USER' && (
                <button type="button" className="auth__error-action" onClick={() => switchMode('register')}>
                  去注册 ›
                </button>
              )}
              {errorCode === 'USERNAME_TAKEN' && (
                <button type="button" className="auth__error-action" onClick={() => switchMode('login')}>
                  去登录 ›
                </button>
              )}
            </p>
          )}

          <button className="btn btn--gold auth__submit" type="submit" disabled={loading}>
            {loading ? '处理中…' : mode === 'register' ? '注册并进入' : '登录'}
          </button>
        </form>

        <p className="auth__foot">
          {mode === 'register' ? '已有账号？' : '还没有账号？'}
          <button
            type="button"
            className="auth__link"
            onClick={() => switchMode(mode === 'register' ? 'login' : 'register')}
          >
            {mode === 'register' ? '去登录' : '去注册'}
          </button>
        </p>
      </div>
    </div>
  )
}
