import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle } from 'lucide-react';

export default function Step2Course({ form, updateForm, nextStep, prevStep }) {
  const [tab, setTab] = useState('saved'); // 'saved' or 'manual'
  const [teeGender, setTeeGender] = useState(form?.round_gender || 'men\'s');
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [courseName, setCourseName] = useState('');
  const [slope, setSlope] = useState('');
  const [rating, setRating] = useState('');

  const { data: courses = [] } = useQuery({
    queryKey: ['courses'],
    queryFn: () => base44.entities.Course.filter({}, 'name', 500),
  });

  // Restore the previously-saved course when re-entering the wizard
  // (editing an existing round or resuming a draft). Existing rounds store
  // course_name but not course_id, so match by name as a fallback.
  useEffect(() => {
    if (!courses.length || selectedCourse) return;
    if (!form?.course_name && !form?.course_id) return;
    const match = courses.find(c =>
      form.course_id ? c.id === form.course_id : c.name === form.course_name
    );
    if (match) {
      setSelectedCourse(match);
    } else if (!form.course_id && form.course_name) {
      // Manual course that isn't in the saved list — prefill the manual tab
      setTab('manual');
      setCourseName(form.course_name);
      setSlope(form.slope ?? '');
      setRating(form.rating ?? '');
    }
  }, [courses, form?.course_id, form?.course_name, form?.slope, form?.rating, selectedCourse]);

  const handleSelectSavedCourse = (course) => {
    setSelectedCourse(course);
  };

  const handleNextSaved = () => {
    if (!selectedCourse) return;
    
    // Don't auto-select any tee - user will choose in roster
    const slopeKey = teeGender === 'men\'s' ? 'slope' : 'ladies_slope';
    const ratingKey = teeGender === 'men\'s' ? 'rating' : 'ladies_rating';

    updateForm({
      course_id: selectedCourse.id,
      course_name: selectedCourse.name,
      tee_set: '',
      slope: selectedCourse.tee_sets[0]?.[slopeKey] || null,
      rating: selectedCourse.tee_sets[0]?.[ratingKey] || null,
      par: selectedCourse.tee_sets[0]?.par || [],
      hole_handicap_indexes: selectedCourse.tee_sets[0]?.hole_handicap_indexes || [],
      course_tee_sets: selectedCourse.tee_sets || [],
      round_gender: teeGender,
    });
    nextStep();
  };

  const handleNextManual = () => {
    if (!courseName.trim()) return;
    updateForm({
      course_id: null,
      course_name: courseName.trim(),
      tee_set: '',
      slope: slope ? Number(slope) : null,
      rating: rating ? Number(rating) : null,
      par: form.par || [],
      hole_handicap_indexes: form.hole_handicap_indexes || [],
      course_tee_sets: [],
    });
    nextStep();
  };

  const teesForGender = selectedCourse
    ? selectedCourse.tee_sets.filter(t => {
        const key = teeGender === 'men\'s' ? 'slope' : 'ladies_slope';
        return t[key];
      })
    : [];

  const hasNoTeesForGender = selectedCourse && teesForGender.length === 0;

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-foreground">Select Course</h2>
        <p className="text-sm text-muted-foreground mt-1">Choose a saved course or enter details manually.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => { setTab('saved'); setSelectedCourse(null); }}
          className={`flex-1 py-2 px-4 rounded-md font-medium text-sm transition-colors ${
            tab === 'saved'
              ? 'bg-primary text-primary-foreground'
              : 'bg-card border border-border text-foreground hover:bg-muted'
          }`}
        >
          Saved Courses
        </button>
        <button
          onClick={() => setTab('manual')}
          className={`flex-1 py-2 px-4 rounded-md font-medium text-sm transition-colors ${
            tab === 'manual'
              ? 'bg-primary text-primary-foreground'
              : 'bg-card border border-border text-foreground hover:bg-muted'
          }`}
        >
          Manual Entry
        </button>
      </div>

      {tab === 'saved' ? (
        <div className="space-y-4">
          {/* Tee Category */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Tee Category:</label>
            <div className="flex gap-2">
              {['men\'s', 'ladies\''].map(gender => (
                <button
                  key={gender}
                  onClick={() => setTeeGender(gender)}
                  className={`flex-1 py-2 px-4 rounded-md font-medium text-sm transition-colors ${
                    teeGender === gender
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card border border-border text-foreground hover:bg-muted'
                  }`}
                >
                  {gender === 'men\'s' ? '⛳ Men\'s' : '🏌️ Ladies\''}
                </button>
              ))}
            </div>
          </div>

          {/* Course list */}
          <div className="space-y-2">
            {courses.map(course => {
              const slopeKey = teeGender === 'men\'s' ? 'slope' : 'ladies_slope';
              const ratingKey = teeGender === 'men\'s' ? 'rating' : 'ladies_rating';
              
              const teeDetails = course.tee_sets
                .filter(t => {
                  if (teeGender === "ladies'") {
                    return t.gender === "ladies'" || typeof t.ladies_slope === 'number';
                  }
                  // men's: exclude tees that are ladies'-only
                  return t.gender !== "ladies'";
                })
                .filter(t => t[slopeKey])
                .map(t => `${t.name}: ${t[slopeKey]}/${t[ratingKey]}`)
                .join(', ');

              return (
                <button
                  key={course.id}
                  onClick={() => handleSelectSavedCourse(course)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedCourse?.id === course.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card hover:bg-muted'
                  }`}
                >
                  <div className="font-semibold text-foreground">{course.name}</div>
                  <div className="text-xs text-muted-foreground">{teeDetails || 'No tees'}</div>
                </button>
              );
            })}
          </div>

          {/* Warning */}
          {hasNoTeesForGender && (
            <div className="flex gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-700">
                No {teeGender === 'men\'s' ? 'ladies\'' : 'men\'s'} tees found for this course. Try the other category or edit the course tee sets.
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={prevStep}
              className="flex-1 py-2 px-4 rounded-md border-2 border-border bg-card text-foreground font-medium text-sm"
            >
              Back
            </button>
            <Button
              onClick={handleNextSaved}
              disabled={!selectedCourse || hasNoTeesForGender}
              className="flex-1"
            >
              Next
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Course Name</label>
            <Input
              placeholder="e.g. Pebble Beach"
              value={courseName}
              onChange={e => setCourseName(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-sm font-medium text-foreground mb-1 block">Slope</label>
              <Input
                type="number"
                placeholder="e.g. 113"
                value={slope}
                onChange={e => setSlope(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium text-foreground mb-1 block">Rating</label>
              <Input
                type="number"
                step="0.1"
                placeholder="e.g. 72.0"
                value={rating}
                onChange={e => setRating(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">You can set hole-by-hole par and handicap indexes on the scorecard.</p>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={prevStep}
              className="flex-1 py-2 px-4 rounded-md border-2 border-border bg-card text-foreground font-medium text-sm"
            >
              Back
            </button>
            <Button onClick={handleNextManual} disabled={!courseName.trim()} className="flex-1">
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}