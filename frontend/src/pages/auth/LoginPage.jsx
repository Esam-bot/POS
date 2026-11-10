import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Field, TextInput } from '../../components/ui/Input';
import Button from '../../components/ui/Button';

export default function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Admin@123');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
    <div className="relative flex h-full min-h-0 items-center justify-center overflow-y-auto bg-[var(--color-surface)] px-4 py-8 text-[var(--color-ink)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(circle at 15% 20%, rgba(15,107,92,0.18), transparent 40%), radial-gradient(circle at 85% 10%, rgba(196,92,38,0.12), transparent 35%), linear-gradient(180deg, #eef2f6 0%, #f7f8fb 100%)',
        }}
      />
      <div className="theme-light relative w-full max-w-md rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-8 shadow-xl shadow-slate-200/60">
        <div className="mb-8">
          <p className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--color-brand)]">
            Demo Restaurant
          </p>
          <h1 className="mt-2 text-xl font-semibold text-[var(--color-ink)]">Sign in</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Access admin or POS with your employee account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Username" required>
            <TextInput
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Password" required>
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
