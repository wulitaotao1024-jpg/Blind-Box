import type { AuthUser } from '../lib/apiClient'

// 右上角登录入口：与左上 logo 药丸对称。
// 未登录 → 「登录」玻璃药丸（点击进 auth 屏）；已登录 → 用户名药丸 + 「退出」。
export default function AuthEntry({
  user,
  onLogin,
  onLogout,
}: {
  user: AuthUser | null
  onLogin: () => void
  onLogout: () => void
}) {
  if (!user) {
    return (
      <button className="auth-entry auth-entry--login" onClick={onLogin}>
        登录
      </button>
    )
  }
  return (
    <div className="auth-entry auth-entry--user">
      <span className="auth-entry__name" title={`已登录：${user.username}`}>
        {user.username}
      </span>
      <button className="auth-entry__logout" onClick={onLogout}>
        退出
      </button>
    </div>
  )
}
