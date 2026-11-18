import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';

interface AuthContextValue {
  authEnabled: boolean;
  authenticated: boolean;
  expiresAt: number | null;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  authEnabled: false,
  authenticated: true,
  expiresAt: null,
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

interface AuthStatusResponse {
  ok?: boolean;
  authEnabled: boolean;
  authenticated: boolean;
  expiresAt: number | null;
}

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [checking, setChecking] = useState(true);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [expiredNotice, setExpiredNotice] = useState(false);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status', { credentials: 'include' });
      const data = (await res.json()) as AuthStatusResponse;
      setAuthEnabled(Boolean(data.authEnabled));
      setAuthenticated(Boolean(data.authenticated));
      setExpiresAt(data.expiresAt ?? null);
    } catch {
      // keep previous state on transient network glitch
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  // Automatic 4h expiration enforcement on client + backend 401 listener
  useEffect(() => {
    const handleUnauthorized = () => {
      setAuthenticated(false);
      setExpiresAt(null);
      setExpiredNotice(true);
    };

    window.addEventListener('scalpengine:unauthorized', handleUnauthorized);

    let expiryTimer: number | null = null;
    if (authEnabled && authenticated && expiresAt) {
      const msLeft = Math.max(0, expiresAt - Date.now());
      expiryTimer = window.setTimeout(() => {
        setAuthenticated(false);
        setExpiresAt(null);
        setExpiredNotice(true);
      }, msLeft + 500);
    }

    return () => {
      window.removeEventListener('scalpengine:unauthorized', handleUnauthorized);
      if (expiryTimer) window.clearTimeout(expiryTimer);
    };
  }, [authEnabled, authenticated, expiresAt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    setExpiredNotice(false);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as AuthStatusResponse & { error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || 'Nieprawidłowe hasło.');
        return;
      }
      setPassword('');
      setAuthEnabled(Boolean(data.authEnabled));
      setAuthenticated(Boolean(data.authenticated));
      setExpiresAt(data.expiresAt ?? null);
    } catch {
      setError('Błąd połączenia z serwerem logowania.');
    } finally {
      setSubmitting(false);
    }
  };

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      if (authEnabled) {
        setAuthenticated(false);
        setExpiresAt(null);
        setExpiredNotice(false);
      }
    }
  }, [authEnabled]);

  if (checking) {
    return (
      <div className="min-h-screen bg-surface-container-lowest text-on-surface flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          <span className="font-mono text-xs text-on-surface-variant uppercase tracking-wider">
            Weryfikacja sesji terminala...
          </span>
        </div>
      </div>
    );
  }

  if (authEnabled && !authenticated) {
    return (
      <div className="min-h-screen bg-surface-container-lowest text-on-surface flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-surface-container-low border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-surface-container-high border border-primary/30 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
                <path
                  d="M4 16L9 10L13 13.5L20 6"
                  stroke="#4ced9f"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M16 6H20V10"
                  stroke="#f7a600"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="9" cy="10" r="1.8" fill="#ffc97d" />
                <circle cx="13" cy="13.5" r="1.8" fill="#ffc97d" />
              </svg>
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-on-surface tracking-tight">
                ScalpEngine Terminal
              </h1>
              <p className="font-mono text-[11px] text-on-surface-variant">
                Bybit v5 · Autonomiczny Bot 24/7
              </p>
            </div>
          </div>

          {expiredNotice && (
            <div className="px-3.5 py-2.5 rounded-lg bg-primary-container/15 border border-primary/30 text-primary font-mono text-xs">
              Sesja wygasła po 4 godzinach. Zaloguj się ponownie, aby uzyskać dostęp do panelu.
            </div>
          )}

          {error && (
            <div className="px-3.5 py-2.5 rounded-lg bg-error-container/25 border border-error/40 text-error font-mono text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="terminal-password"
                className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold"
              >
                Hasło dostępu (Railway Variable)
              </label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-on-surface-variant absolute left-3 pointer-events-none" />
                <input
                  id="terminal-password"
                  type={showPassword ? 'text' : 'password'}
                  autoFocus
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Wpisz hasło z APP_PASSWORD..."
                  className="w-full bg-surface-container-lowest border border-white/10 focus:border-primary/60 rounded-lg pl-9 pr-10 py-2.5 font-mono text-sm text-on-surface focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
                  className="absolute right-2.5 p-1 text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!password || submitting}
              className="w-full py-2.5 px-4 rounded-lg bg-primary-container hover:bg-primary text-on-primary-container font-display text-sm font-bold transition-colors disabled:opacity-50"
            >
              {submitting ? 'Logowanie...' : 'Odblokuj Terminal'}
            </button>
          </form>

          <div className="flex items-center justify-between pt-3 border-t border-white/5 font-mono text-[10px] text-on-surface-variant">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-tertiary" />
              Cookie HttpOnly · HMAC-SHA256
            </span>
            <span>Ważność sesji: 4h</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ authEnabled, authenticated, expiresAt, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
