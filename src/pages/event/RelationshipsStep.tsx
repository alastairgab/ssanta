import { useState } from 'react';
import { Icon } from '../../components/ui/icons';
import { Badge, Callout, Card, ConfirmDialog, EmptyState, Modal, SectionTitle, Select, TextInput, Toggle, useToast } from '../../components/ui/ui';
import {
  describePolicyEffect,
  describeRelationship,
  effectivePolicy,
  isOverridden,
  POLICY_LABELS,
  RELATIONSHIP_TYPE_LABELS,
} from '../../services/relationshipRules';
import { createHousehold, createRelationship, db, updateRules } from '../../services/storage';
import type { ExclusionPolicy, Household, ID, RelationshipType } from '../../types/models';
import type { EventCtx } from './EventWorkspace';

const TYPES: RelationshipType[] = ['partner', 'parent-child', 'sibling', 'household', 'custom'];

export function HouseholdEditor({ household, candidates, nameOf, onClose }: { household: Household | 'new'; candidates: ID[]; nameOf: (id: ID) => string; onClose: () => void }) {
  const isNew = household === 'new';
  const [name, setName] = useState(isNew ? '' : household.name);
  const [kind, setKind] = useState<Household['kind']>(isNew ? 'household' : household.kind);
  const [members, setMembers] = useState<Set<ID>>(new Set(isNew ? [] : household.memberIds));
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const ids = Array.from(new Set([...candidates, ...members]));
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'New household or group' : `Edit ${household.name}`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              if (!name.trim()) {
                setError('Give it a name, e.g. "The Smiths".');
                return;
              }
              if (isNew) await createHousehold(name, Array.from(members), kind);
              else await db.households.update(household.id, { name: name.trim(), kind, memberIds: Array.from(members) });
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
        <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} error={error} placeholder="The Smiths" maxLength={200} />
        <Select label="Type" value={kind} onChange={(e) => setKind(e.target.value as Household['kind'])}>
          <option value="household">Household (people who live together)</option>
          <option value="group">Group (team, family branch…)</option>
        </Select>
        <fieldset>
          <legend className="label">Members</legend>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {ids.map((id) => (
              <li key={id}>
                <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-pine-50">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-pine-700"
                    checked={members.has(id)}
                    onChange={(e) => {
                      const s = new Set(members);
                      if (e.target.checked) s.add(id);
                      else s.delete(id);
                      setMembers(s);
                    }}
                  />
                  {nameOf(id)}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </div>
    </Modal>
  );
}

export default function RelationshipsStep({ ctx }: { ctx: EventCtx }) {
  const { event, members, nameOf } = ctx;
  const toast = useToast();
  const memberIds = new Set(event.participantIds);
  const rels = ctx.relationships.filter((r) => memberIds.has(r.participantA) && memberIds.has(r.participantB));
  const households = ctx.households.filter((h) => h.memberIds.some((m) => memberIds.has(m)));
  const [type, setType] = useState<RelationshipType>('partner');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Household | 'new' | null>(null);
  const [deleteRel, setDeleteRel] = useState<ID | null>(null);
  const [deleteHousehold, setDeleteHousehold] = useState<ID | null>(null);

  const add = async () => {
    if (!a || !b) return setFormError('Choose two people.');
    if (a === b) return setFormError('Choose two different people.');
    if (type === 'custom' && !customLabel.trim()) return setFormError('Describe the custom relationship.');
    const exists = ctx.relationships.some((r) => r.type === type && ((r.participantA === a && r.participantB === b) || (r.participantA === b && r.participantB === a)));
    if (exists) return setFormError('That relationship already exists.');
    setFormError(null);
    await createRelationship({ type, participantA: a, participantB: b, label: type === 'custom' ? customLabel.trim() : undefined });
    setA('');
    setB('');
    setCustomLabel('');
    toast('Relationship added');
  };

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle
          title="Relationship rules for this exchange"
          description="Define relationships once — they're remembered for future years. Here you decide what each type of relationship means for this exchange."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TYPES.map((t) => (
            <Select
              key={t}
              label={RELATIONSHIP_TYPE_LABELS[t]}
              value={event.rules.relationshipPolicies[t]}
              onChange={(e) => void updateRules(event.id, (r) => ({ ...r, relationshipPolicies: { ...r.relationshipPolicies, [t]: e.target.value as ExclusionPolicy } }))}
              hint={t === 'parent-child' ? 'One-way: the parent cannot buy for the child.' : t === 'custom' ? 'Applies to all custom relationships.' : undefined}
            >
              {(['none', 'one-way', 'mutual'] as ExclusionPolicy[]).map((p) => (
                <option key={p} value={p}>
                  {POLICY_LABELS[p]}
                </option>
              ))}
            </Select>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle title={`Relationships (${rels.length})`} description="Exceptions let one pair differ from the default for their relationship type." />
        <form
          className="mb-5 grid gap-3 rounded-xl bg-pine-50 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Select label="Relationship" value={type} onChange={(e) => setType(e.target.value as RelationshipType)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {RELATIONSHIP_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
          <Select label={type === 'parent-child' ? 'Parent' : 'Person'} value={a} onChange={(e) => setA(e.target.value)}>
            <option value="">Choose…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {nameOf(m.id)}
              </option>
            ))}
          </Select>
          <Select label={type === 'parent-child' ? 'Child' : 'Other person'} value={b} onChange={(e) => setB(e.target.value)}>
            <option value="">Choose…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {nameOf(m.id)}
              </option>
            ))}
          </Select>
          <button type="submit" className="btn-primary">
            <Icon.Plus className="h-4 w-4" /> Add
          </button>
          {type === 'custom' ? (
            <div className="sm:col-span-2 lg:col-span-4">
              <TextInput label="Describe it" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="Best friends, manager & report…" maxLength={200} />
            </div>
          ) : null}
          {formError ? (
            <p className="text-sm font-medium text-berry-700 sm:col-span-2 lg:col-span-4" role="alert">
              {formError}
            </p>
          ) : null}
        </form>

        {rels.length === 0 ? (
          <EmptyState title="No relationships yet" icon={<Icon.Heart />}>
            Add partners, parents and children, or siblings. With the default settings partners can’t draw each other.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-pine-100">
            {rels.map((rel) => {
              const pol = effectivePolicy(rel, event.rules);
              const overridden = isOverridden(rel, event.rules);
              return (
                <li key={rel.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-[12rem] flex-1">
                    <p className="font-medium">{describeRelationship(rel, nameOf)}</p>
                    <p className="text-xs text-pine-700">
                      <Badge tone={pol === 'none' ? 'grey' : 'red'}>{pol === 'none' ? 'Allowed' : 'Restricted'}</Badge> {describePolicyEffect(rel, pol, nameOf)}
                      {overridden ? <span className="ml-1 font-semibold text-gold-600">(exception)</span> : null}
                    </p>
                  </div>
                  <label className="sr-only" htmlFor={`pol-${rel.id}`}>
                    Rule for this pair
                  </label>
                  <select
                    id={`pol-${rel.id}`}
                    className="input w-auto min-h-[40px] py-1.5"
                    value={overridden ? event.rules.relationshipOverrides[rel.id] : 'default'}
                    onChange={(e) =>
                      void updateRules(event.id, (r) => {
                        const o = { ...r.relationshipOverrides };
                        if (e.target.value === 'default') delete o[rel.id];
                        else o[rel.id] = e.target.value as ExclusionPolicy;
                        return { ...r, relationshipOverrides: o };
                      })
                    }
                  >
                    <option value="default">Default ({POLICY_LABELS[event.rules.relationshipPolicies[rel.type]]})</option>
                    <option value="none">Exception: no exclusion</option>
                    <option value="one-way">Exception: one-way</option>
                    <option value="mutual">Exception: mutual</option>
                  </select>
                  {rel.type !== 'parent-child' ? (
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      title="Swap who is first (changes the direction of one-way rules)"
                      onClick={() => void db.relationships.update(rel.id, { participantA: rel.participantB, participantB: rel.participantA })}
                    >
                      ⇄<span className="sr-only">Swap direction</span>
                    </button>
                  ) : null}
                  <button type="button" className="btn-ghost btn-sm text-berry-700" onClick={() => setDeleteRel(rel.id)} aria-label="Delete relationship">
                    <Icon.Trash className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle
          title="Households & groups"
          description="Members of the same household or group can be kept from drawing each other — handy for big families."
          action={
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing('new')}>
              <Icon.Plus className="h-4 w-4" /> New household
            </button>
          }
        />
        <div className="mb-4">
          <Toggle
            checked={event.rules.householdExclusion}
            onChange={(v) => void updateRules(event.id, (r) => ({ ...r, householdExclusion: v }))}
            label="People in the same household or group can't draw each other"
            description="You can make exceptions for individual households below."
          />
        </div>
        {households.length === 0 ? (
          <p className="text-sm text-pine-700">No households include people from this exchange yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {households.map((h) => {
              const active = event.rules.householdExclusion && event.rules.householdOverrides[h.id] !== false;
              const inEvent = h.memberIds.filter((m) => memberIds.has(m));
              return (
                <li key={h.id} className="rounded-xl p-4 ring-1 ring-pine-200">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {h.name} <span className="text-xs font-normal text-pine-600">({h.kind})</span>
                      </p>
                      <p className="text-xs text-pine-700">{active ? `${inEvent.length} people here can't draw each other` : 'No restriction this year'}</p>
                    </div>
                    <div className="flex">
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(h)} aria-label={`Edit ${h.name}`}>
                        <Icon.Edit className="h-4 w-4" />
                      </button>
                      <button type="button" className="btn-ghost btn-sm text-berry-700" onClick={() => setDeleteHousehold(h.id)} aria-label={`Delete ${h.name}`}>
                        <Icon.Trash className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {inEvent.map((m) => (
                      <Badge key={m}>{nameOf(m)}</Badge>
                    ))}
                  </div>
                  {event.rules.householdExclusion ? (
                    <div className="mt-3">
                      <Toggle
                        checked={event.rules.householdOverrides[h.id] === false}
                        onChange={(v) =>
                          void updateRules(event.id, (r) => {
                            const o = { ...r.householdOverrides };
                            if (v) o[h.id] = false;
                            else delete o[h.id];
                            return { ...r, householdOverrides: o };
                          })
                        }
                        label="Exception: allow them to draw each other"
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {households.some((h) => h.memberIds.filter((m) => memberIds.has(m)).length * 2 > members.length) && event.rules.householdExclusion ? (
          <Callout tone="warning" className="mt-4" title="A household is more than half the group">
            When over half of the participants share a household, a draw where nobody buys inside their household is impossible. Add an exception or more participants.
          </Callout>
        ) : null}
      </Card>

      {editing ? <HouseholdEditor household={editing} candidates={event.participantIds} nameOf={nameOf} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog
        open={deleteRel !== null}
        title="Delete relationship?"
        danger
        confirmLabel="Delete"
        onCancel={() => setDeleteRel(null)}
        onConfirm={async () => {
          await db.relationships.delete(deleteRel!);
          await updateRules(event.id, (r) => {
            const o = { ...r.relationshipOverrides };
            delete o[deleteRel!];
            return { ...r, relationshipOverrides: o };
          });
          setDeleteRel(null);
        }}
      >
        <p>This relationship is shared by all your exchanges, so it will be removed everywhere. Confirmed draws are not affected.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={deleteHousehold !== null}
        title="Delete household?"
        danger
        confirmLabel="Delete"
        onCancel={() => setDeleteHousehold(null)}
        onConfirm={async () => {
          await db.households.delete(deleteHousehold!);
          setDeleteHousehold(null);
        }}
      >
        <p>The household is removed from all exchanges. People are not deleted.</p>
      </ConfirmDialog>
    </div>
  );
}
