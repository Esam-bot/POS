import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ permission, anyOf }) {
  const { isAuthenticated, loading, hasPermission, hasAnyPermission } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface)] text-[var(--color-ink-muted)]">
        Loading session…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/admin" replace />;
  }

  if (anyOf?.length && !hasAnyPermission(...anyOf)) {
    return <Navigate to="/admin" replace />;
  }

  return <Outlet />;
}
