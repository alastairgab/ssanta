import { useMemo, useState } from 'react';
import { href } from '../app/router';
import { Icon } from '../components/ui/icons';
import { Badge, Card, ConfirmDialog, EmptyState, Modal, PageHeader, SectionTitle, Select, TextArea, TextInput, Toggle, useToast } from '../components/ui/ui';
import { useEvents, useHouseholds, useParticipants, useRelationships } from '../hooks/useData';
import { HouseholdEditor } from './event/RelationshipsStep';
import { describeRelationship, RELATIONSHIP_TYPE_LABELS } from '../services/relationshipRules';
import { participantsCsv, parseParticipantCsv } from '../services/csvImport';
import { createHousehold, createParticipant, createRelationship, db, deleteParticipantIfUnused, updateParticipant } from '../services/storage';
import type { Household, ID, Participant, RelationshipType } from '../types/models';
import { downloadText } from '../utils/download';
import { participantLabel } from '../utils/format';

function PersonEditor({ person, onClose }: { person: Participant | 'new'; onClose: () => void }) {
  const isNew = person === 'new';
  const [f, setF] = useState({
    displayName: isNew ? '' : person.displayName,
    nickname: isNew ? '' : (person.nickname ?? ''),
    disambiguator: isNew ? '' : (person.disambiguator ?? ''),
    notes: isNew ? '' : (person.notes ?? ''),
    active: isNew ? true : person.active,
  });
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add a person' : `Edit ${person.displayName}`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              if (!f.displayName.trim()) return setError('Enter a name.');
              const patch = {
                displayName: f.displayName.trim(),
                nickname: f.nickname.trim() || undefined,
                disambiguator: f.disambiguator.trim() || undefined,
                notes: f.notes.trim() || undefined,
                active: f.active,
              };
              if (isNew) await createParticipant(patch);
              else await updateParticipant(person.id, patch);
              toast('Saved');
              onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <TextInput label="Name (shown on reveal pages)" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} error={error} maxLength={200} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Nickname" value={f.nickname} onChange={(e) => setF({ ...f, nickname: e.target.value })} maxLength={200} hint="Also matched when importing history." />
          <TextInput label="Label to tell apart same names" value={f.disambiguator} onChange={(e) => setF({ ...f, disambiguator: e.target.value })} maxLength={200} hint="Only you see this." />
        </div>
        <TextArea label="Private notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} hint="Never included in links." maxLength={4000} />
        <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" description="Inactive people are hidden from pickers but keep their history." />
      </div>
    </Modal>
  );
}

