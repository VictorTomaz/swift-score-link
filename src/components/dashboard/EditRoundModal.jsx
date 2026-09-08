import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function EditRoundModal({ round, onClose, onSave }) {
  const isMultiFlight = !!(round.is_multi_flight || round.series_type === 'multi_flight');
  const [formData, setFormData] = useState({
    event_name: round.event_name || '',
    flight_name: round.flight_name || (isMultiFlight ? `Flight ${round.flight_number || 1}` : ''),
    date: round.date || new Date().toISOString().split('T')[0],
    course_name: round.course_name || '',
    tee_set: round.tee_set || '',
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const updated = await base44.entities.Round.update(round.id, formData);
      onSave(updated);
    } catch (error) {
      console.error('Failed to update round:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Round Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="event_name">Competition Name</Label>
            <Input
              id="event_name"
              value={formData.event_name}
              onChange={(e) => handleChange('event_name', e.target.value)}
              placeholder="e.g. Saturday Scramble"
            />
          </div>
          {isMultiFlight && (
            <div className="space-y-2">
              <Label htmlFor="flight_name">Flight Name</Label>
              <Input
                id="flight_name"
                value={formData.flight_name}
                onChange={(e) => handleChange('flight_name', e.target.value)}
                placeholder={`Flight ${round.flight_number || 1}`}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => handleChange('date', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="course_name">Course Name</Label>
            <Input
              id="course_name"
              value={formData.course_name}
              onChange={(e) => handleChange('course_name', e.target.value)}
              placeholder="e.g. Pebble Beach"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tee_set">Tee Set</Label>
            <Input
              id="tee_set"
              value={formData.tee_set}
              onChange={(e) => handleChange('tee_set', e.target.value)}
              placeholder="e.g. Blue Tees"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}