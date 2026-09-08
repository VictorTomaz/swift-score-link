import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function useTeeSheetRecipients(rounds, open) {
  const [selection, setSelection] = useState(null);
  const roster = useMemo(() => [...new Map(rounds.flatMap(r => r.players || []).map(p => [p.player_id || p.email || p.name, p])).values()], [rounds]);
  const ids = useMemo(() => [...new Set(roster.map(p => p.player_id).filter(Boolean))].sort(), [roster]);
  const query = useQuery({
    queryKey: ['tee-sheet-recipients', ids], enabled: open, staleTime: 0,
    queryFn: async () => {
      const contacts = [];
      for (let i = 0; i < ids.length; i += 100) {
        contacts.push(...await base44.entities.Player.filter({ id: { $in: ids.slice(i, i + 100) } }, 'name', 100));
      }
      return contacts;
    },
  });
  const recipients = roster.map(p => {
    const contact = query.data?.find(c => c.id === p.player_id);
    return { id: p.player_id || p.email || p.name, name: p.name, email: (contact?.email || p.email || '').trim(), optedIn: (contact?.receive_email_results ?? p.receive_email_results) !== false };
  });
  const selected = selection ?? new Set(recipients.filter(p => p.email && p.optedIn).map(p => p.id));
  const emails = [...new Set(recipients.filter(p => selected.has(p.id) && p.email).map(p => p.email.toLowerCase()))];
  const toggle = id => setSelection(() => { const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); return next; });
  return { recipients, selected, emails, toggle, selectAll: () => setSelection(new Set(recipients.filter(p => p.email).map(p => p.id))), clear: () => setSelection(new Set()), reset: () => setSelection(null), loading: query.isFetching, error: query.isError, retry: query.refetch };
}