import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Trash2, Plus, Loader2, Pencil, Check, ScanLine } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import PageDescription from "@/components/PageDescription";
import HandicapSyncModal from "@/components/players/HandicapSyncModal";

const formatHandicap = (hcp, isPlus) => {
  if (hcp === null || hcp === undefined) return '0';
  const num = Math.abs(parseFloat(hcp));
  if (isNaN(num)) return '0';
  return isPlus ? `+${num}` : String(num);
};

const parseHandicapInput = (str) => {
  const trimmed = (str || '').trim().toLowerCase();
  let isPlus = false;
  let numStr = trimmed;
  
  if (trimmed.startsWith('+')) {
    isPlus = true;
    numStr = trimmed.slice(1).trim();
  } else if (trimmed.startsWith('plus ')) {
    isPlus = true;
    numStr = trimmed.slice(5).trim();
  }
  
  return { handicap: parseFloat(numStr) || 0, is_plus_handicap: isPlus };
};

export default function PlayersManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerHandicap, setNewPlayerHandicap] = useState("");
  const [newPlayerPhone, setNewPlayerPhone] = useState("");
  const [newPlayerEmail, setNewPlayerEmail] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingHandicap, setEditingHandicap] = useState("");
  const [editingPhone, setEditingPhone] = useState("");
  const [editingEmail, setEditingEmail] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: players = [], isLoading, error } = useQuery({
    queryKey: ["players"],
    queryFn: async () => {
      const list = await base44.entities.Player.list('-name', 500);
      console.log('[PLAYERS] Loaded players:', list.length);
      return list.sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Player.create(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ["players"] });
      const prev = queryClient.getQueryData(["players"]);
      const tempId = `temp_${Date.now()}`;
      const optimistic = { ...data, id: tempId, created_date: new Date().toISOString() };
      queryClient.setQueryData(["players"], (old = []) => [...old, optimistic].sort((a, b) => a.name.localeCompare(b.name)));
      return { prev, tempId };
    },
    onSuccess: (result, _data, ctx) => {
      queryClient.setQueryData(["players"], (old = []) =>
        old.map(p => p.id === ctx?.tempId ? result : p).sort((a, b) => a.name.localeCompare(b.name))
      );
      setNewPlayerName("");
      setNewPlayerHandicap("");
      setNewPlayerPhone("");
      setNewPlayerEmail("");
      toast.success("Player added");
    },
    onError: (error, _data, ctx) => {
      queryClient.setQueryData(["players"], ctx?.prev);
      toast.error("Failed to add player: " + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => base44.entities.Player.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["players"] });
      const prev = queryClient.getQueryData(["players"]);
      queryClient.setQueryData(["players"], (old = []) => old.filter(p => p.id !== id));
      return { prev };
    },
    onSuccess: () => {
      setDeleteConfirmId(null);
      setDeleteConfirmName("");
      toast.success("Player removed");
    },
    onError: (error, _id, ctx) => {
      queryClient.setQueryData(["players"], ctx?.prev);
      setDeleteConfirmId(null);
      setDeleteConfirmName("");
      toast.error("Cannot delete: " + error.message);
    },
  });

  const confirmDelete = (player) => {
    setDeleteConfirmId(player.id);
    setDeleteConfirmName(player.name);
  };

  const handleDelete = () => {
    if (deleteConfirmId) {
      deleteMutation.mutate(deleteConfirmId);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      const { id, handicap, is_plus_handicap, mobile_phone, email } = data;
      await base44.entities.Player.update(id, { handicap, is_plus_handicap, mobile_phone, email });
      return { id, handicap, is_plus_handicap, mobile_phone, email };
    },
    onMutate: async (data) => {
      const { id, handicap, is_plus_handicap, mobile_phone, email } = data;
      await queryClient.cancelQueries({ queryKey: ["players"] });
      const prev = queryClient.getQueryData(["players"]);
      queryClient.setQueryData(["players"], (old = []) => old.map(p =>
        p.id === id ? { ...p, handicap, is_plus_handicap, mobile_phone, email } : p
      ));
      return { prev };
    },
    onSuccess: (_result, _data, ctx) => {
      setEditingId(null);
      setEditingHandicap("");
      setEditingPhone("");
      setEditingEmail("");
      toast.success("Player updated");
    },
    onError: (error, _data, ctx) => {
      queryClient.setQueryData(["players"], ctx?.prev);
      toast.error("Failed to update: " + error.message);
    },
  });

  const startEdit = (player) => {
    setEditingId(player.id);
    setEditingHandicap(formatHandicap(player.handicap || 0, player.is_plus_handicap));
    setEditingPhone(player.mobile_phone || "");
    setEditingEmail(player.email || "");
  };

  const saveEdit = (playerId) => {
    const parsed = parseHandicapInput(editingHandicap);
    updateMutation.mutate({ id: playerId, ...parsed, mobile_phone: editingPhone, email: editingEmail });
  };

  const handleAddPlayer = () => {
    const currentName = (newPlayerName || "").trim();

    if (!currentName) {
      toast.error("Player name is required");
      return;
    }

    const parsed = newPlayerHandicap ? parseHandicapInput(newPlayerHandicap) : { handicap: 0, is_plus_handicap: false };
    const playerData = {
      name: currentName,
      ...parsed,
      ...(newPlayerPhone.trim() && { mobile_phone: newPlayerPhone.trim() }),
      ...(newPlayerEmail.trim() && { email: newPlayerEmail.trim() }),
    };

    createMutation.mutate(playerData);
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20 sm:pb-0">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Button variant="ghost" onClick={() => navigate("/Dashboard")} className="gap-2 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>

        <PageDescription
          title="Master Player List"
          description="Manage your roster of golfers. Add players, edit handicaps, or remove players. Saved players can be quickly added to any round."
        />

        <Button variant="outline" onClick={() => setSyncModalOpen(true)} className="gap-2 mb-2 w-full sm:w-auto">
          <ScanLine className="w-4 h-4" />
          Sync from Screenshot
        </Button>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Add New Player</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Player Name *</Label>
                <Input
                  placeholder="John Doe"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleAddPlayer()}
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="space-y-2">
                <Label>Handicap</Label>
                <Input
                  type="text"
                  placeholder="0 or +1"
                  value={newPlayerHandicap}
                  onChange={(e) => setNewPlayerHandicap(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleAddPlayer()}
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="space-y-2">
                <Label>Mobile Phone</Label>
                <Input
                  type="tel"
                  placeholder="360-555-1234"
                  value={newPlayerPhone}
                  onChange={(e) => setNewPlayerPhone(e.target.value)}
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="john@example.com"
                  value={newPlayerEmail}
                  onChange={(e) => setNewPlayerEmail(e.target.value)}
                  onFocus={(e) => e.target.select()}
                />
              </div>
            </div>
            <Button
              onClick={handleAddPlayer}
              disabled={createMutation.isPending}
              className="gap-2"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Player
            </Button>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm mt-4">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Your Players ({players.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                Error loading players: {error.message}
              </p>
            )}
            {players.length > 0 && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                💡 Tap the pencil icon to edit a player's handicap. Press the ✓ checkmark to save. ({players.length} players)
              </p>
            )}
            {players.length === 0 && !error ? (
              <p className="text-sm text-muted-foreground">No players yet. Add one above to get started.</p>
            ) : (
              <div className="space-y-2">
                {players.map((player) => (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{player.name}</p>
                      {editingId === player.id ? (
                        <div className="space-y-1 mt-1">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground w-10">HCP:</span>
                            <Input type="text" value={editingHandicap} onChange={e => setEditingHandicap(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEdit(player.id)} className="h-6 w-16 text-sm px-1" autoFocus />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground w-10">Phone:</span>
                            <Input type="tel" placeholder="360-555-1234" value={editingPhone} onChange={e => setEditingPhone(e.target.value)} className="h-6 w-36 text-sm px-1" />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground w-10">Email:</span>
                            <Input type="email" placeholder="john@example.com" value={editingEmail} onChange={e => setEditingEmail(e.target.value)} className="h-6 w-44 text-sm px-1" />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-xs text-muted-foreground">HCP {formatHandicap(player.handicap || 0, player.is_plus_handicap)}</p>
                          {player.mobile_phone && <p className="text-xs text-muted-foreground">📱 {player.mobile_phone}</p>}
                          {player.email && <p className="text-xs text-muted-foreground">✉️ {player.email}</p>}
                        </div>
                      )}
                    </div>
                    {editingId === player.id ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => saveEdit(player.id)}
                        disabled={updateMutation.isPending}
                      >
                        <Check className="w-4 h-4 text-primary" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEdit(player)}
                      >
                        <Pencil className="w-4 h-4 text-edit" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => confirmDelete(player)}
                      disabled={deleteMutation.isPending}
                      className="text-destructive hover:text-destructive/90"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <HandicapSyncModal
          open={syncModalOpen}
          onOpenChange={setSyncModalOpen}
          existingPlayers={players}
        />

        <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Player?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{deleteConfirmName}</strong>? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>
    </div>
  );
}