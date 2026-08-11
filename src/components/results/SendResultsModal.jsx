import React, { useState, useMemo, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { MessageSquare, Mail, Share2, ChevronRight, ChevronLeft, Check, Printer, Loader2 } from "lucide-react";
import { formatResultsText } from "@/lib/formatResults";
import { shareOrDownloadPdf } from "@/lib/fileShare";

const STEPS = { SELECT: "select", PREVIEW: "preview" };

export default function SendResultsModal({ isOpen, onClose, round, results, dayLabel }) {
  const [step, setStep] = useState(STEPS.SELECT);
  const [selectedIds, setSelectedIds] = useState(new Set());


  const messageText = useMemo(() => {
    return formatResultsText(round, results, dayLabel);
  }, [round, results, dayLabel]);

  // Load player contact info from the master player list
  const { data: masterPlayers = [] } = useQuery({
    queryKey: ["players-contact"],
    queryFn: () => base44.entities.Player.list('-name', 200),
    enabled: isOpen,
    staleTime: 0, // Always refetch when modal opens
  });

  // Build enriched player list for the current round
  const roundPlayers = useMemo(() => {
    return (round?.players || []).map(rp => {
      // Try to match by player_id first, then by name (case-insensitive)
      const master = masterPlayers.find(mp => 
        mp.id === rp.player_id || mp.name.toLowerCase() === rp.name.toLowerCase()
      );
      // Contact info priority: master roster → contact stored inline on round player (one-time guests)
      return {
        player_id: rp.player_id,
        name: rp.name,
        mobile_phone: master?.mobile_phone || rp.mobile_phone || "",
        email: master?.email || rp.email || "",
        receive_text_results: master?.receive_text_results !== false,
        receive_email_results: master?.receive_email_results !== false,
      };
    });
  }, [round, masterPlayers]);

  const playersWithPhone = useMemo(() => roundPlayers.filter(p => p.mobile_phone), [roundPlayers]);
  const playersWithEmail = useMemo(() => roundPlayers.filter(p => p.email), [roundPlayers]);
  const playersWithContact = useMemo(() => roundPlayers.filter(p => p.mobile_phone || p.email), [roundPlayers]);

  // Default selection on open: players with contact info who opted in to receive results
  useEffect(() => {
    if (isOpen) {
      setStep(STEPS.SELECT);
      const defaultSelected = new Set(
        roundPlayers
          .filter(p => {
            const hasPhone = p.mobile_phone && p.receive_text_results;
            const hasEmail = p.email && p.receive_email_results;
            return hasPhone || hasEmail;
          })
          .map(p => p.player_id)
      );
      setSelectedIds(defaultSelected);
    }
  }, [isOpen, roundPlayers.length]);

  const togglePlayer = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllWithPhone = () => setSelectedIds(new Set(playersWithContact.map(p => p.player_id)));
  const clearAll = () => setSelectedIds(new Set());

  const selectedPlayers = useMemo(() => roundPlayers.filter(p => selectedIds.has(p.player_id)), [roundPlayers, selectedIds]);
  const selectedPhones = useMemo(() => selectedPlayers.map(p => p.mobile_phone).filter(Boolean), [selectedPlayers]);
  const selectedEmails = useMemo(() => selectedPlayers.map(p => p.email).filter(Boolean), [selectedPlayers]);

  const [smsLinksReady, setSmsLinksReady] = useState(false);
  const [sentIds, setSentIds] = useState(new Set());
  const [emailSending, setEmailSending] = useState(false);
  const [printing, setPrinting] = useState(false);

  const handlePrintResults = async () => {
    if (!round?.id) return;
    setPrinting(true);
    try {
      const res = await base44.functions.invoke("generateResultsPdf", { roundId: round.id, force: true });
      const data = res?.data || res;
      if (data?.url) {
        await shareOrDownloadPdf(data.url, data.filename || `results-${round.event_name || "golf"}.pdf`);
      } else if (data?.error) {
        toast.error("Could not generate PDF: " + data.error);
      } else {
        toast.error("Could not generate results PDF");
      }
    } catch (err) {
      toast.error("Failed to generate PDF: " + (err?.response?.data?.error || err?.message || "Unknown error"));
    } finally {
      setPrinting(false);
    }
  };

  const handleSendViaSMS = async () => {
    if (selectedPhones.length === 0) {
      toast.error("No phone numbers selected");
      return;
    }
    await base44.entities.Round.update(round.id, { is_public: true });
    setSmsLinksReady(true);
  };

  const handleEmail = async (sendToMe = false) => {
    const subject = `${round?.event_name || "Golf"} Results`;
    const htmlBody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;">${messageText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</div>`;
    setEmailSending(true);
    try {
      if (sendToMe) {
        // Open email client with BCC pre-filled for manual sending
        const bccList = selectedEmails.join(',');
        // Convert newlines to CRLF and encode properly for mailto
        const bodyWithBreaks = messageText.replace(/\n/g, '\r\n');
        const mailtoUrl = `mailto:?bcc=${encodeURIComponent(bccList)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyWithBreaks)}`;
        window.open(mailtoUrl, '_blank');
        toast.success("Opening your email app — press send to deliver");
      } else {
        // Send directly to players
        await Promise.all(
          selectedEmails.map(email =>
            base44.integrations.Core.SendEmail({
              to: email,
              subject,
              body: htmlBody
            })
          )
        );
        toast.success(`Results emailed to ${selectedEmails.length} player${selectedEmails.length > 1 ? "s" : ""}`);
      }
    } catch (err) {
      toast.error("Failed to send email");
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === STEPS.PREVIEW && (
              <button onClick={() => setStep(STEPS.SELECT)} className="mr-1">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            {step === STEPS.SELECT ? "Send Results" : "Preview & Send"}
          </DialogTitle>
        </DialogHeader>

        {step === STEPS.SELECT && (
          <div className="space-y-4">
            {/* Print Results — generates a branded PDF via the backend */}
            <div className="border-2 border-border rounded-lg p-3 space-y-3">
              <div>
                <p className="text-sm font-bold text-foreground">🖨️ Print Results</p>
                <p className="text-xs text-muted-foreground mt-1">Generate a print-ready results PDF (team & individual formats)</p>
              </div>
              <Button
                variant="secondary"
                className="gap-2 w-full bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={handlePrintResults}
                disabled={printing}
              >
                {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                {printing ? "Generating PDF..." : "Print Results"}
              </Button>
            </div>

            {/* Instructions */}
            <div className="bg-accent/10 border-2 border-accent/30 rounded-lg p-3">
              <p className="text-sm font-bold text-foreground mb-2">📤 Send Results</p>
              <p className="text-sm text-foreground mb-2">
                Select players above, then tap "Send via SMS" to text the results or "Send via Email" to email them.
              </p>
              <p className="text-xs text-muted-foreground">
                ⚠️ Note: On iPhone, you may need to tap the send arrow (↑) in the Messages app to actually send the text.
              </p>
            </div>

            {/* Quick action buttons */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAllWithPhone} className="text-xs">
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={clearAll} className="text-xs">
                Clear All
              </Button>
            </div>

            {/* Player checklist */}
            <div className="space-y-2">
              {roundPlayers.map(player => {
                const hasContact = !!(player.mobile_phone || player.email);
                const isChecked = selectedIds.has(player.player_id);
                return (
                  <div
                    key={player.player_id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${hasContact ? "bg-card" : "bg-muted/30 opacity-60"}`}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => hasContact && togglePlayer(player.player_id)}
                      disabled={!hasContact}
                      id={`player-${player.player_id}`}
                    />
                    <label
                      htmlFor={`player-${player.player_id}`}
                      className={`flex-1 text-sm ${hasContact ? "cursor-pointer" : "cursor-default"}`}
                    >
                      <span className="font-medium">{player.name}</span>
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        {player.mobile_phone && (
                          <span className="text-xs text-muted-foreground">
                            📱 {player.mobile_phone} {player.receive_text_results ? '' : '(opted out)'}
                          </span>
                        )}
                        {player.email && (
                          <span className="text-xs text-muted-foreground">
                            ✉️ {player.email} {player.receive_email_results ? '' : '(opted out)'}
                          </span>
                        )}
                        {!hasContact && <span className="text-xs text-muted-foreground">No contact info</span>}
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>

            {smsLinksReady ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-center">Tap each name to open Messages:</p>
                <p className="text-xs text-muted-foreground text-center">
                  ⚠️ Tap the ✓ next to each name after sending so you don't accidentally send twice.
                </p>
                {selectedPlayers.filter(p => p.mobile_phone).map(player => {
                  const encodedMessage = encodeURIComponent(messageText);
                  const sent = sentIds.has(player.player_id);
                  return (
                    <div key={player.player_id} className="flex items-center gap-2">
                      <a
                        href={`sms:${player.mobile_phone}&body=${encodedMessage}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-3 min-w-0 flex-1 px-3 py-3 rounded-lg font-medium text-sm transition-colors ${sent ? "bg-muted text-muted-foreground opacity-60" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
                        style={{ textDecoration: 'none', cursor: 'pointer' }}
                      >
                        <MessageSquare className="w-4 h-4 shrink-0" />
                        <span className="truncate flex-1">{player.name}</span>
                        <span className="text-xs opacity-70 shrink-0">{player.mobile_phone}</span>
                      </a>
                      <button
                        onClick={() => setSentIds(prev => {
                          const next = new Set(prev);
                          sent ? next.delete(player.player_id) : next.add(player.player_id);
                          return next;
                        })}
                        className={`shrink-0 w-10 h-10 rounded-lg border text-base font-bold transition-colors ${sent ? "bg-green-600 text-white border-green-600" : "bg-card text-muted-foreground border-border"}`}
                        title={sent ? "Mark as not sent" : "Mark as sent"}
                      >
                        ✓
                      </button>
                    </div>
                  );
                })}
                <Button variant="outline" className="w-full mt-1" onClick={() => setSmsLinksReady(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                className="w-full gap-2"
                onClick={handleSendViaSMS}
                disabled={selectedPhones.length === 0}
              >
                <MessageSquare className="w-4 h-4" />
                Send via SMS ({selectedPhones.length})
              </Button>
            )}

            {/* Email Results */}
            {selectedEmails.length > 0 && (
              <div className="bg-primary/5 border-2 border-primary/20 rounded-lg p-3 space-y-3">
                <div>
                  <p className="text-sm font-bold text-foreground">📧 Email Results</p>
                  <p className="text-xs text-muted-foreground mt-1">Opens your email app with player emails in BCC</p>
                </div>
                <Button
                  variant="secondary"
                  className="gap-2 w-full bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={() => handleEmail(true)}
                  disabled={emailSending}
                >
                  <Mail className="w-4 h-4" />
                  {emailSending ? "Sending..." : "Send to My Outbox"}
                </Button>
              </div>
            )}

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}