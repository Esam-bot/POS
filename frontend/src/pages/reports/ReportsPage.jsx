import { useEffect, useState } from 'react';
import { reportsApi } from '../../services/billingService';
import { money } from '../../utils/formatMoney';
import { useToast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Input';

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

export default function ReportsPage() {
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState(null);

  async function load() {
    try {
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;
      const data = await reportsApi.financial(params);
      setReport(data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load report');
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="app-title">Financial reports</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Sales, tax, collections, and refunds from stored payment records
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="From">
            <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Button onClick={load}>Apply</Button>
        </div>
      </div>

      {!report ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Loading…</p>
      ) : (
        <>
          <section>
            <h2 className="app-section-title mb-3">Sales</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Stat label="Gross sales" value={money(report.sales.grossSales)} />
              <Stat label="Discounts" value={money(report.sales.discounts)} />
              <Stat label="Sales returns" value={money(report.sales.salesReturns)} />
              <Stat label="Voids" value={money(report.sales.voids)} />
              <Stat label="Net sales" value={money(report.sales.netSales)} />
            </div>
          </section>

          <section>
            <h2 className="app-section-title mb-3">Tax</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Total tax collected" value={money(report.tax.totalTax)} />
              {Object.entries(report.tax.byMethod || {}).map(([code, amt]) => (
                <Stat key={code} label={`Tax · ${code}`} value={money(amt)} />
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(report.tax.byRate || {}).map(([rate, amt]) => (
                <Stat key={rate} label={`Tax @ ${rate}%`} value={money(amt)} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="app-section-title mb-3">Payments</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Cash" value={money(report.payments.cash)} />
              <Stat label="Card" value={money(report.payments.card)} />
              <Stat label="Bank transfer" value={money(report.payments.bankTransfer)} />
              <Stat label="Easypaisa" value={money(report.payments.easypaisa)} />
              <Stat label="JazzCash" value={money(report.payments.jazzcash)} />
              <Stat label="Total collections" value={money(report.payments.totalCollections)} />
              <Stat label="Outstanding" value={money(report.payments.outstandingBalance)} />
            </div>
          </section>

          <section>
            <h2 className="app-section-title mb-3">Refunds</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Payment corrections" value={money(report.refunds.paymentCorrections)} />
              <Stat label="Sales returns" value={money(report.refunds.salesReturns)} />
              <Stat label="Voids" value={money(report.refunds.voids)} />
              <Stat label="Refund total" value={money(report.refunds.total)} />
            </div>
            <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
              Payment corrections do not reduce net sales. Sales returns and voids do.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
