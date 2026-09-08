import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Printer, Mail, Loader2 } from 'lucide-react';
import { shareOrDownloadPdf } from '@/lib/fileShare';
import teeSheetEmailBody from '@/components/logistics/teeSheetEmailBody';
import { toast } from 'sonner';
import TeeSheetEmailDialog from '@/components/logistics/TeeSheetEmailDialog';

export default function CombinedTeeSheetActions({ rounds, sheet, email, beforeExport, disabled }) {
  const [busy, setBusy] = useState(false);
  const [printError, setPrintError] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const title = `Combined Tee Sheet - ${rounds[0]?.event_name || 'Tournament'}`;
  const print = async () => {
    setBusy(true);
    setPrintError('');
    let step = 'Saving tee times';
    try {
      await beforeExport();
      step = 'Generating combined PDF';
      const { data } = await base44.functions.invoke('generateTeeSheetPdf', { roundIds: rounds.map(r => r.id) });
      if (!data?.url) throw new Error(data?.error || 'No PDF returned');
      step = 'Opening PDF';
      await shareOrDownloadPdf(data.url, data.filename);
      toast.success('Combined tee sheet ready to print or share.');
    } catch (error) {
      const detail = error.response?.data?.error || error.response?.data?.message || error.message;
      const message = `${step}: ${typeof detail === 'string' ? detail : 'The request could not be completed.'}`;
      setPrintError(message);
      toast.error(message);
    } finally { setBusy(false); }
  };
  const body = teeSheetEmailBody(rounds, sheet, title);

  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={print} disabled={busy || disabled || !sheet.rows.length} className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} {busy ? 'Preparing…' : 'Print'}</Button>
      <Button size="sm" disabled={busy || disabled || !sheet.rows.length} onClick={() => setEmailOpen(true)} className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"><Mail className="h-4 w-4" />Email Players</Button>
    </div>
    <TeeSheetEmailDialog open={emailOpen} onOpenChange={setEmailOpen} rounds={rounds} title={title} body={body} />
    {printError && <p role="alert" className="max-w-sm break-words rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{printError}</p>}
  </div>;
}