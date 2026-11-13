import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { expensesApi, settingsApi } from '../../services/billingService';
import { money } from '../../utils/formatMoney';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal';
import EmptyState from '../../components/ui/EmptyState';
import { Field, TextInput, TextArea, Select } from '../../components/ui/Input';

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function monthInputValue(value) {
  if (!value) return todayIso().slice(0, 7);
  const s = String(value);
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  return formatDate(value).slice(0, 7);
}

/** Format YYYY-MM or YYYY-MM-DD as "November 2026" */
function formatBillingPeriod(value) {
  if (!value) return '—';
  const s = String(value);
  const match = s.match(/^(\d{4})-(\d{2})/);
  if (!match) return s;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return label;
}

function firstDayOfMonth(yyyyMm) {
  return `${yyyyMm}-01`;
}

const FREQUENCY_LABELS = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
};

const emptyForm = () => ({
  title: '',
  categoryId: '',
  amount: '',
  methodId: '',
  expenseDate: todayIso(),
  billingPeriod: todayIso().slice(0, 7),
  description: '',
  paymentStatus: 'UNPAID',
  repeat: false,
  frequency: 'MONTHLY',
  startDate: todayIso(),
  endDate: '',
});

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

export default function ExpensesSection({ dateParams, onExpensesChanged }) {
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('expenses.manage');

  const [categories, setCategories] = useState([]);
  const [methods, setMethods] = useState([]);

  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({ total: 0, paid: 0, unpaid: 0, byCategory: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [scheduleBusy, setScheduleBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadLookups = useCallback(async () => {
    try {
      const [cats, paymentMethods] = await Promise.all([
        expensesApi.categories(),
        settingsApi.listMethods().catch(() => []),
      ]);
      setCategories(cats || []);
      setMethods((paymentMethods || []).filter((m) => m.isActive !== false));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load expense lookups');
    }
  }, [toast]);

  const loadExpenses = useCallback(
    async (filters = {}) => {
      setLoading(true);
      try {
        const query = { ...dateParams, limit: 100 };
        if (filters.search) query.search = filters.search;
        if (filters.categoryId) query.categoryId = filters.categoryId;
        if (filters.paymentStatus) query.paymentStatus = filters.paymentStatus;
        const data = await expensesApi.list(query);
        setExpenses(data.items || []);
        setSummary(data.summary || { total: 0, paid: 0, unpaid: 0, byCategory: {} });
      } catch (err) {
        setExpenses([]);
        toast.error(err.response?.data?.message || 'Failed to load expenses');
      } finally {
        setLoading(false);
      }
    },
    [dateParams, toast]
  );

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    loadExpenses({
      search,
      categoryId,
      paymentStatus: paymentStatusFilter,
    });
  }, [dateParams]); // eslint-disable-line react-hooks/exhaustive-deps

  function refresh() {
    return loadExpenses({
      search,
      categoryId,
      paymentStatus: paymentStatusFilter,
    });
  }

  async function notifyChanged() {
    await refresh();
    onExpensesChanged?.();
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      ...emptyForm(),
      title: row.title || '',
      categoryId: row.categoryId || '',
      amount: String(row.amount ?? ''),
      methodId: row.methodId || '',
      expenseDate: formatDate(row.expenseDate),
      billingPeriod: monthInputValue(row.billingPeriod || row.expenseDate),
      description: row.description || '',
      paymentStatus: row.paymentStatus || 'UNPAID',
      repeat: false,
    });
    setFormOpen(true);
  }

  async function openDetails(row) {
    setDetail(row);
    setSchedule(null);
    if (row.recurringExpenseId) {
      try {
        const s = await expensesApi.getRecurring(row.recurringExpenseId);
        setSchedule(s);
      } catch {
        setSchedule(null);
      }
    }
  }

  async function saveExpense(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.categoryId) {
      toast.error('Title and category are required');
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Amount must be greater than zero');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await expensesApi.update(editing.id, {
          title: form.title.trim(),
          categoryId: form.categoryId,
          amount,
          methodId: form.methodId || null,
          expenseDate: form.expenseDate,
          billingPeriod: form.billingPeriod || null,
          description: form.description.trim() || null,
          paymentStatus: form.paymentStatus,
        });
        toast.success('Expense updated');
      } else if (form.repeat) {
        if (!form.startDate) {
          toast.error('Start date is required for recurring expenses');
          setSaving(false);
          return;
        }
        if (form.endDate && form.endDate < form.startDate) {
          toast.error('End date must not be earlier than start date');
          setSaving(false);
          return;
        }
        await expensesApi.createRecurring({
          title: form.title.trim(),
          categoryId: form.categoryId,
          amount,
          methodId: form.methodId || null,
          frequency: form.frequency,
          startDate: form.startDate,
          nextDueDate: form.startDate,
          endDate: form.endDate || null,
          description: form.description.trim() || null,
        });
        toast.success('Recurring expense created — due periods generated as unpaid records');
      } else {
        if (!form.expenseDate) {
          toast.error('Expense date is required');
          setSaving(false);
          return;
        }
        await expensesApi.create({
          title: form.title.trim(),
          categoryId: form.categoryId,
          amount,
          methodId: form.methodId || null,
          expenseDate: form.expenseDate,
          billingPeriod: form.billingPeriod || form.expenseDate.slice(0, 7),
          description: form.description.trim() || null,
          paymentStatus: form.paymentStatus,
        });
        toast.success('Expense added');
      }
      setFormOpen(false);
      setEditing(null);
      await notifyChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await expensesApi.remove(deleteTarget.id);
      toast.success('Expense deleted');
      setDeleteTarget(null);
      if (detail?.id === deleteTarget.id) setDetail(null);
      await notifyChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete expense');
    } finally {
      setDeleting(false);
    }
  }

  async function togglePaymentStatus(row) {
    if (!canManage) return;
    const next = row.paymentStatus === 'PAID' ? 'UNPAID' : 'PAID';
    try {
      const updated = await expensesApi.update(row.id, { paymentStatus: next });
      toast.success(next === 'PAID' ? 'Marked as paid' : 'Marked as unpaid');
      if (detail?.id === row.id) setDetail(updated);
      await notifyChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update payment status');
    }
  }

  async function pauseOrResumeSchedule() {
    if (!schedule) return;
    setScheduleBusy(true);
    try {
      const updated =
        schedule.status === 'ACTIVE'
          ? await expensesApi.pauseRecurring(schedule.id)
          : await expensesApi.resumeRecurring(schedule.id);
      setSchedule(updated);
      toast.success(updated.status === 'ACTIVE' ? 'Schedule resumed' : 'Schedule paused');
      await notifyChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update schedule');
    } finally {
      setScheduleBusy(false);
    }
  }

  async function deactivateSchedule() {
    if (!schedule) return;
    setScheduleBusy(true);
    try {
      const updated = await expensesApi.deactivateRecurring(schedule.id);
      setSchedule(updated);
      toast.success('Schedule deactivated — existing expense records kept');
      await notifyChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to deactivate schedule');
    } finally {
      setScheduleBusy(false);
    }
  }

  async function saveScheduleEndDate(endDate) {
    if (!schedule) return;
    setScheduleBusy(true);
    try {
      const updated = await expensesApi.updateRecurring(schedule.id, {
        endDate: endDate || null,
      });
      setSchedule(updated);
      toast.success('Schedule updated (future expenses only)');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update schedule');
    } finally {
      setScheduleBusy(false);
    }
  }

  const nextGenerationDate = useMemo(() => {
    if (!form.repeat) return '—';
    return form.startDate || '—';
  }, [form.repeat, form.startDate]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="app-section-title">Expense Management</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            One-time and automatically recurring expenses in a single history
          </p>
        </div>
        {canManage ? (
          <Button onClick={openCreate}>
            <Plus size={16} strokeWidth={1.75} />
            Add Expense
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total Expenses" value={money(summary.total)} />
        <Stat label="Paid Expenses" value={money(summary.paid)} />
        <Stat label="Unpaid Expenses" value={money(summary.unpaid)} />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Search">
          <TextInput
            value={search}
            placeholder="Search by title…"
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') refresh();
            }}
          />
        </Field>
        <Field label="Category">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Payment Status">
          <Select
            value={paymentStatusFilter}
            onChange={(e) => setPaymentStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="PAID">Paid</option>
            <option value="UNPAID">Unpaid</option>
          </Select>
        </Field>
        <Button variant="secondary" onClick={refresh}>
          Filter
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Loading expenses…</p>
      ) : !expenses.length ? (
        <EmptyState
          title="No expenses"
          description="No expenses match the selected dates and filters."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-line)] bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--color-section)] text-left text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
              <tr>
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Billing Period</th>
                <th className="px-4 py-2.5 font-medium">Expense Date</th>
                <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                <th className="px-4 py-2.5 font-medium">Payment Status</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((row) => (
                <tr key={row.id} className="border-t border-[var(--color-line)]">
                  <td className="px-4 py-2.5 font-medium text-[var(--color-ink)]">{row.title}</td>
                  <td className="px-4 py-2.5 text-[var(--color-ink-muted)]">
                    {row.category?.name || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-ink)]">
                    {formatBillingPeriod(row.billingPeriod || row.expenseDate)}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-ink)]">
                    {formatDate(row.expenseDate)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-[var(--color-ink)]">
                    {money(row.amount)}
                  </td>
                  <td className="px-4 py-2.5">
                    {canManage ? (
                      <button type="button" onClick={() => togglePaymentStatus(row)}>
                        <Badge tone={row.paymentStatus === 'PAID' ? 'success' : 'warning'}>
                          {row.paymentStatus === 'PAID' ? 'Paid' : 'Unpaid'}
                        </Badge>
                      </button>
                    ) : (
                      <Badge tone={row.paymentStatus === 'PAID' ? 'success' : 'warning'}>
                        {row.paymentStatus === 'PAID' ? 'Paid' : 'Unpaid'}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={row.source === 'RECURRING' ? 'brand' : 'muted'}>
                      {row.source === 'RECURRING' ? 'Recurring' : 'One-time'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-[var(--color-ink-muted)] hover:bg-[var(--color-section)] hover:text-[var(--color-ink)]"
                        aria-label="View expense"
                        onClick={() => openDetails(row)}
                      >
                        <Eye size={16} strokeWidth={1.75} />
                      </button>
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-[var(--color-ink-muted)] hover:bg-[var(--color-section)] hover:text-[var(--color-ink)]"
                            aria-label="Edit expense"
                            onClick={() => openEdit(row)}
                          >
                            <Pencil size={16} strokeWidth={1.75} />
                          </button>
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-[var(--color-ink-muted)] hover:bg-red-50 hover:text-[var(--color-danger)]"
                            aria-label="Delete expense"
                            onClick={() => setDeleteTarget(row)}
                          >
                            <Trash2 size={16} strokeWidth={1.75} />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={formOpen}
        title={editing ? 'Edit expense' : 'Add expense'}
        onClose={() => !saving && setFormOpen(false)}
        wide
      >
        <form className="space-y-4" onSubmit={saveExpense}>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">Basic information</h3>
            <div className="space-y-3">
              <Field label="Expense Title" required>
                <TextInput
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                />
              </Field>
              <Field label="Category" required>
                <Select
                  value={form.categoryId}
                  onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                  required
                >
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Amount" required>
                  <TextInput
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    required
                  />
                </Field>
                <Field label="Payment Method">
                  <Select
                    value={form.methodId}
                    onChange={(e) => setForm((f) => ({ ...f, methodId: e.target.value }))}
                  >
                    <option value="">Select method</option>
                    {methods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {!form.repeat || editing ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Expense Date" required={!form.repeat}>
                    <TextInput
                      type="date"
                      value={form.expenseDate}
                      onChange={(e) => {
                        const expenseDate = e.target.value;
                        setForm((f) => ({
                          ...f,
                          expenseDate,
                          billingPeriod: expenseDate
                            ? expenseDate.slice(0, 7)
                            : f.billingPeriod,
                        }));
                      }}
                      required={!form.repeat}
                    />
                  </Field>
                  <Field label="Billing Period (month/year)">
                    <TextInput
                      type="month"
                      value={form.billingPeriod}
                      onChange={(e) => setForm((f) => ({ ...f, billingPeriod: e.target.value }))}
                    />
                  </Field>
                </div>
              ) : null}
              {!form.repeat || editing ? (
                <Field label="Payment Status">
                  <Select
                    value={form.paymentStatus}
                    onChange={(e) => setForm((f) => ({ ...f, paymentStatus: e.target.value }))}
                  >
                    <option value="UNPAID">Unpaid</option>
                    <option value="PAID">Paid</option>
                  </Select>
                </Field>
              ) : null}
              <Field label="Description (optional)">
                <TextArea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                />
              </Field>
            </div>
          </div>

          {!editing ? (
            <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-section)]/40 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">Recurrence setting</h3>
              <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--color-line)]"
                  checked={form.repeat}
                  onChange={(e) => {
                    const repeat = e.target.checked;
                    setForm((f) => ({
                      ...f,
                      repeat,
                      startDate: f.startDate || firstDayOfMonth(f.billingPeriod) || todayIso(),
                      paymentStatus: repeat ? 'UNPAID' : f.paymentStatus,
                    }));
                  }}
                />
                Repeat this expense automatically?
              </label>
              {form.repeat ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Frequency" required>
                      <Select
                        value={form.frequency}
                        onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
                      >
                        <option value="MONTHLY">Monthly</option>
                        <option value="QUARTERLY">Quarterly</option>
                        <option value="YEARLY">Yearly</option>
                      </Select>
                    </Field>
                    <Field label="Start Date" required>
                      <TextInput
                        type="date"
                        value={form.startDate}
                        onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                        required
                      />
                    </Field>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="End Date (optional)">
                      <TextInput
                        type="date"
                        value={form.endDate}
                        onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                      />
                    </Field>
                    <Field label="Next Generation Date">
                      <TextInput type="date" value={nextGenerationDate} disabled />
                    </Field>
                  </div>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    Each billing period becomes a separate unpaid expense record. Mark individual
                    months as paid when the money is actually paid.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => setFormOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? 'Saving…'
                : editing
                  ? 'Save changes'
                  : form.repeat
                    ? 'Create recurring expense'
                    : 'Add expense'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(detail)}
        title="Expense details"
        onClose={() => setDetail(null)}
        wide
      >
        {detail ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">Title</p>
                <p className="mt-0.5 font-medium text-[var(--color-ink)]">{detail.title}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                  Category
                </p>
                <p className="mt-0.5 text-[var(--color-ink)]">{detail.category?.name || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                  Billing Period
                </p>
                <p className="mt-0.5 text-[var(--color-ink)]">
                  {formatBillingPeriod(detail.billingPeriod || detail.expenseDate)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                  Expense Date
                </p>
                <p className="mt-0.5 text-[var(--color-ink)]">{formatDate(detail.expenseDate)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">Amount</p>
                <p className="mt-0.5 font-semibold text-[var(--color-ink)]">{money(detail.amount)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                  Payment Method
                </p>
                <p className="mt-0.5 text-[var(--color-ink)]">{detail.method?.name || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                  Payment Status
                </p>
                <div className="mt-1">
                  <Badge tone={detail.paymentStatus === 'PAID' ? 'success' : 'warning'}>
                    {detail.paymentStatus === 'PAID' ? 'Paid' : 'Unpaid'}
                  </Badge>
                  {canManage ? (
                    <button
                      type="button"
                      className="ml-2 text-xs text-[var(--color-brand)]"
                      onClick={() => togglePaymentStatus(detail)}
                    >
                      Mark as {detail.paymentStatus === 'PAID' ? 'Unpaid' : 'Paid'}
                    </button>
                  ) : null}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">Type</p>
                <div className="mt-1">
                  <Badge tone={detail.source === 'RECURRING' ? 'brand' : 'muted'}>
                    {detail.source === 'RECURRING' ? 'Recurring' : 'One-time'}
                  </Badge>
                </div>
              </div>
            </div>
            {detail.description ? (
              <div className="text-sm">
                <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                  Description
                </p>
                <p className="mt-0.5 text-[var(--color-ink)]">{detail.description}</p>
              </div>
            ) : null}

            {schedule ? (
              <div className="rounded-lg border border-[var(--color-line)] p-4 space-y-3">
                <h3 className="text-sm font-semibold text-[var(--color-ink)]">
                  Linked recurrence schedule
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 text-sm">
                  <p>
                    <span className="text-[var(--color-ink-muted)]">Frequency: </span>
                    {FREQUENCY_LABELS[schedule.frequency] || schedule.frequency}
                  </p>
                  <p>
                    <span className="text-[var(--color-ink-muted)]">Status: </span>
                    <Badge
                      tone={
                        schedule.status === 'ACTIVE'
                          ? 'success'
                          : schedule.status === 'PAUSED'
                            ? 'warning'
                            : 'muted'
                      }
                    >
                      {schedule.status}
                    </Badge>
                  </p>
                  <p>
                    <span className="text-[var(--color-ink-muted)]">Next due: </span>
                    {formatDate(schedule.nextDueDate)}
                  </p>
                  <p>
                    <span className="text-[var(--color-ink-muted)]">End date: </span>
                    {schedule.endDate ? formatDate(schedule.endDate) : 'None'}
                  </p>
                </div>
                {canManage && schedule.status !== 'INACTIVE' ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <Field label="Change end date">
                      <TextInput
                        type="date"
                        defaultValue={schedule.endDate ? formatDate(schedule.endDate) : ''}
                        onBlur={(e) => {
                          const v = e.target.value;
                          const current = schedule.endDate ? formatDate(schedule.endDate) : '';
                          if (v !== current) saveScheduleEndDate(v);
                        }}
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={scheduleBusy}
                      onClick={pauseOrResumeSchedule}
                    >
                      {schedule.status === 'ACTIVE' ? (
                        <>
                          <Pause size={14} /> Pause
                        </>
                      ) : (
                        <>
                          <Play size={14} /> Resume
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={scheduleBusy}
                      onClick={deactivateSchedule}
                    >
                      Deactivate
                    </Button>
                  </div>
                ) : null}
                <p className="text-xs text-[var(--color-ink-muted)]">
                  Schedule changes affect future generated expenses only. This history row stays as
                  recorded.
                </p>
              </div>
            ) : null}

            {canManage ? (
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setDetail(null);
                    openEdit(detail);
                  }}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    setDeleteTarget(detail);
                  }}
                >
                  Delete
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        title="Delete expense"
        itemName={deleteTarget?.title}
        message="This removes this expense record only. Linked recurrence schedules and other periods are not deleted."
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setDeleteTarget(null)}
      />
    </section>
  );
}
