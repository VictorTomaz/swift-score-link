import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Mail, Send, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function AnnouncementEmail() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [scope, setScope] = useState("competition");
  const [selectedRoundId, setSelectedRoundId] = useState(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
  const [playerSearch, setPlayerSearch] = useState("");

  const { data: rounds = [], isLoading: roundsLoading } = useQuery({
    queryKey: ["rounds", user?.email],
    queryFn: () =>
      isAdmin
        ? base44.entities.Round.list("-created_date", 50)
        : base44.entities.Round.filter({ created_by: user?.email }, "-created_date", 50),
    enabled: !!user && scope === "competition",
  });

  const { data: players = [], isLoading: playersLoading } = useQuery({
    queryKey: ["players", user?.email],
    queryFn: () =>
      isAdmin
        ? base44.entities.Player.list("name", 500)
        : base44.entities.Player.filter({ created_by: user?.email }, "name", 500),
    enabled: !!user,
  });

  // Pre-select all players when the list first loads
  useEffect(() => {
    if (scope === "all" && players.length > 0) {
      setSelectedPlayerIds(players.map((p) => p.id));
    }
  }, [players, scope]);

  // Reset selection when switching away from "all"
  useEffect(() => {
    if (scope !== "all") {
      setSelectedPlayerIds([]);
      setPlayerSearch("");
    }
  }, [scope]);

  const filteredPlayers = useMemo(() => {
    if (!playerSearch.trim()) return players;
    const q = playerSearch.toLowerCase();
    return players.filter((p) => p.name?.toLowerCase().includes(q));
  }, [players, playerSearch]);

  const allFilteredSelected =
    filteredPlayers.length > 0 && filteredPlayers.every((p) => selectedPlayerIds.includes(p.id));

  const togglePlayer = (playerId) => {
    setSelectedPlayerIds((prev) =>
      prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]
    );
  };

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedPlayerIds((prev) =>
        prev.filter((id) => !filteredPlayers.some((p) => p.id === id))
      );
    } else {
      setSelectedPlayerIds((prev) => [
        ...new Set([...prev, ...filteredPlayers.map((p) => p.id)]),
      ]);
    }
  };

  const buildEmailBody = (name) => `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#14532d;padding:24px 32px;text-align:center;">
            <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">Swift Score Golf</div>
            <div style="font-size:13px;color:#a7f3d0;margin-top:4px;text-transform:uppercase;letter-spacing:1px;">Announcement</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 6px;font-size:18px;font-weight:600;color:#1a1a1a;">Hi ${name},</p>
            <p style="margin:0 0 20px;font-size:15px;color:#555;line-height:1.6;white-space:pre-wrap;">${message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
            <p style="margin:24px 0 0;font-size:15px;color:#555;">Best regards,</p>
            <p style="margin:4px 0 0;font-size:15px;color:#1a1a1a;font-weight:600;">– Swift Score Golf</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const handleSend = () => {
    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }
    if (scope === "competition" && !selectedRoundId) {
      toast.error("Please select a round");
      return;
    }
    if (scope === "all" && selectedPlayerIds.length === 0) {
      toast.error("Please select at least one player");
      return;
    }

    // Build recipient list synchronously — must stay in the click call stack
    // so window.open isn't popup-blocked (matches Tee Sheet / Results modals)
    let recipients = [];

    if (scope === "competition") {
      const round = rounds.find(r => r.id === selectedRoundId);
      const roundPlayers = round?.players || [];
      for (const p of roundPlayers) {
        const master = players.find(mp =>
          mp.id === p.player_id || mp.name.toLowerCase() === (p.name || "").toLowerCase()
        );
        const email = master?.email || p.email || null;
        if (email) recipients.push({ name: p.name || "Player", email });
      }
    } else {
      recipients = players
        .filter((p) => selectedPlayerIds.includes(p.id) && p.email)
        .map((p) => ({ name: p.name || "Player", email: p.email }));
    }

    if (recipients.length === 0) {
      toast.error("No recipients with email addresses found.");
      return;
    }

    const emailSubject = subject?.trim() || "Swift Score Golf Announcement";
    const bccList = recipients.map(r => r.email).join(',');
    const bodyWithBreaks = message.replace(/\n/g, '\r\n');
    const mailtoUrl = `mailto:?bcc=${encodeURIComponent(bccList)}&subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(bodyWithBreaks)}`;
    window.open(mailtoUrl, '_blank');
    toast.success("Opening your email app — press send to deliver");
    setMessage("");
    setSubject("");
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="w-4 h-4" />
          Send Announcement
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Scope selector */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Recipients</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setScope("competition")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                scope === "competition"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-muted/50 text-foreground hover:bg-muted"
              }`}
            >
              Competition
            </button>
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                scope === "all"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-muted/50 text-foreground hover:bg-muted"
              }`}
            >
              All Players
            </button>
          </div>
        </div>

        {/* Round selector (only for competition scope) */}
        {scope === "competition" && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Select Round</label>
            {roundsLoading ? (
              <div className="h-9 rounded-md bg-muted animate-pulse" />
            ) : rounds.length === 0 ? (
              <p className="text-xs text-muted-foreground">No rounds found.</p>
            ) : (
              <select
                value={selectedRoundId || ""}
                onChange={(e) => setSelectedRoundId(e.target.value || null)}
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">— Choose a round —</option>
                {rounds.map((round) => (
                  <option key={round.id} value={round.id}>
                    {round.event_name}
                    {round.date ? ` · ${format(new Date(round.date.replace(/-/g, "/")), "MMM d, yyyy")}` : ""}
                    {round.player_count ? ` · ${round.player_count} players` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Player checklist (only for "all" scope) */}
        {scope === "all" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Recipients ({selectedPlayerIds.length} selected)
              </label>
              <button
                type="button"
                onClick={toggleAllFiltered}
                className="text-xs font-medium text-primary hover:underline"
              >
                {allFilteredSelected ? "Deselect All" : "Select All"}
              </button>
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder="Search players..."
                className="w-full h-8 rounded-md border border-input bg-background pl-8 pr-3 text-sm"
              />
            </div>
            {/* Player list */}
            {playersLoading ? (
              <div className="h-32 rounded-md bg-muted animate-pulse" />
            ) : filteredPlayers.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No players found.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {filteredPlayers.map((player) => (
                  <label
                    key={player.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedPlayerIds.includes(player.id)}
                      onCheckedChange={() => togglePlayer(player.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{player.name}</p>
                      {player.email ? (
                        <p className="text-xs text-muted-foreground truncate">{player.email}</p>
                      ) : (
                        <p className="text-xs text-destructive truncate">No email on file</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Subject */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Subject (optional)</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Swift Score Golf Announcement"
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>

        {/* Message */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your announcement here..."
            rows={5}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
          />
        </div>

        {/* Send button */}
        <Button
          onClick={() => handleSend(false)}
          disabled={
            sending ||
            !message.trim() ||
            (scope === "competition" && !selectedRoundId) ||
            (scope === "all" && selectedPlayerIds.length === 0)
          }
          className="w-full gap-2"
        >
          {sending ? (
            <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {sending ? "Sending..." : "Send Announcement"}
        </Button>
      </CardContent>
    </Card>
  );
}