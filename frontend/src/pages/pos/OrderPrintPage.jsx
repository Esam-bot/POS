import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { printApi } from '../../services/printService';
import { useToast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import CustomerReceiptPrint from '../../components/print/CustomerReceiptPrint';
import KitchenTicketPrint from '../../components/print/KitchenTicketPrint';
import CashierRecordPrint from '../../components/print/CashierRecordPrint';

const PRINT_SEQUENCE = ['kitchen', 'customer', 'cashier'];

function PrintPane({ title, hint, children }) {
  return (
    <section className="theme-light flex min-h-0 flex-col rounded-xl border border-[var(--color-line)] bg-white text-[var(--color-ink)]">
      <div className="border-b border-[var(--color-line)] px-4 py-3 print:hidden">
        <h2 className="font-semibold">{title}</h2>
        {hint && <p className="text-xs text-[var(--color-ink-muted)]">{hint}</p>}
      </div>
      <div className="flex-1 overflow-auto p-4">{children}</div>
    </section>
  );
}

export default function OrderPrintPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const auto = params.get('auto') === '1';
  const navigate = useNavigate();
  const toast = useToast();

  const [customerJob, setCustomerJob] = useState(null);
  const [kitchenJob, setKitchenJob] = useState(null);
  const [cashierJob, setCashierJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const [activePrint, setActivePrint] = useState(null);
  const [reprintFlags, setReprintFlags] = useState({
    customer: false,
    kitchen: false,
    cashier: false,
  });
  const jobsRef = useRef({ customer: null, kitchen: null, cashier: null });

  const load = useCallback(async () => {
    try {
      setError('');
      const jobs = await printApi.list(id);
      const customer = jobs.find((j) => j.type === 'CUSTOMER_ORDER_SLIP') || null;
      const kitchen = jobs.find((j) => j.type === 'KITCHEN_TICKET') || null;
      const cashier = jobs.find((j) => j.type === 'CASHIER_RECORD') || null;
      setCustomerJob(customer);
      setKitchenJob(kitchen);
      setCashierJob(cashier);
      jobsRef.current = { customer, kitchen, cashier };
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load print documents');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function markKindPrinted(kind, failed = false, errorMessage = null) {
    const current = jobsRef.current;
    const reprint =
      kind === 'customer'
        ? Number(current.customer?.printCount || 0) > 0
        : kind === 'kitchen'
          ? Number(current.kitchen?.printCount || 0) > 0
          : Number(current.cashier?.printCount || 0) > 0;

    const body = failed
      ? { failed: true, error: errorMessage }
      : { reprint };

    let result;
    if (kind === 'customer') {
      result = await printApi.markCustomerPrinted(id, body);
      if (!failed) {
        setReprintFlags((f) => ({ ...f, customer: Boolean(result.isReprint) }));
        setCustomerJob((j) =>
          j ? { ...j, printCount: result.printCount, status: result.status } : j
        );
        jobsRef.current.customer = {
          ...(jobsRef.current.customer || {}),
          printCount: result.printCount,
          status: result.status,
        };
      }
    } else if (kind === 'kitchen') {
      result = await printApi.markKitchenPrinted(id, body);
      if (!failed) {
        setReprintFlags((f) => ({ ...f, kitchen: Boolean(result.isReprint) }));
        setKitchenJob((j) =>
          j ? { ...j, printCount: result.printCount, status: result.status } : j
        );
        jobsRef.current.kitchen = {
          ...(jobsRef.current.kitchen || {}),
          printCount: result.printCount,
          status: result.status,
        };
      }
    } else {
      result = await printApi.markCashierPrinted(id, body);
      if (!failed) {
        setReprintFlags((f) => ({ ...f, cashier: Boolean(result.isReprint) }));
        setCashierJob((j) =>
          j ? { ...j, printCount: result.printCount, status: result.status } : j
        );
        jobsRef.current.cashier = {
          ...(jobsRef.current.cashier || {}),
          printCount: result.printCount,
          status: result.status,
        };
      }
    }
    return result;
  }

  async function runBrowserPrint(kind) {
    setActivePrint(kind);
    await new Promise((r) => setTimeout(r, 80));
    try {
      window.print();
      await markKindPrinted(kind, false);
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Print failed';
      try {
        await markKindPrinted(kind, true, message);
      } catch {
        /* ignore secondary failure */
      }
      throw err;
    } finally {
      setActivePrint(null);
    }
  }

  async function printAllSlips() {
    if (printing) return;
    if (!kitchenJob || !customerJob || !cashierJob) {
      toast.error('Print documents are not ready yet');
      return;
    }
    setPrinting(true);
    try {
      for (let i = 0; i < PRINT_SEQUENCE.length; i += 1) {
        const kind = PRINT_SEQUENCE[i];
        await runBrowserPrint(kind);
        if (i < PRINT_SEQUENCE.length - 1) {
          await new Promise((r) => setTimeout(r, 450));
        }
      }
      toast.success('Printed kitchen, customer, and cashier slips');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Print failed');
    } finally {
      setPrinting(false);
      setActivePrint(null);
    }
  }

  useEffect(() => {
    if (!auto || loading || !customerJob || !kitchenJob || !cashierJob) return undefined;
    const guardKey = `pos-auto-print:${id}`;
    if (sessionStorage.getItem(guardKey) === '1') return undefined;
    if (
      Number(customerJob.printCount || 0) > 0 ||
      Number(kitchenJob.printCount || 0) > 0 ||
      Number(cashierJob.printCount || 0) > 0
    ) {
      return undefined;
    }
    sessionStorage.setItem(guardKey, '1');
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await printAllSlips();
    })();
    return () => {
      cancelled = true;
    };
    // intentionally once after load when auto=1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, loading, customerJob?.id, kitchenJob?.id, cashierJob?.id, id]);

  if (loading) {
    return <p className="p-4 text-white/70">Preparing print documents…</p>;
  }

  if (error) {
    return (
      <div className="space-y-3 p-4 text-white">
        <p className="text-red-300">{error}</p>
        <Button variant="secondary" onClick={load}>
          Retry
        </Button>
        <Link to="/pos">
          <Button>Back to POS</Button>
        </Link>
      </div>
    );
  }

  const customerReprint =
    reprintFlags.customer || Number(customerJob?.printCount || 0) > 0;
  const kitchenReprint = reprintFlags.kitchen || Number(kitchenJob?.printCount || 0) > 0;
  const cashierReprint = reprintFlags.cashier || Number(cashierJob?.printCount || 0) > 0;

  return (
    <div className="space-y-4 p-4 text-white">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Print order documents
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-white/60">
            One Print slip action opens three browser print dialogs in order: kitchen ticket,
            customer order slip, then cashier record. Choose the correct printer for each dialog.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={printAllSlips} disabled={printing || !kitchenJob || !customerJob || !cashierJob}>
            {printing ? 'Printing…' : 'Print slip'}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/pos')} disabled={printing}>
            Continue to POS
          </Button>
        </div>
      </div>

      <div
        className={`grid gap-4 print:block lg:grid-cols-3 ${
          activePrint ? 'printing-active' : ''
        }`}
        data-active-print={activePrint || ''}
      >
        <div className={activePrint && activePrint !== 'kitchen' ? 'print:hidden' : ''}>
          <PrintPane title="Kitchen ticket" hint="No prices · kitchen printer · 80mm">
            <KitchenTicketPrint
              snapshot={kitchenJob?.snapshot}
              isReprint={kitchenReprint && Number(kitchenJob?.printCount || 0) > 0}
            />
          </PrintPane>
        </div>
        <div className={activePrint && activePrint !== 'customer' ? 'print:hidden' : ''}>
          <PrintPane title="Customer order slip" hint="Customer copy · 80mm">
            <CustomerReceiptPrint
              snapshot={customerJob?.snapshot}
              isReprint={customerReprint && Number(customerJob?.printCount || 0) > 0}
            />
          </PrintPane>
        </div>
        <div className={activePrint && activePrint !== 'cashier' ? 'print:hidden' : ''}>
          <PrintPane title="Cashier record" hint="Store copy · payment breakdown · 80mm">
            <CashierRecordPrint
              snapshot={cashierJob?.snapshot}
              isReprint={cashierReprint && Number(cashierJob?.printCount || 0) > 0}
            />
          </PrintPane>
        </div>
      </div>

      <style>{`
        .thermal-slip {
          width: 72mm;
          max-width: 100%;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }
        @media print {
          @page { size: 80mm auto; margin: 4mm; }
          body { background: #fff !important; color: #000 !important; }
          .print\\:hidden { display: none !important; }
          .thermal-slip {
            width: 72mm;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}
