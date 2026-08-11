import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Mail } from "lucide-react";

export default function SendTeeSheetModal({ isOpen, onClose, round, players, assignments }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [emailSending, setEmailSending] = useState(false);

  // Load player contact info from the master player list
  const { data: masterPlayers = [] } = useQuery({
    queryKey: ["players-contact-teesheet"],
    queryFn: () => base44.entities.Player.list('-name', 200),
    enabled: isOpen,
    staleTime: 0,
  });

  // Build enriched player list for the current round (only assigned players)
  const roundPlayers = useMemo(() => {
    return (players || [])
      .filter(p => assignments[p.player_id])
      .map(rp => {
        const master = masterPlayers.find(mp => 
          mp.id === rp.player_id || mp.name.toLowerCase() === rp.name.toLowerCase()
        );
        return {
          player_id: rp.player_id,
          name: rp.name,
          email: master?.email || rp.email || "",
          tee_time: assignments[rp.player_id],
          receive_email_results: master?.receive_email_results !== false,
        };
      });
  }, [players, assignments, masterPlayers]);

  const playersWithEmail = useMemo(() => roundPlayers.filter(p => p.email), [roundPlayers]);

  // Default selection: players with emails who opted in
  useEffect(() => {
    if (isOpen) {
      const defaultSelected = new Set(
        roundPlayers
          .filter(p => p.email && p.receive_email_results)
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

  const selectAll = () => setSelectedIds(new Set(playersWithEmail.map(p => p.player_id)));
  const clearAll = () => setSelectedIds(new Set());

  const selectedPlayers = useMemo(() => roundPlayers.filter(p => selectedIds.has(p.player_id)), [roundPlayers, selectedIds]);
  const selectedEmails = useMemo(() => selectedPlayers.map(p => p.email).filter(Boolean), [selectedPlayers]);

  const handleEmailToOutbox = () => {
    if (selectedEmails.length === 0) {
      toast.error("No players selected");
      return;
    }

    const bccList = selectedEmails.join(',');
    const dateFormatted = round.date
      ? new Date(round.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : '';
    
    const teeTimeGroups = {};
    for (const p of roundPlayers) {
      const time = assignments[p.player_id];
      if (!teeTimeGroups[time]) teeTimeGroups[time] = [];
      teeTimeGroups[time].push(p.name);
    }
    const sortedTimes = Object.keys(teeTimeGroups).sort();
    const sheetLines = sortedTimes.map(time => `${time} — ${teeTimeGroups[time].join(' / ')}`).join('\n\n');
    
    const emailBody = `Tee Sheet - ${round.event_name}\n${round.course_name || ''} ${dateFormatted ? '· ' + dateFormatted : ''}\n\n${sheetLines}`;
    const bodyWithBreaks = emailBody.replace(/\n/g, '\r\n');
    const mailtoUrl = `mailto:?bcc=${encodeURIComponent(bccList)}&subject=${encodeURIComponent(`Tee Sheet - ${round.event_name}`)}&body=${encodeURIComponent(bodyWithBreaks)}`;
    
    window.open(mailtoUrl, '_blank');
    toast.success("Opening your email app — press send to deliver");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Email Tee Sheet
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Instructions */}
          <div className="bg-accent/10 border-2 border-accent/30 rounded-lg p-3">
            <p className="text-sm font-bold text-foreground mb-2">📧 Email Tee Sheet</p>
            <p className="text-sm text-foreground mb-2">
              Select players to include in the BCC field. Opens your email app with the tee sheet.
            </p>
          </div>

          {/* Quick action buttons */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAll} className="text-xs">
              Select All ({playersWithEmail.length})
            </Button>
            <Button variant="outline" size="sm" onClick={clearAll} className="text-xs">
              Clear All
            </Button>
          </div>

          {/* Player checklist */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {roundPlayers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No players assigned</p>
            ) : (
              roundPlayers.map(player => {
                const hasEmail = !!player.email;
                const isChecked = selectedIds.has(player.player_id);
                return (
                  <div
                    key={player.player_id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${hasEmail ? "bg-card" : "bg-muted/30 opacity-60"}`}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => hasEmail && togglePlayer(player.player_id)}
                      disabled={!hasEmail}
                      id={`player-${player.player_id}`}
                    />
                    <label
                      htmlFor={`player-${player.player_id}`}
                      className={`flex-1 text-sm ${hasEmail ? "cursor-pointer" : "cursor-default"}`}
                    >
                      <span className="font-medium">{player.name}</span>
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        {player.email && (
                          <span className="text-xs text-muted-foreground">
                            ✉️ {player.email} {player.receive_email_results ? '' : '(opted out)'}
                          </span>
                        )}
                        {player.tee_time && (
                          <span className="text-xs text-muted-foreground">
                            🕐 {player.tee_time}
                          </span>
                        )}
                        {!hasEmail && <span className="text-xs text-muted-foreground">No email</span>}
                      </div>
                    </label>
                  </div>
                );
              })
            )}
          </div>

          {/* Email button */}
          {selectedEmails.length > 0 && (
            <div className="bg-primary/5 border-2 border-primary/20 rounded-lg p-3 space-y-3">
              <div>
                <p className="text-sm font-bold text-foreground">📧 Email Tee Sheet</p>
                <p className="text-xs text-muted-foreground mt-1">Opens your email app with player emails in BCC</p>
              </div>
              <Button
                variant="outline"
                className="gap-2 w-full"
                onClick={handleEmailToOutbox}
                disabled={emailSending}
              >
                <Mail className="w-4 h-4" />
                {emailSending ? "Sending..." : "Send to My Outbox"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}