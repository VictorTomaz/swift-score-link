import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Mail, Copy } from 'lucide-react';
import useTeeSheetRecipients from '@/components/logistics/useTeeSheetRecipients';
import TeeSheetRecipients from '@/components/logistics/TeeSheetRecipients';

export default function TeeSheetEmailDialog({ open, onOpenChange, rounds, title, body }) {
  const [copyStatus, setCopyStatus] = useState('');
  const contacts = useTeeSheetRecipients(rounds, open);
  const canEmail = !contacts.loading && !contacts.error && contacts.emails.length > 0;
  const mailto = `mailto:?bcc=${encodeURIComponent(contacts.emails.join(','))}&subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body.replace(/\r?\n/g, '\r\n'))}`;
  const draft = `BCC: ${contacts.emails.join(', ')}\nSubject: ${title}\n\n${body}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopyStatus('Copied — paste the addresses into BCC and the tee sheet into your email.');
    } catch {
      setCopyStatus('Select the message below and copy it into your email app.');
    }
  };
  return <Dialog open={open} onOpenChange={value => { setCopyStatus(''); contacts.reset(); onOpenChange(value); }}>
    <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{rounds.length > 1 ? 'Email tournament tee sheet — all flights' : 'Email tee sheet'}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Open your email app, then press Send. If it doesn’t open, copy the message and paste it into your email.</p>
      <TeeSheetRecipients contacts={contacts} />
      <p className="text-sm font-medium">{title}</p>
      <div className="flex flex-wrap gap-2">
        {canEmail ? <Button asChild className="gap-2"><a href={mailto} target="_blank" rel="noopener noreferrer"><Mail className="h-4 w-4" />Email players ({contacts.emails.length})</a></Button> : <Button disabled className="gap-2"><Mail className="h-4 w-4" />Email players</Button>}
        <Button variant="outline" onClick={copy} disabled={!canEmail} className="gap-2"><Copy className="h-4 w-4" />Copy email</Button>
      </div>
      {copyStatus && <p role="status" className="text-sm text-muted-foreground">{copyStatus}</p>}
      <textarea aria-label="Tee sheet email message" readOnly value={draft} className="h-56 w-full rounded-md border border-input bg-background p-3 text-sm text-foreground" onFocus={event => event.target.select()} />
    </DialogContent>
  </Dialog>;
}