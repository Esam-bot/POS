import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Banknote,
  ClipboardList,
  CheckCircle,
  ChefHat,
  Package,
  AlertTriangle,
  ShoppingBag,
} from 'lucide-react';
import api from '../../services/api';
import { money } from '../../utils/formatMoney';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import ChartCard from '../../components/ui/ChartCard';
import EmptyState from '../../components/ui/EmptyState';
import Badge from '../../components/ui/Badge';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

const GREEN = '#16A36A';
const INK = '#202124';
const GREY = '#E8EAED';
const MUTED = '#777D85';
const RED = '#E05252';
const WARN = '#E9A23B';

const statusTone = {
  PLACED: 'warning',
  CONFIRMED: 'brand',
  PREPARING: 'warning',
  READY: 'success',
  SERVED: 'success',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  OUT_FOR_DELIVERY: 'brand',
  DELIVERED: 'success',
};

function shortDay(isoDate) {
  try {
    const d = new Date(`${isoDate}T12:00:00`);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return isoDate;
  }
}

export default function DashboardPage() {
  const { hasPermission } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!hasPermission('reports.view')) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get('/dashboard/overview');
        if (!cancelled) {
          setData(res.data.data);
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Failed to load dashboard');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [hasPermission]);

  const salesChart = useMemo(() => {
    const trend = data?.salesTrend || [];
    return {
      labels: trend.map((t) => shortDay(t.date)),
      datasets: [
        {
          label: 'Sales',
          data: trend.map((t) => Number(t.revenue || 0)),
          borderColor: GREEN,
          backgroundColor: 'rgba(22, 163, 106, 0.12)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: GREEN,
        },
      ],
    };
  }, [data]);

  const ordersChart = useMemo(() => {
    const trend = data?.ordersTrend || [];
    return {
      labels: trend.map((t) => shortDay(t.date)),
      datasets: [
        {
          label: 'Total',
          data: trend.map((t) => t.total || 0),
          backgroundColor: GREEN,
          borderRadius: 4,
        },
        {
          label: 'Completed',
          data: trend.map((t) => t.completed || 0),
          backgroundColor: INK,
          borderRadius: 4,
        },
        {
          label: 'Cancelled',
          data: trend.map((t) => t.cancelled || 0),
          backgroundColor: RED,
          borderRadius: 4,
        },
      ],
    };
  }, [data]);

  const statusChart = useMemo(() => {
    const rows = data?.ordersByStatus || [];
    const colors = [GREEN, WARN, INK, MUTED, RED, '#5B8DEF', '#9B59B6', '#16A36A'];
    return {
      labels: rows.map((r) => String(r.status || '').replaceAll('_', ' ')),
      datasets: [
        {
          data: rows.map((r) => r.count),
          backgroundColor: rows.map((_, i) => colors[i % colors.length]),
          borderWidth: 0,
        },
      ],
    };
  }, [data]);

  const topChart = useMemo(() => {
    const rows = [...(data?.topSellingItems || [])].reverse();
    return {
      labels: rows.map((r) => r.name),
      datasets: [
        {
          label: 'Qty sold',
          data: rows.map((r) => Number(r.quantity || 0)),
          backgroundColor: GREEN,
          borderRadius: 4,
        },
      ],
    };
  }, [data]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, labels: { color: MUTED, boxWidth: 12 } },
      tooltip: {
        backgroundColor: INK,
        titleColor: '#fff',
        bodyColor: '#fff',
      },
    },
    scales: {
      x: {
        grid: { color: GREY },
        ticks: { color: MUTED },
      },
      y: {
        grid: { color: GREY },
        ticks: { color: MUTED },
        beginAtZero: true,
      },
    },
  };

  if (!hasPermission('reports.view')) {
    return (
      <div className="app-card">
        <h1 className="app-title">Welcome</h1>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          You are signed in. Use the sidebar to open modules you can access.
        </p>
      </div>
    );
  }

  const hasSales = (data?.salesTrend || []).some((t) => Number(t.revenue) > 0);
  const hasOrdersTrend = (data?.ordersTrend || []).some((t) => t.total > 0);
  const hasStatus = (data?.ordersByStatus || []).length > 0;
  const hasTop = (data?.topSellingItems || []).length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={
          data?.meta?.day
            ? `Live snapshot for ${data.meta.day} (${data.meta.timeZone || 'local'})`
            : 'Live operational snapshot'
        }
      />

      {loading && <p className="text-[var(--color-ink-muted)]">Loading…</p>}
      {error && <p className="text-[var(--color-danger)]">{error}</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Today's sales" value={money(data.revenue)} icon={Banknote} />
            <StatCard label="Total orders" value={data.totalOrders ?? 0} icon={ClipboardList} />
            <StatCard label="Active orders" value={data.activeOrders ?? 0} icon={ShoppingBag} />
            <StatCard label="Completed today" value={data.completedOrders ?? 0} icon={CheckCircle} />
            <StatCard
              label="Pending kitchen"
              value={data.pendingKitchenOrders ?? 0}
              icon={ChefHat}
            />
            <StatCard
              label="Inventory items"
              value={data.inventoryItemCount ?? 0}
              icon={Package}
              hint={
                Number(data.lowStockCount) > 0
                  ? `${data.lowStockCount} low / out of stock`
                  : undefined
              }
            />
            {Number(data.lowStockCount) > 0 && (
              <StatCard
                label="Low stock items"
                value={data.lowStockCount}
                icon={AlertTriangle}
                hint="Needs restocking"
              />
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Sales overview" description="Net collections — last 7 days">
              {hasSales ? (
                <div className="h-64">
                  <Line
                    data={salesChart}
                    options={{
                      ...chartOptions,
                      plugins: {
                        ...chartOptions.plugins,
                        legend: { display: false },
                        tooltip: {
                          ...chartOptions.plugins.tooltip,
                          callbacks: {
                            label: (ctx) => money(ctx.raw),
                          },
                        },
                      },
                    }}
                  />
                </div>
              ) : (
                <EmptyState title="No sales yet" description="Payments recorded this week will appear here." />
              )}
            </ChartCard>

            <ChartCard title="Orders overview" description="Order volume — last 7 days">
              {hasOrdersTrend ? (
                <div className="h-64">
                  <Bar data={ordersChart} options={chartOptions} />
                </div>
              ) : (
                <EmptyState title="No orders yet" description="Order activity for the week will show here." />
              )}
            </ChartCard>

            <ChartCard title="Order status" description="Distribution over the last 7 days">
              {hasStatus ? (
                <div className="mx-auto h-64 max-w-sm">
                  <Doughnut
                    data={statusChart}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { position: 'bottom', labels: { color: MUTED, boxWidth: 12 } },
                      },
                    }}
                  />
                </div>
              ) : (
                <EmptyState title="No status data" description="Order statuses will appear once orders exist." />
              )}
            </ChartCard>

            <ChartCard title="Top-selling products" description="Quantity sold — last 7 days">
              {hasTop ? (
                <div className="h-64">
                  <Bar
                    data={topChart}
                    options={{
                      ...chartOptions,
                      indexAxis: 'y',
                      plugins: { ...chartOptions.plugins, legend: { display: false } },
                    }}
                  />
                </div>
              ) : (
                <EmptyState title="No product sales yet" description="Top sellers will show after orders are placed." />
              )}
            </ChartCard>
          </div>

          <div className="app-card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="app-section-title">Recent orders</h2>
              {hasPermission('orders.view') && (
                <Link to="/admin/orders" className="text-sm font-medium text-[var(--color-brand)] hover:underline">
                  View all
                </Link>
              )}
            </div>
            {(data.recentOrders || []).length ? (
              <div className="app-table-wrap !border-0 !shadow-none">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentOrders.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <Link
                            className="font-medium text-[var(--color-brand)] hover:underline"
                            to={`/pos/orders/${o.id}`}
                          >
                            {o.orderNumber}
                          </Link>
                        </td>
                        <td>{o.customerName || '—'}</td>
                        <td>{String(o.type || '').replaceAll('_', ' ')}</td>
                        <td>{money(o.grandTotal)}</td>
                        <td>
                          <Badge tone={statusTone[o.status] || 'muted'}>
                            {String(o.status || '').replaceAll('_', ' ')}
                          </Badge>
                        </td>
                        <td className="text-[var(--color-ink-muted)]">
                          {new Date(o.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No recent orders" description="New orders will list here." />
            )}
          </div>
        </>
      )}
    </div>
  );
}
