import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Calendar, DollarSign, Users, ChevronRight, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import PageDescription from "@/components/PageDescription";
import PullToRefreshIndicator from "@/components/PullToRefreshIndicator";

export default function History() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: rounds = [], isLoading } = useQuery({
    queryKey: ["rounds"],
    queryFn: () => base44.entities.Round.list("-created_date", 100),
  });
  
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const handleRefresh = async () => {
    await queryClient.refetchQueries({ queryKey: ["rounds"] });
  };

  const { isRefreshing, pullDistance } = usePullToRefresh(handleRefresh);

  const confirmDelete = () => {
    const deletedId = deleteConfirm;
    if (!deletedId) return;
    // Optimistically remove from all round queries
    queryClient.setQueriesData({ queryKey: ["rounds"] }, (old = []) => old.filter(r => r.id !== deletedId));
    setDeleteConfirm(null);
    base44.entities.Round.delete(deletedId).then(() => {
      toast.success("Round deleted.");
    }).catch((error) => {
      // Rollback on failure
      queryClient.invalidateQueries({ queryKey: ["rounds"] });
      toast.error("Failed to delete round: " + error.message);
    });
  };

  const deleteRound = (e, roundId) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteConfirm(roundId);
  };

  return (
    <>
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete Round?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      <div data-pull-to-refresh className="space-y-6 pb-20 sm:pb-0" style={{ touchAction: 'pan-y' }}>
      <PullToRefreshIndicator isRefreshing={isRefreshing} pullDistance={pullDistance} />
      <PageDescription
        title="Round History"
        description="Browse all your past and active rounds. Tap any round to view its scorecard or results. Use the trash icon to permanently delete a round."
      />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : rounds.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center">
            <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No rounds yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rounds.map((round) => (
            <div key={round.id}>
              <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center justify-between">
                  <div 
                    className="flex items-center gap-4 flex-1 cursor-pointer"
                    onClick={() => navigate(round.status === "completed" ? `/Results?id=${round.id}` : `/Scorecard?id=${round.id}`)}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      round.status === "completed" ? "bg-primary/10" : "bg-accent/20"
                    }`}>
                      <Trophy className={`w-5 h-5 ${round.status === "completed" ? "text-primary" : "text-accent"}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{round.event_name}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        {round.date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(round.date), "MMM d")}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {round.player_count}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          {round.buy_in}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="capitalize text-xs">{round.status}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => deleteRound(e, round.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );
}