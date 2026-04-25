'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldAlert, Lock, Mail, Eye, EyeOff, FlaskConical } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [devModeLoading, setDevModeLoading] = useState(false)
  const [showDevMode, setShowDevMode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const { signIn, signOut, isAuthenticated, isLoading, isAdmin } = useAuth()

  useEffect(() => {
    if (isLoading) return

    if (isAuthenticated && isAdmin === true) {
      router.replace('/admin/dashboard')
      return
    }

    if (isAuthenticated && isAdmin === false) {
      setError('Access denied. This account does not have admin privileges.')
      void signOut()
    }
  }, [isAuthenticated, isAdmin, isLoading, router, signOut])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const host = window.location.hostname
    setShowDevMode(
      process.env.NODE_ENV === 'development' &&
      (host === 'localhost' || host === '127.0.0.1' || host === '::1')
    )
  }, [])

  // While auth state resolves, show a blank loading screen
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-slate-900 via-slate-800 to-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
      </div>
    )
  }

  // Already authenticated as admin, don't flash login UI
  if (isAuthenticated && isAdmin === true) return null

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const result = await signIn(email.trim(), password)
      if (!result.success) {
        throw new Error(result.error || 'Login failed. Please try again.')
      }

      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDevModeLogin = async () => {
    setDevModeLoading(true)
    setError(null)

    const devEmail = 'dev-admin@gavelogy.local'
    const devPassword = 'gavelogy-dev-admin'

    try {
      const result = await signIn(devEmail, devPassword)
      if (!result.success) {
        throw new Error(result.error || 'Dev mode sign-in failed.')
      }

      const promoteRes = await fetch('/api/auth/dev-admin', { method: 'POST' })
      const payload = await promoteRes.json().catch(() => null)

      if (!promoteRes.ok) {
        throw new Error(payload?.error || 'Failed to enable local dev admin access.')
      }

      router.replace('/admin/dashboard')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Dev mode login failed.')
    } finally {
      setDevModeLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo/Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 mb-4">
            <ShieldAlert className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Gavelogy Admin</h1>
          <p className="text-slate-400">Secure access for administrators only</p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8 shadow-2xl">
          {error && (
            <div className="bg-red-500/10 text-red-400 text-sm p-4 rounded-lg mb-6 border border-red-500/20 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-lg border border-slate-600 bg-slate-700/50 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  placeholder="admin@gavelogy.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3 rounded-lg border border-slate-600 bg-slate-700/50 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground py-3 px-4 rounded-lg font-semibold hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary/25"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Verifying access...
                </>
              ) : (
                <>
                  <ShieldAlert className="w-5 h-5" />
                  Sign In as Admin
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-700">
            <p className="text-center text-xs text-slate-500">
              Only authorized administrators can access this panel.
              <br />
              Regular users will be denied access.
            </p>

            {showDevMode && (
              <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/8 p-4">
                <div className="flex items-start gap-3">
                  <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-100">Local Dev Mode</p>
                    <p className="mt-1 text-xs leading-5 text-amber-200/80">
                      Creates or signs in a localhost-only dev user and grants admin access automatically for testing.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDevModeLogin}
                  disabled={devModeLoading || loading}
                  className="mt-4 w-full rounded-lg border border-amber-400/30 bg-amber-400/12 px-4 py-3 text-sm font-semibold text-amber-50 transition-all hover:bg-amber-400/18 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {devModeLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Entering Dev Mode...
                    </>
                  ) : (
                    <>
                      <FlaskConical className="w-4 h-4" />
                      Enter Dev Mode
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
