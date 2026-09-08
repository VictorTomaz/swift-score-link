import React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

export default function TeeSheetRecipients({ contacts }) {
  if (contacts.loading) return <p role="status" className="text-sm text-muted-foreground">Loading player email addresses…</p>;
  if (contacts.error) return <div role="alert"><p>Unable to load player email addresses.</p><Button onClick={() => contacts.retry()}>Retry</Button></div>;
  return <div className="space-y-2">
    <p className="text-sm font-medium">{contacts.recipients.length} players · {contacts.recipients.filter(p => p.email).length} with email · {contacts.recipients.filter(p => !p.email).length} missing email</p>
    <p className="text-sm text-muted-foreground">Selected players go in BCC. Players without saved email addresses cannot be included; players opted out are unchecked by default.</p>
    <div className="flex gap-2"><Button size="sm" variant="outline" onClick={contacts.selectAll}>Select all</Button><Button size="sm" variant="outline" onClick={contacts.clear}>Clear</Button></div>
    <div className="max-h-48 space-y-2 overflow-y-auto">
      {contacts.recipients.length === 0 && <p className="text-sm text-muted-foreground">No players in this tournament.</p>}
      {contacts.recipients.map(p => <label key={p.id} className="flex items-center gap-3 rounded-md border p-2">
        <Checkbox checked={!!p.email && contacts.selected.has(p.id)} disabled={!p.email} onCheckedChange={() => contacts.toggle(p.id)} />
        <div className="min-w-0"><p className="text-sm font-medium">{p.name}</p><p className="break-all text-xs text-muted-foreground">{p.email || 'No saved email'}{!p.optedIn && p.email ? ' · Opted out' : ''}</p></div>
      </label>)}
    </div>
    <p className="text-sm font-medium">{contacts.emails.length} email recipients selected</p>
  </div>;
}