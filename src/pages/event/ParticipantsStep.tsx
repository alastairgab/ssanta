import { useMemo, useState } from 'react';
import { href } from '../../app/router';
import { Icon } from '../../components/ui/icons';
import { Badge, Callout, Card, EmptyState, Modal, SectionTitle, TextArea, TextInput, Toggle, useAsyncAction, useToast } from '../../components/ui/ui';
import { generateUniqueCodename, normaliseCodename } from '../../services/codenames';
import { parseBulkNames, parseParticipantCsv, resolveName, type ParticipantImportRow } from '../../services/csvImport';
import { createHousehold, createParticipant, db, ensureCodenames, updateEvent, updateParticipant } from '../../services/storage';
import type { ID, Participant } from '../../types/models';
import { participantLabel } from '../../utils/format';
import type { EventCtx } from './EventWorkspace';

interface PendingRow extends ParticipantImportRow {
  key: number;
  /** 'new' or an existing participant id */
  target: string;
  candidates: Participant[];
}

function ImportPreview({ rows, setRows }: { rows: PendingRow[]; setRows: (r: PendingRow[]) => void }) {
  return (
    <div className="max-h-[50vh] overflow-y-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Name</th>
            <th>Use</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="font-medium">
                {r.displayName}
                {r.household ? <span className="block text-xs text-pine-600">Household: {r.household}</span> : null}
              </td>
              <td>
                <select
                  className="input"
                  aria-label={`Profile for ${r.displayName}`}
                  value={r.target}
                  onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, target: e.target.value } : x)))}
                >
                  <option value="new">Create a new person</option>
                  {r.candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      Existing: {participantLabel(c)}
                    </option>
                  ))}
                  <option value="skip">Skip</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ParticipantsStep({ ctx }: { ctx: EventCtx }) {
  const { event, members, people } = ctx;
  const toast = useToast();
  const { busy, run } = useAsyncAction();
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [pending, setPending] = useState<PendingRow[] | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [picked, setPicked] = useState<Set<ID>>(new Set());
  const allPeople = useMemo(() => Array.from(people.values()), [people]);
  const notInEvent = allPeople.filter((p) => p.active && !event.participantIds.includes(p.id)).sort((a, b) => a.displayName.localeCompare(b.displayName));

  const duplicates = useMemo(() => {
    const counts = new Map<string, Participant[]>();
    for (const m of members) {
      const k = participantLabel(m).toLowerCase();
      counts.set(k, [...(counts.get(k) ?? []), m]);
    }
    return Array.from(counts.values()).filter((l) => l.length > 1);
  }, [members]);

  const codenameDupes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const id of event.participantIds) {
      const c = event.codenames[id];
      if (c) seen.set(normaliseCodename(c), (seen.get(normaliseCodename(c)) ?? 0) + 1);
    }
    return new Set(Array.from(seen.entries()).filter(([, n]) => n > 1).map(([k]) => k));
  }, [event]);

  const addToEvent = async (ids: ID[]) => {
    const fresh = await db.events.get(event.id);
    const next = Array.from(new Set([...(fresh?.participantIds ?? []), ...ids]));
    await updateEvent(event.id, { participantIds: next });
    if (event.codenamesEnabled) await ensureCodenames(event.id);
  };

  const addOne = async () => {
    const n = name.trim();
    if (!n) {
      setNameError('Enter a name.');
      return;
    }
    const sameName = allPeople.filter((p) => p.displayName.toLowerCase() === n.toLowerCase() && (p.disambiguator ?? '') === label.trim());
    if (sameName.length > 0 && !label.trim()) {
      setNameError(`There's already a "${n}". Add a short label (e.g. "Mum's side") so you can tell them apart, or add the existing person from "Add existing people".`);
      return;
    }
    setNameError(null);
    await run(async () => {
      const p = await createParticipant({ displayName: n, disambiguator: label });
      await addToEvent([p.id]);
      setName('');
      setLabel('');
    }, `${n} added`);
  };

  const startImport = (rows: ParticipantImportRow[]) => {
    const pend = rows.map((r, i) => {
      const res = resolveName(r.disambiguator ? `${r.displayName} (${r.disambiguator})` : r.displayName, allPeople);
      const candidates = res.status === 'matched' ? [people.get(res.id)!] : res.status === 'ambiguous' ? res.candidates.map((c) => people.get(c)!) : [];
      return { ...r, key: i, target: res.status === 'matched' ? res.id : 'new', candidates };
    });
    setPending(pend);
    setBulkOpen(false);
  };

  const applyImport = async () => {
    if (!pending) return;
    await run(async () => {
      const ids: ID[] = [];
      const households = await db.households.toArray();
      const byHousehold = new Map<string, ID[]>();
      for (const r of pending) {
        if (r.target === 'skip') continue;
        let id = r.target;
        if (id === 'new') id = (await createParticipant({ displayName: r.displayName, nickname: r.nickname, notes: r.notes, disambiguator: r.disambiguator })).id;
        ids.push(id);
        if (r.household) byHousehold.set(r.household, [...(byHousehold.get(r.household) ?? []), id]);
      }
      for (const [hName, memberIds] of byHousehold) {
        const existing = households.find((h) => h.name.toLowerCase() === hName.toLowerCase());
        if (existing) await db.households.update(existing.id, { memberIds: Array.from(new Set([...existing.memberIds, ...memberIds])) });
        else await createHousehold(hName, memberIds);
      }
      await addToEvent(ids);
      setPending(null);
      setBulkText('');
    }, 'Participants imported');
  };

  const remove = async (id: ID) => {
    await updateEvent(event.id, { participantIds: event.participantIds.filter((x) => x !== id) });
    toast(`${ctx.nameOf(id)} removed from this exchange (their profile and history are kept).`, 'info');
  };

  return (
    <div className="space-y-6">
      {ctx.activeDraw ? (
        <Callout tone="warning" title="A draw is already confirmed">
          Changing who is in this exchange won’t change the confirmed draw. To remove someone who dropped out with as few changes as possible, use{' '}
          <a className="font-semibold underline" href={href(`events/${event.id}/withdraw`)}>
            Withdrawals
          </a>
          . To start over, generate a new draw (this creates a new version).
        </Callout>
      ) : null}

      <Card>
        <SectionTitle
          title={`Participants (${members.length})`}
          description="Everyone listed here gives one gift and receives one gift."
          action={
            <>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setPickOpen(true)} disabled={notInEvent.length === 0}>
                <Icon.Users className="h-4 w-4" /> Add existing people
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setBulkOpen(true)}>
                <Icon.Upload className="h-4 w-4" /> Bulk add / CSV
              </button>
            </>
          }
        />
        <form
          className="mb-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void addOne();
          }}
        >
          <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Simba" error={nameError} maxLength={200} />
          <TextInput label="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Uncle, Mum's side" hint="Helps tell apart people with the same name." maxLength={200} />
          <button type="submit" className="btn-primary" disabled={busy}>
            <Icon.Plus className="h-4 w-4" /> Add
          </button>
        </form>

        {duplicates.length > 0 ? (
          <Callout tone="warning" title="Some people share the same name" className="mb-4">
            {duplicates.map((d) => (
              <p key={d[0]!.id}>
                {d.length} people are called “{participantLabel(d[0])}”. Give each a label below so links and history stay clear — the app keeps them apart internally either way.
              </p>
            ))}
          </Callout>
        ) : null}

        {members.length === 0 ? (
          <EmptyState title="No participants yet" icon={<Icon.Users />}>
            Add names one at a time above, paste a list with “Bulk add”, or reuse people from previous exchanges.
          </EmptyState>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Label</th>
                  {event.codenamesEnabled ? <th>Codename</th> : null}
                  <th>Groups</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="max-w-[16rem] break-words font-medium">{m.displayName}</td>
                    <td>
                      <input
                        className="input min-h-[36px] py-1.5"
                        aria-label={`Label for ${m.displayName}`}
                        defaultValue={m.disambiguator ?? ''}
                        placeholder="—"
                        maxLength={200}
                        onBlur={(e) => {
                          if ((m.disambiguator ?? '') !== e.target.value.trim()) void updateParticipant(m.id, { disambiguator: e.target.value.trim() || undefined });
                        }}
                      />
                    </td>
                    {event.codenamesEnabled ? (
                      <td>
                        <div className="flex items-center gap-1">
                          <input
                            key={event.codenames[m.id] ?? ''}
                            className={`input min-h-[36px] py-1.5 ${codenameDupes.has(normaliseCodename(event.codenames[m.id] ?? '')) ? 'ring-berry-500' : ''}`}
                            aria-label={`Codename for ${m.displayName}`}
                            defaultValue={event.codenames[m.id] ?? ''}
                            maxLength={200}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v !== (event.codenames[m.id] ?? '')) void updateEvent(event.id, { codenames: { ...event.codenames, [m.id]: v } });
                            }}
                          />
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            title="New random codename"
                            aria-label={`New codename for ${m.displayName}`}
                            onClick={() => {
                              const others = Object.entries(event.codenames).filter(([k]) => k !== m.id).map(([, v]) => v);
                              void updateEvent(event.id, { codenames: { ...event.codenames, [m.id]: generateUniqueCodename(others) } });
                            }}
                          >
                            <Icon.Refresh className="h-4 w-4" />
                          </button>
                        </div>
                        {codenameDupes.has(normaliseCodename(event.codenames[m.id] ?? '')) ? <p className="text-xs text-berry-700">Duplicate codename</p> : null}
                      </td>
                    ) : null}
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {ctx.households
                          .filter((h) => h.memberIds.includes(m.id))
                          .map((h) => (
                            <Badge key={h.id}>{h.name}</Badge>
                          ))}
                      </div>
                    </td>
                    <td className="text-right">
                      <button type="button" className="btn-ghost btn-sm text-berry-700" onClick={() => void remove(m.id)} aria-label={`Remove ${m.displayName} from this exchange`}>
                        <Icon.X className="h-4 w-4" />
                        <span className="hidden sm:inline">Remove</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle title="Secret Santa codenames" description="Fun festive nicknames shown on each person's reveal page (“Welcome back, Agent Snowflake”). They're decorative — you, as organiser, can see who has which codename, so they don't make anyone anonymous." />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Toggle
            checked={event.codenamesEnabled}
            onChange={async (v) => {
              await updateEvent(event.id, { codenamesEnabled: v });
              if (v) await ensureCodenames(event.id);
            }}
            label="Use codenames"
          />
          {event.codenamesEnabled ? (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={async () => {
                const used: string[] = [];
                const next: Record<string, string> = {};
                for (const id of event.participantIds) {
                  const c = generateUniqueCodename(used);
                  used.push(c);
                  next[id] = c;
                }
                await updateEvent(event.id, { codenames: next });
                toast('New codenames generated');
              }}
            >
              <Icon.Refresh className="h-4 w-4" /> Regenerate all
            </button>
          ) : null}
        </div>
      </Card>

      <Modal
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        title="Add existing people"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setPickOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={picked.size === 0}
              onClick={async () => {
                await addToEvent(Array.from(picked));
                setPicked(new Set());
                setPickOpen(false);
                toast('People added');
              }}
            >
              Add {picked.size || ''}
            </button>
          </>
        }
      >
        <ul className="space-y-1">
          {notInEvent.map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-pine-50">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-pine-700"
                  checked={picked.has(p.id)}
                  onChange={(e) => {
                    const s = new Set(picked);
                    if (e.target.checked) s.add(p.id);
                    else s.delete(p.id);
                    setPicked(s);
                  }}
                />
                {participantLabel(p)}
              </label>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Bulk add participants"
        footer={
          <>
            <label className="btn-secondary cursor-pointer">
              <Icon.Upload className="h-4 w-4" /> Import CSV file
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const rows = parseParticipantCsv(await f.text());
                    if (rows.length === 0) toast('No names found in that file.', 'error');
                    else startImport(rows);
                  } catch (err) {
                    toast(err instanceof Error ? err.message : 'Could not read the file.', 'error');
                  }
                  e.target.value = '';
                }}
              />
            </label>
            <button
              type="button"
              className="btn-primary"
              disabled={!bulkText.trim()}
              onClick={() => {
                const names = parseBulkNames(bulkText);
                if (names.length === 0) toast('No names found.', 'error');
                else startImport(names.map((n) => ({ displayName: n })));
              }}
            >
              Preview
            </button>
          </>
        }
      >
        <TextArea label="One name per line" rows={8} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={'Simba\nNala\nTimon\nPumbaa'} />
        <p className="hint mt-2">
          CSV files can have columns: <code>name, nickname, label, household, notes</code>. People with matching names can be linked to existing profiles in the next step.
        </p>
      </Modal>

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title={`Review ${pending?.length ?? 0} names`}
        size="lg"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setPending(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={() => void applyImport()} disabled={busy}>
              Add to exchange
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-pine-700">Where a name matches someone from a previous exchange, choose whether it's the same person (keeps their history) or a new person.</p>
        {pending ? <ImportPreview rows={pending} setRows={setPending} /> : null}
      </Modal>
    </div>
  );
}
