import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { menuApi } from '../../services/menuService';
import { money } from '../../utils/formatMoney';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Field, TextInput, TextArea, Select } from '../../components/ui/Input';

const emptyGroup = {
  name: '',
  description: '',
  selectionType: 'MULTI',
  minSelect: 0,
  maxSelect: 5,
  isRequired: false,
  isActive: true,
};

const emptyModifier = { name: '', description: '', priceDelta: 0, sortOrder: 0, isActive: true };

export default function ModifiersPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [groups, setGroups] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [modifierOpen, setModifierOpen] = useState(false);
  const [groupForm, setGroupForm] = useState(emptyGroup);
  const [modifierForm, setModifierForm] = useState(emptyModifier);
  const [editingGroup, setEditingGroup] = useState(null);
  const [editingModifier, setEditingModifier] = useState(null);

  const loadGroups = useCallback(async () => {
    try {
      const data = await menuApi.listModifierGroups({ limit: 100 });
      setGroups(data.items);
      if (!selectedId && data.items[0]) setSelectedId(data.items[0].id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load customization groups');
    }
  }, [selectedId, toast]);

  const loadDetail = useCallback(async () => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    try {
      const data = await menuApi.getModifierGroup(selectedId);
      setDetail(data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load group');
    }
  }, [selectedId, toast]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  async function saveGroup(e) {
    e.preventDefault();
    try {
      const payload = {
        ...groupForm,
        minSelect: Number(groupForm.minSelect),
        maxSelect: Number(groupForm.maxSelect),
      };
      if (editingGroup) {
        await menuApi.updateModifierGroup(editingGroup.id, payload);
        toast.success('Group updated');
      } else {
        const created = await menuApi.createModifierGroup(payload);
        toast.success('Group created');
        setSelectedId(created.id);
      }
      setGroupOpen(false);
      loadGroups();
      loadDetail();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    }
  }

  async function saveModifier(e) {
    e.preventDefault();
    try {
      const payload = {
        ...modifierForm,
        priceDelta: Number(modifierForm.priceDelta),
        sortOrder: Number(modifierForm.sortOrder) || 0,
      };
      if (editingModifier) {
        await menuApi.updateModifier(editingModifier.id, payload);
        toast.success('Option updated');
      } else {
        await menuApi.createModifier(selectedId, payload);
        toast.success('Option created');
      }
      setModifierOpen(false);
      loadDetail();
      loadGroups();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-[var(--color-ink-muted)]">
          Customization groups contain options customers can choose while ordering — for example
          “Burger Extras” with Extra Cheese, Extra Patty, and Extra Sauce. Cashiers see these when
          they select a product on the POS.
        </p>
        {hasPermission('menu.create') && (
          <Button
            onClick={() => {
              setEditingGroup(null);
              setGroupForm(emptyGroup);
              setGroupOpen(true);
            }}
          >
            <Plus size={16} />
            New group
          </Button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="flex min-h-[280px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-line)] bg-white px-6 py-12 text-center">
          <p className="text-lg font-semibold text-[var(--color-ink)]">No customization groups yet</p>
          <p className="mt-2 max-w-md text-sm text-[var(--color-ink-muted)]">
            Create a group first (for example “Burger Extras”), then add options cashiers can pick on
            the POS.
          </p>
          {hasPermission('menu.create') && (
            <Button
              className="mt-5"
              onClick={() => {
                setEditingGroup(null);
                setGroupForm(emptyGroup);
                setGroupOpen(true);
              }}
            >
              <Plus size={16} />
              Create first group
            </Button>
          )}
        </div>
      ) : (
        <div className="grid w-full gap-4 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
          <aside className="rounded-xl border border-[var(--color-line)] bg-white p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Groups</p>
              {hasPermission('menu.create') && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingGroup(null);
                    setGroupForm(emptyGroup);
                    setGroupOpen(true);
                  }}
                >
                  <Plus size={14} />
                  New
                </Button>
              )}
            </div>
            <div className="max-h-[min(60vh,520px)] space-y-1 overflow-y-auto">
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedId(g.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                    selectedId === g.id
                      ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand-dark)]'
                      : 'hover:bg-[var(--color-surface)]'
                  }`}
                >
                  <span className="truncate pr-2">{g.name}</span>
                  <Badge tone={g.isActive ? 'success' : 'muted'}>
                    {g.selectionType === 'SINGLE' ? 'One' : 'Many'}
                  </Badge>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-w-0 rounded-xl border border-[var(--color-line)] bg-white p-5">
            {!detail ? (
              <div className="flex min-h-[200px] items-center justify-center text-sm text-[var(--color-ink-muted)]">
                Select a customization group to manage its options.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">{detail.name}</h2>
                    <p className="text-sm text-[var(--color-ink-muted)]">{detail.description}</p>
                    <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                      {detail.selectionType === 'SINGLE'
                        ? 'Choose one option'
                        : 'Choose multiple options'}
                      {detail.isRequired ? ' · required' : ' · optional'}
                    </p>
                  </div>
                  {hasPermission('menu.update') && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditingGroup(detail);
                        setGroupForm({
                          name: detail.name,
                          description: detail.description || '',
                          selectionType: detail.selectionType,
                          minSelect: detail.minSelect,
                          maxSelect: detail.maxSelect,
                          isRequired: detail.isRequired,
                          isActive: detail.isActive,
                        });
                        setGroupOpen(true);
                      }}
                    >
                      <Pencil size={14} />
                      Edit group
                    </Button>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Customization options</h3>
                  {hasPermission('menu.create') && (
                    <Button
                      onClick={() => {
                        setEditingModifier(null);
                        setModifierForm(emptyModifier);
                        setModifierOpen(true);
                      }}
                    >
                      <Plus size={14} />
                      Add option
                    </Button>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-[var(--color-ink-muted)]">
                      <tr>
                        <th className="py-2 font-medium">Option</th>
                        <th className="py-2 font-medium">Extra price</th>
                        <th className="py-2 font-medium">Status</th>
                        <th className="py-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.modifiers || []).map((m) => (
                        <tr key={m.id} className="border-t border-[var(--color-line)]">
                          <td className="py-2">{m.name}</td>
                          <td className="py-2">
                            {Number(m.priceDelta) === 0 ? 'Free' : `+${money(m.priceDelta)}`}
                          </td>
                          <td className="py-2">
                            <Badge tone={m.isActive ? 'success' : 'muted'}>
                              {m.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="py-2">
                            {hasPermission('menu.update') && (
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setEditingModifier(m);
                                  setModifierForm({
                                    name: m.name,
                                    description: m.description || '',
                                    priceDelta: m.priceDelta,
                                    sortOrder: m.sortOrder,
                                    isActive: m.isActive,
                                  });
                                  setModifierOpen(true);
                                }}
                              >
                                Edit
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!(detail.modifiers || []).length && (
                        <tr>
                          <td colSpan={4} className="py-6 text-[var(--color-ink-muted)]">
                            No options in this group yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <Modal
        open={groupOpen}
        title={editingGroup ? 'Edit customization group' : 'New customization group'}
        onClose={() => setGroupOpen(false)}
      >
        <form onSubmit={saveGroup} className="space-y-4">
          <Field label="Group name" hint='Example: "Burger Extras"'>
            <TextInput required value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} />
          </Field>
          <Field label="Description">
            <TextArea rows={2} value={groupForm.description} onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })} />
          </Field>
          <Field label="How many can the customer choose?">
            <Select
              value={groupForm.selectionType}
              onChange={(e) =>
                setGroupForm({
                  ...groupForm,
                  selectionType: e.target.value,
                  maxSelect: e.target.value === 'SINGLE' ? 1 : groupForm.maxSelect,
                })
              }
            >
              <option value="SINGLE">One option only</option>
              <option value="MULTI">Multiple options</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Minimum choices">
              <TextInput
                type="number"
                min="0"
                value={groupForm.minSelect}
                onChange={(e) => setGroupForm({ ...groupForm, minSelect: e.target.value })}
              />
            </Field>
            <Field label="Maximum choices">
              <TextInput
                type="number"
                min="0"
                value={groupForm.maxSelect}
                onChange={(e) => setGroupForm({ ...groupForm, maxSelect: e.target.value })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={groupForm.isRequired}
              onChange={(e) =>
                setGroupForm({
                  ...groupForm,
                  isRequired: e.target.checked,
                  minSelect: e.target.checked ? Math.max(1, Number(groupForm.minSelect) || 1) : groupForm.minSelect,
                })
              }
            />
            Required when ordering
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={groupForm.isActive}
              onChange={(e) => setGroupForm({ ...groupForm, isActive: e.target.checked })}
            />
            Active
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setGroupOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={modifierOpen}
        title={editingModifier ? 'Edit option' : 'Add option'}
        onClose={() => setModifierOpen(false)}
      >
        <form onSubmit={saveModifier} className="space-y-4">
          <Field label="Name">
            <TextInput
              required
              value={modifierForm.name}
              onChange={(e) => setModifierForm({ ...modifierForm, name: e.target.value })}
            />
          </Field>
          <Field label="Additional price">
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={modifierForm.priceDelta}
              onChange={(e) => setModifierForm({ ...modifierForm, priceDelta: e.target.value })}
            />
          </Field>
          <Field label="Sort order">
            <TextInput
              type="number"
              value={modifierForm.sortOrder}
              onChange={(e) => setModifierForm({ ...modifierForm, sortOrder: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={modifierForm.isActive}
              onChange={(e) => setModifierForm({ ...modifierForm, isActive: e.target.checked })}
            />
            Active
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setModifierOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
