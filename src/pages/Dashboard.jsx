import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Trophy, Target, Users, DollarSign, ChevronRight, Calendar, Copy, Edit, FileText, CalendarClock, Settings, Mail, Printer } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import DisclaimerModal from "@/components/DisclaimerModal";
import { useTour } from "@/context/TourContext";
import PageDescription from "@/components/PageDescription";
import PullToRefreshIndicator from "@/components/PullToRefreshIndicator";
import EditRoundModal from "@/components/dashboard/EditRoundModal";
import ColorLegend from "@/components/dashboard/ColorLegend";
import TournamentGroupCard from "@/components/dashboard/TournamentGroupCard";
import { groupRoundsByTournament } from "@/lib/tournamentGroups";

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editingRound, setEditingRound] = useState(null);
  const [duplicating, setDuplicating] = useState(null);
  const { hasCompletedTour, startTour } = useTour();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const handleRefresh = async () => {
    await queryClient.refetchQueries({ queryKey: ["rounds"] });
  };
  const { isRefreshing, pullDistance } = usePullToRefresh(handleRefresh);

  // Auto-start tour for new users
  useEffect(() => {
    if (!hasCompletedTour) {
      const timer = setTimeout(() => {
        startTour();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [hasCompletedTour, startTour]);

  const { data: rounds = [], isLoading } = useQuery({
    queryKey: ["rounds", user?.email],
    queryFn: () => isAdmin
      ? base44.entities.Round.list("-created_date", 50)
      : base44.entities.Round.filter({ created_by: user?.email }, "-created_date", 50),
    enabled: !!user,
  });

  const completedRounds = rounds.filter(r => r.status === "completed");
  const activeRounds = rounds.filter(r => r.status !== "completed");
  const totalPot = completedRounds.reduce((sum, r) => sum + (r.buy_in * r.player_count), 0);

  // Group linked rounds (parent + child flights) into tournament groups
  const grouped = groupRoundsByTournament(rounds);
  const activeGroups = grouped.filter(g => g.some(r => r.status !== "completed"));
  const completedGroups = grouped.filter(g => g.every(r => r.status === "completed"));

  const handleDuplicate = async (e, round) => {
    e.preventDefault();
    e.stopPropagation();
    setDuplicating(round.id);
    try {
      // Strip system fields and computed results; KEEP players + their scores
      const { id, created_date, updated_date, created_by, results, kp_winners, ...settings } = round;
      const newData = {
        ...settings,
        status: "scoring",
        results: null,
        kp_winners: [],
        event_name: `${round.event_name} (Copy)`,
        scorecard_pdf_url: undefined,
        locked_format: undefined,
      };
      const newRound = await base44.entities.Round.create(newData);

      // Deep copy the per-player RoundScore records to the new round
      const scoreRecords = await base44.entities.RoundScore.filter({ round_id: round.id });
      if (scoreRecords.length > 0) {
        await base44.entities.RoundScore.bulkCreate(
          scoreRecords.map(rs => ({
            round_id: newRound.id,
            player_id: rs.player_id,
            scores: rs.scores,
          }))
        );
      }

      queryClient.setQueryData(["rounds", user?.email], (old = []) => [newRound, ...old]);
      navigate(`/Scorecard?id=${newRound.id}`);
    } catch (err) {
      toast.error("Failed to duplicate round");
      setDuplicating(null);
    }
  };

  const handleEditRound = async (roundId, updates) => {
    await base44.entities.Round.update(roundId, updates);
    queryClient.setQueryData(["rounds", user?.email], (old = []) =>
      old.map(r => r.id === roundId ? { ...r, ...updates } : r)
    );
  };

  const stats = [
    { label: "Rounds Played", value: completedRounds.length, icon: Trophy, color: "text-primary" },
    { label: "Active Rounds", value: activeRounds.length, icon: Target, color: "text-accent" },
    { label: "Total Players", value: completedRounds.reduce((s, r) => s + r.player_count, 0), icon: Users, color: "text-chart-3" },
    { label: "Total Pot", value: `$${totalPot.toLocaleString()}`, icon: DollarSign, color: "text-primary" },
  ];

  return (
    <div data-pull-to-refresh className="space-y-6 tour-dashboard w-full" style={{ paddingBottom: '100px' }}>
      <PullToRefreshIndicator isRefreshing={isRefreshing} pullDistance={pullDistance} />
      <DisclaimerModal />

      {/* Hero CTA — Standard Options */}
      <div className="grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={() => { sessionStorage.removeItem('setupWizard_draft'); navigate('/SetupWizard', { replace: true }); }}
          className="tour-new-round gap-1.5 inline-flex items-center justify-center rounded-lg px-2 py-2 text-xs font-semibold shadow-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
          Start New Round
        </button>

        <button
          type="button"
          onClick={() => navigate('/TournamentLogistics')}
          className="gap-1.5 inline-flex items-center justify-center rounded-lg px-2 py-2 text-xs font-semibold shadow-sm bg-logistics text-logistics-foreground hover:bg-logistics/90 transition-colors"
        >
          <CalendarClock className="w-4 h-4" />
          Tournament Logistics
        </button>

      </div>

      <ColorLegend />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        {stats.map((stat) => (
          <div key={stat.label}>
            <Card className="border-0 shadow-sm bg-card">
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                    {isLoading ? (
                      <Skeleton className="h-6 w-12 mt-1" />
                    ) : (
                      <p className="text-lg font-bold mt-0.5 text-foreground">{stat.value}</p>
                    )}
                  </div>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      {/* Active Rounds */}
      {activeRounds.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Active Rounds</h2>
          <div className="grid gap-2">
            {activeGroups.map(group => {
              if (group.length > 1) return <TournamentGroupCard key={group[0].parent_round_id || group[0].id} group={group} isCompleted={false} onEdit={setEditingRound} />;
              const round = group[0];
              return (
              <Link key={round.id} to={`/Scorecard?id=${round.id}`}>
                <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-3.5 flex items-center justify-between gap-2 overflow-hidden">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
                        <Target className="w-4 h-4 text-accent" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate">{round.event_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{round.course_name || "No course"} · {round.player_count} players</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingRound(round); }}
                        className="flex items-center gap-1 text-xs text-edit-foreground bg-edit hover:bg-edit/90 border border-edit rounded-md px-2 py-1 transition-colors"
                      >
                        <Edit className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        onClick={(e) => handleDuplicate(e, round)}
                        disabled={duplicating === round.id}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary border border-border rounded-md px-2 py-1 bg-background hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        <Copy className="w-3 h-3" />
                        {duplicating === round.id ? "..." : "Duplicate"}
                      </button>
                      <Badge variant="secondary" className="capitalize text-xs">{round.status}</Badge>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit Round Modal */}
      {editingRound && (
        <EditRoundModal
          round={editingRound}
          onClose={() => setEditingRound(null)}
          onSave={(updated) => {
            queryClient.setQueryData(["rounds", user?.email], (old = []) =>
              old.map(r => r.id === updated.id ? updated : r)
            );
            setEditingRound(null);
            toast.success("Round details updated");
          }}
        />
      )}

      {/* Recent Completed */}
      <div className="space-y-2 tour-results-placeholder">
        <h2 className="text-base font-semibold text-foreground">Recent Results</h2>
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : completedRounds.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-8 text-center">
              <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No completed rounds yet.</p>
              <button type="button" onClick={() => navigate('/SetupWizard', { replace: true })} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md border-2 border-border bg-card text-foreground font-medium text-sm">
                <PlusCircle className="w-4 h-4" />
                Start your first round
              </button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2">
            {completedGroups.slice(0, 5).map(group => {
              if (group.length > 1) return <TournamentGroupCard key={group[0].parent_round_id || group[0].id} group={group} isCompleted={true} onEdit={setEditingRound} />;
              const round = group[0];
              return (
              <Link key={round.id} to={`/Results?id=${round.id}`}>
                <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-3.5 flex items-center justify-between gap-2 overflow-hidden">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Trophy className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate">{round.event_name}</p>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {round.date ? format(new Date(round.date.replace(/-/g, '/')), "MMM d, yyyy") : "No date"}
                          <span>·</span>
                          <span>${round.buy_in} buy-in</span>
                          <span>·</span>
                          <span>{round.player_count} players</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingRound(round); }}
                        className="flex items-center gap-1 text-xs text-edit-foreground bg-edit hover:bg-edit/90 border border-edit rounded-md px-2 py-1 transition-colors"
                      >
                        <Edit className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        onClick={(e) => handleDuplicate(e, round)}
                        disabled={duplicating === round.id}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary border border-border rounded-md px-2 py-1 bg-background hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        <Copy className="w-3 h-3" />
                        {duplicating === round.id ? "..." : "Duplicate"}
                      </button>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}