export default function PeoplePage({ tab }: { tab?: string }) {
  const people = useParticipants();
  const relationships = useRelationships();
  const households = useHouseholds();
  const events = useEvents();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Participant | 'new' | null>(null);
  const [editingHousehold, setEditingHousehold] = useState<Household | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<Participant | null>(null);
  const [rType, setRType] = useState<RelationshipType>('partner');
  const [rA, setRA] = useState('');
  const [rB, setRB] = useState('');
  const [rLabel, setRLabel] = useState('');
  const [rError, setRError] = useState<string | null>(null);

  const map = useMemo(() => new Map((people ?? []).map((p) => [p.id, p])), [people]);
  const nameOf = (id: ID) => participantLabel(map.get(id));
  if (!people || !relationships || !households || !events) return null;
  const active = people.filter((p) => p.active).sort((a, b) => a.displayName.localeCompare(b.displayName));
  const list = people
    .filter((p) => (showInactive || p.active) && participantLabel(p).toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const tabs = [
    { id: undefined, label: `People (${people.length})` },
    { id: 'relationships', label: `Relationships (${relationships.length})` },
    { id: 'households', label: `Households (${households.length})` },
  ];

  return (
    <>
      <PageHeader title="People & groups" subtitle="Everyone you’ve added across all exchanges. Relationships and households are shared by every exchange." />
      <nav className="mb-6 flex gap-1 rounded-xl bg-white p-1 shadow-card ring-1 ring-pine-900/5" aria-label="People sections">
        {tabs.map((t) => (
          <a
            key={t.label}
            href={href(t.id ? `people/${t.id}` : 'people')}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold ${tab === t.id ? 'bg-pine-800 text-white' : 'text-pine-800 hover:bg-pine-50'}`}
          >
            {t.label}
          </a>
        ))}
      </nav>

      {tab === undefined ? (
        <Card>
          <SectionTitle
            title="People"
            action={
              <>
                <button type="button" className="btn-primary btn-sm" onClick={() => setEditing('new')}>
                  <Icon.Plus className="h-4 w-4" /> Add person
                </button>
                <label className="btn-secondary btn-sm cursor-pointer">
                  <Icon.Upload className="h-4 w-4" /> Import CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      try {
                        const rows = parseParticipantCsv(await file.text());
                        const byHousehold = new Map<string, ID[]>();
                        for (const r of rows) {
                          const p = await createParticipant(r);
                          if (r.household) byHousehold.set(r.household, [...(byHousehold.get(r.household) ?? []), p.id]);
                        }
                        for (const [name, ids] of byHousehold) {
                          const ex = households.find((h) => h.name.toLowerCase() === name.toLowerCase());
                          if (ex) await db.households.update(ex.id, { memberIds: Array.from(new Set([...ex.memberIds, ...ids])) });
                          else await createHousehold(name, ids);
                        }
                        toast(`${rows.length} people imported`);
                      } catch (err) {
                        toast(err instanceof Error ? err.message : 'Could not import that file.', 'error');
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => downloadText(participantsCsv(people, (id) => households.filter((h) => h.memberIds.includes(id)).map((h) => h.name).join('; ')), 'secret-santa-people.csv', 'text/csv;charset=utf-8')}
                >
                  <Icon.Save className="h-4 w-4" /> Export CSV
                </button>
              </>
            }
          />
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <div className="min-w-[14rem] flex-1">
              <TextInput label="Search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Toggle checked={showInactive} onChange={setShowInactive} label="Show inactive" />
          </div>
          {list.length === 0 ? (
            <EmptyState title="Nobody here yet" icon={<Icon.Users />}>
              People you add to exchanges appear here.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-pine-100">
              {list.map((p) => {
                const inEvents = events.filter((e) => e.participantIds.includes(p.id)).length;
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold">
                        {participantLabel(p)} {!p.active ? <Badge tone="grey">Inactive</Badge> : null}
                      </p>
                      <p className="text-xs text-pine-700">
                        {p.nickname ? `“${p.nickname}” · ` : ''}
                        In {inEvents} exchange{inEvents === 1 ? '' : 's'}
                        {households.filter((h) => h.memberIds.includes(p.id)).map((h) => ` · ${h.name}`)}
                      </p>
                    </div>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(p)}>
                      <Icon.Edit className="h-4 w-4" /> Edit
                    </button>
                    <button type="button" className="btn-ghost btn-sm text-berry-700" onClick={() => setToDelete(p)} aria-label={`Remove ${p.displayName}`}>
                      <Icon.Trash className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === 'relationships' ? (
        <Card>
          <SectionTitle title="Relationships" description="Whether a relationship blocks a pairing is decided per exchange, on its Relationships step." />
          <form
            className="mb-5 grid gap-3 rounded-xl bg-pine-50 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!rA || !rB || rA === rB) return setRError('Choose two different people.');
              if (rType === 'custom' && !rLabel.trim()) return setRError('Describe the custom relationship.');
              setRError(null);
              await createRelationship({ type: rType, participantA: rA, participantB: rB, label: rType === 'custom' ? rLabel.trim() : undefined });
              setRA('');
              setRB('');
              setRLabel('');
            }}
          >
            <Select label="Relationship" value={rType} onChange={(e) => setRType(e.target.value as RelationshipType)}>
              {(Object.keys(RELATIONSHIP_TYPE_LABELS) as RelationshipType[]).map((t) => (
                <option key={t} value={t}>
                  {RELATIONSHIP_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
            <Select label={rType === 'parent-child' ? 'Parent' : 'Person'} value={rA} onChange={(e) => setRA(e.target.value)}>
              <option value="">Choose…</option>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {participantLabel(p)}
                </option>
              ))}
            </Select>
            <Select label={rType === 'parent-child' ? 'Child' : 'Other person'} value={rB} onChange={(e) => setRB(e.target.value)}>
              <option value="">Choose…</option>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {participantLabel(p)}
                </option>
              ))}
            </Select>
            <button type="submit" className="btn-primary">
              Add
            </button>
            {rType === 'custom' ? (
              <div className="sm:col-span-2 lg:col-span-4">
                <TextInput label="Describe it" value={rLabel} onChange={(e) => setRLabel(e.target.value)} maxLength={200} />
              </div>
            ) : null}
            {rError ? (
              <p className="text-sm font-medium text-berry-700 sm:col-span-2 lg:col-span-4" role="alert">
                {rError}
              </p>
            ) : null}
          </form>
          <ul className="divide-y divide-pine-100">
            {relationships.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                <Badge>{RELATIONSHIP_TYPE_LABELS[r.type]}</Badge>
                <span className="flex-1">{describeRelationship(r, nameOf)}</span>
                <button type="button" className="btn-ghost btn-sm text-berry-700" aria-label="Delete relationship" onClick={() => void db.relationships.delete(r.id)}>
                  <Icon.Trash className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {tab === 'households' ? (
        <Card>
          <SectionTitle
            title="Households & groups"
            action={
              <button type="button" className="btn-primary btn-sm" onClick={() => setEditingHousehold('new')}>
                <Icon.Plus className="h-4 w-4" /> New
              </button>
            }
          />
          <ul className="grid gap-3 sm:grid-cols-2">
            {households.map((h) => (
              <li key={h.id} className="rounded-xl p-4 ring-1 ring-pine-200">
                <div className="flex items-start justify-between">
                  <p className="font-semibold">
                    {h.name} <span className="text-xs font-normal text-pine-600">({h.kind})</span>
                  </p>
                  <div className="flex">
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setEditingHousehold(h)} aria-label={`Edit ${h.name}`}>
                      <Icon.Edit className="h-4 w-4" />
                    </button>
                    <button type="button" className="btn-ghost btn-sm text-berry-700" onClick={() => void db.households.delete(h.id)} aria-label={`Delete ${h.name}`}>
                      <Icon.Trash className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {h.memberIds.map((m) => (
                    <Badge key={m}>{nameOf(m)}</Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {editing ? <PersonEditor person={editing} onClose={() => setEditing(null)} /> : null}
      {editingHousehold ? <HouseholdEditor household={editingHousehold} candidates={active.map((p) => p.id)} nameOf={nameOf} onClose={() => setEditingHousehold(null)} /> : null}
      <ConfirmDialog
        open={toDelete !== null}
        title={`Remove ${toDelete?.displayName}?`}
        confirmLabel="Remove"
        danger
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          const res = await deleteParticipantIfUnused(toDelete!.id);
          toast(res === 'deleted' ? 'Person deleted' : 'This person has past assignments, so they were marked inactive instead (their history is kept).', res === 'deleted' ? 'success' : 'info');
          setToDelete(null);
        }}
      >
        <p>If this person appears in any history or confirmed draw, they’ll be marked inactive instead of deleted, so no history is lost.</p>
      </ConfirmDialog>
    </>
  );
}
