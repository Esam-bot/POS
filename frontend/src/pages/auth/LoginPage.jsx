import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LockKeyhole, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { settingsApi } from '../../services/billingService';
import { setDefaultCurrency } from '../../utils/formatMoney';
import { Field, TextInput } from '../../components/ui/Input';
import Button from '../../components/ui/Button';

export default function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [brandName, setBrandName] = useState('Restaurant');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    settingsApi
      .publicBranding()
      .then((data) => {
        if (cancelled) return;
        setBrandName(data?.name || 'Restaurant');
        if (data?.currencyCode) setDefaultCurrency(data.currencyCode);
      })
      .catch(() => {
        if (!cancelled) setBrandName('Restaurant');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && isAuthenticated) {
    return <Navigate to={location.state?.from?.pathname || '/admin'} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(username.trim(), password);
      if (
        user.permissions?.includes('pos.access') &&
        user.roles?.includes('CASHIER') &&
        !user.roles?.includes('ADMIN')
      ) {
        navigate('/pos');
      } else {
        navigate('/admin');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to sign in');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-[var(--color-surface)] px-4 py-10 text-[var(--color-ink)]">
      <div className="theme-light w-full max-w-md">
        <div className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-panel)] p-8 shadow-[var(--shadow-card)]">
          <div className="mb-6 text-center">
            <p className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--color-ink)]">
              {brandName}
            </p>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Admin Console</p>
          </div>

          <div className="mb-6">
            <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-[var(--color-ink)]">
              Sign in
            </h1>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              Access admin or POS with your employee account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Username" required>
              <div className="relative">
                <UserRound
                  size={16}
                  strokeWidth={1.75}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)]"
                />
                <TextInput
                  className="pl-9"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </Field>
            <Field label="Password" required>
              <div className="relative">
                <LockKeyhole
                  size={16}
                  strokeWidth={1.75}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)]"
                />
                <TextInput
                  className="pl-9"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
            </Field>

            {error && (
              <p className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--color-danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_8%,white)] px-3 py-2 text-sm text-[var(--color-danger)]">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
