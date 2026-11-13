import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { reportsApi, settingsApi } from '../../services/billingService';
import { money } from '../../utils/formatMoney';
import { useToast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { Field, TextInput } from '../../components/ui/Input';
import ExpensesSection from './ExpensesSection';

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--color-ink)]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{hint}</p> : null}
    </div>
  );
}

function BreakdownTable({ rows }) {
  if (!rows.length) {
    return <p className="text-sm text-[var(--color-ink-muted)]">No data for this range.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-line)] bg-white">
      <table className="min-w-full text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-[var(--color-line)] last:border-0">
              <td className="px-4 py-2.5 text-[var(--color-ink-muted)]">{row.label}</td>
              <td className="px-4 py-2.5 text-right font-medium text-[var(--color-ink)]">
                {money(row.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportsPage() {
  const toast = useToast();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');

  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportError, setReportError] = useState('');

  const [taxOpen, setTaxOpen] = useState(false);
  const [refundsOpen, setRefundsOpen] = useState(true);
  const [methods, setMethods] = useState([]);

  const dateParams = useMemo(() => {
    const params = {};
    if (appliedFrom) params.from = appliedFrom;
    if (appliedTo) params.to = appliedTo;
    return params;
  }, [appliedFrom, appliedTo]);

  const loadReport = useCallback(
    async (params) => {
      setReportLoading(true);
      setReportError('');
      try {
        const data = await reportsApi.financial(params);
        setReport(data);
      } catch (err) {
        setReport(null);
        setReportError(err.response?.data?.message || 'Failed to load report');
        toast.error(err.response?.data?.message || 'Failed to load report');
      } finally {
        setReportLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    loadReport({});
    settingsApi
      .listMethods()
      .then((list) => setMethods((list || []).filter((m) => m.isActive !== false)))
      .catch(() => setMethods([]));
  }, [loadReport]);

  function applyDates() {
    if (from && to && from > to) {
      toast.error('From date must not be later than To date');
      return;
    }
    setAppliedFrom(from);
    setAppliedTo(to);
    const params = {};
    if (from) params.from = from;
    if (to) params.to = to;
    loadReport(params);
  }

  const overview = report?.overview || {};
  const sales = report?.sales || {};
  const tax = report?.tax || {};
  const payments = report?.payments || {};
  const refunds = report?.refunds || {};

  const paymentRows = useMemo(() => {
    const byMethod = payments.byMethod || {};
    const entries = Object.entries(byMethod);
    const methodName = (code) => {
      const found = methods.find((m) => m.code === code);
      if (found?.name) return found.name;
      return code
        .split('_')
        .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
        .join(' ');
    };
    return entries
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([code, value]) => ({ label: methodName(code), value }));
  }, [payments, methods]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="app-title">Financial reports</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Sales, tax, collections, refunds, and expenses for the selected dates
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="From Date">
            <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To Date">
            <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Button onClick={applyDates}>Apply</Button>
        </div>
      </div>

      {reportLoading && !report ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Loading…</p>
      ) : reportError && !report ? (
        <EmptyState title="Could not load report" description={reportError} />
      ) : report ? (
        <>
          <section>
            <h2 className="app-section-title mb-3">Financial overview</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              <Stat label="Gross Sales" value={money(overview.grossSales ?? sales.grossSales)} />
              <Stat label="Discounts" value={money(overview.discounts ?? sales.discounts)} />
              <Stat label="Net Sales" value={money(overview.netSales ?? sales.netSales)} />
              <Stat label="Tax Collected" value={money(overview.taxCollected ?? tax.totalTax)} />
              <Stat
                label="Net Payments Collected"
                value={money(overview.netPaymentsCollected ?? payments.totalCollections)}
              />
              <Stat label="Total Refunds" value={money(overview.totalRefunds ?? refunds.total)} />
              <Stat
                label="Total Expenses"
                value={money(overview.totalExpenses ?? report.expenses?.total)}
              />
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="app-section-title mb-3">Sales</h2>
              <BreakdownTable
                rows={[
                  { label: 'Gross Sales', value: sales.grossSales },
                  { label: 'Discounts', value: sales.discounts },
                  { label: 'Sales Returns', value: sales.salesReturns },
                  { label: 'Voids', value: sales.voids },
                  { label: 'Net Sales', value: sales.netSales },
                ]}
              />
            </div>

            <div>
              <h2 className="app-section-title mb-3">Tax</h2>
              <BreakdownTable rows={[{ label: 'Tax Collected', value: tax.totalTax }]} />
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1 text-sm text-[var(--color-brand)]"
                onClick={() => setTaxOpen((v) => !v)}
              >
                {taxOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                Tax breakdown
              </button>
              {taxOpen ? (
                <div className="mt-2 space-y-3">
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                      By payment method
                    </p>
                    <BreakdownTable
                      rows={Object.entries(tax.byMethod || {}).map(([label, value]) => ({
                        label,
                        value,
                      }))}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                      By tax rate
                    </p>
                    <BreakdownTable
                      rows={Object.entries(tax.byRate || {}).map(([rate, value]) => ({
                        label: `${rate}%`,
                        value,
                      }))}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <h2 className="app-section-title mb-3">Payments</h2>
              <BreakdownTable
                rows={[
                  ...paymentRows,
                  { label: 'Net Payments Collected', value: payments.totalCollections },
                ]}
              />
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="app-section-title">Refunds</h2>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-sm text-[var(--color-brand)]"
                  onClick={() => setRefundsOpen((v) => !v)}
                >
                  {refundsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  Details
                </button>
              </div>
              <BreakdownTable rows={[{ label: 'Total Refunds', value: refunds.total }]} />
              {refundsOpen ? (
                <div className="mt-2">
                  <BreakdownTable
                    rows={[
                      { label: 'Payment Corrections', value: refunds.paymentCorrections },
                      { label: 'Sales Returns', value: refunds.salesReturns },
                      { label: 'Voids After Payment', value: refunds.voids },
                    ]}
                  />
                  <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
                    Payment corrections do not reduce net sales. Sales returns and voids do.
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          <section>
            <h2 className="app-section-title mb-3">Overall financial summary</h2>
            <BreakdownTable
              rows={[
                { label: 'Net Sales', value: overview.netSales ?? sales.netSales },
                { label: 'Tax Collected', value: overview.taxCollected ?? tax.totalTax },
                {
                  label: 'Net Payments Collected',
                  value: overview.netPaymentsCollected ?? payments.totalCollections,
                },
                { label: 'Total Refunds', value: overview.totalRefunds ?? refunds.total },
                { label: 'Total Expenses', value: overview.totalExpenses ?? report.expenses?.total },
                {
                  label: 'Remaining After Expenses',
                  value: overview.remainingAfterExpenses,
                },
              ]}
            />
            <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
              Remaining After Expenses = Net Payments Collected − Total Expenses. This is an
              indicative financial result, not guaranteed accounting net profit. Net Sales and Net
              Payments Collected are not interchangeable.
            </p>
          </section>
        </>
      ) : null}

      <ExpensesSection
        dateParams={dateParams}
        onExpensesChanged={() => loadReport(dateParams)}
      />
    </div>
  );
}
