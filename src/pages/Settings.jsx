import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { motion } from 'framer-motion';
import { Trash2, LogOut, Settings as SettingsIcon, HelpCircle, Printer, Crown, CalendarClock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import PageDescription from '@/components/PageDescription';
import { useAuth } from '@/lib/AuthContext';
import { Link } from 'react-router-dom';
import AnnouncementEmail from '@/components/settings/AnnouncementEmail';

export default function Settings() {
  const { logout } = useAuth();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await base44.functions.invoke('deleteUserAccount', {});
      toast.success('Account deleted successfully.');
      setTimeout(() => {
        base44.auth.logout('/');
      }, 1500);
    } catch (error) {
      toast.error('Failed to delete account: ' + error.message);
      setDeleting(false);
    }
  };



  return (
    <>
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete Account?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete your account and all associated data (rounds, courses, players). This action cannot be undone.
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end mt-2">
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete My Account'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-6 pb-20 sm:pb-0">
        <PageDescription
          title="Settings"
          description="Manage your account and preferences."
        />

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">More</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link to="/Paywall" className="flex items-center justify-between p-3 bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors border border-primary/20">
              <div>
                <p className="font-medium text-primary text-sm">Go Premium</p>
                <p className="text-xs text-muted-foreground mt-0.5">Unlock all features with a free trial.</p>
              </div>
              <Crown className="w-4 h-4 text-primary" />
            </Link>
            <Link to="/CoursesManagement" className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
              <div>
                <p className="font-medium text-foreground text-sm">Courses</p>
                <p className="text-xs text-muted-foreground mt-0.5">Manage your golf courses.</p>
              </div>
              <SettingsIcon className="w-4 h-4 text-muted-foreground" />
            </Link>
            <Link to="/TournamentLogistics" className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
              <div>
                <p className="font-medium text-foreground text-sm">Tournament Logistics</p>
                <p className="text-xs text-muted-foreground mt-0.5">Organize groupings, tee times & print scorecards.</p>
              </div>
              <CalendarClock className="w-4 h-4 text-muted-foreground" />
            </Link>
            <Link to="/Help" className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
              <div>
                <p className="font-medium text-foreground text-sm">How It Works</p>
                <p className="text-xs text-muted-foreground mt-0.5">Guide to game modes and scoring.</p>
              </div>
              <HelpCircle className="w-4 h-4 text-muted-foreground" />
            </Link>
          </CardContent>
        </Card>

        <AnnouncementEmail />

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">About</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-medium text-foreground text-sm">Swift Score Golf</p>
              <p className="text-xs text-muted-foreground mt-0.5">Golf scoring & payout engine — Patent Pending</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground text-sm">Sign Out</p>
                <p className="text-xs text-muted-foreground mt-0.5">Log out of your account.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={logout}
                className="flex items-center gap-1.5 ml-3"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-destructive/30 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground text-sm">Delete Account</p>
                <p className="text-xs text-muted-foreground mt-0.5">Permanently delete your account and all data.</p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                className="flex items-center gap-1.5 ml-3"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </Button>
            </div>

          </CardContent>
        </Card>
      </motion.div>
    </>
  );
}