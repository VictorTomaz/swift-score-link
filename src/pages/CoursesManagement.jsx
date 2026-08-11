import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, ChevronDown, ChevronUp, Save, X, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import PageDescription from "@/components/PageDescription";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const DEFAULT_PAR = Array(18).fill(4);
const DEFAULT_HI = Array(18).fill(1).map((_, i) => i + 1);

function TeeSetEditor({ teeSet, onChange, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const [viewGender, setViewGender] = useState(teeSet.gender || "men's");

  const slopeKey = viewGender === "men's" ? "slope" : "ladies_slope";
  const ratingKey = viewGender === "men's" ? "rating" : "ladies_rating";
  const hiKey = viewGender === "men's" ? "hole_handicap_indexes" : "ladies_hole_handicap_indexes";
  const parKey = viewGender === "men's" ? "par" : "ladies_par";

  const currentSlope = teeSet[slopeKey] ?? "";
  const currentRating = teeSet[ratingKey] ?? "";

  const updateHole = (field, index, value) => {
    const currentArr = teeSet[field];
    const arr = currentArr && currentArr.length === 18 
      ? [...currentArr] 
      : [...(field === "par" || field === "ladies_par" ? DEFAULT_PAR : DEFAULT_HI)];
    arr[index] = value === "" ? "" : Number(value);
    onChange({ ...teeSet, [field]: arr });
  };

  const par = teeSet[parKey]?.length === 18 ? teeSet[parKey] : [...DEFAULT_PAR];
  const hi = teeSet[hiKey]?.length === 18 ? teeSet[hiKey] : [...DEFAULT_HI];

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-muted/40 space-y-2">
        {/* Row 1: tee name + gender toggle + expand/remove */}
        <div className="flex items-center gap-2">
          <Input
            value={teeSet.name || ""}
            onChange={e => onChange({ ...teeSet, name: e.target.value })}
            placeholder="Tee name (e.g. Blue)"
            className="h-9 text-sm flex-1"
          />
          <div className="flex rounded-md overflow-hidden border border-border shrink-0">
            {["men's", "ladies'"].map(g => (
              <button
                key={g}
                type="button"
                onClick={() => {
                  setViewGender(g);
                  onChange({ ...teeSet, gender: g });
                }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  (teeSet.gender || "men's") === g
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                {g === "men's" ? "M" : "L"}
              </button>
            ))}
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setExpanded(e => !e)}
                  className="p-2 text-muted-foreground hover:text-foreground"
                >
                  {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Edit par and handicap indexes</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <button type="button" onClick={onRemove} className="p-2 text-destructive hover:text-destructive/80">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Row 2: slope + rating inputs */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground font-medium block mb-1">
              {viewGender === "men's" ? "Men's" : "Ladies'"} Slope
            </label>
            <Input
              type="number"
              value={currentSlope}
              onChange={e => onChange({ ...teeSet, [slopeKey]: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="e.g. 113"
              className="h-10 text-sm w-full"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground font-medium block mb-1">
              {viewGender === "men's" ? "Men's" : "Ladies'"} Rating
            </label>
            <Input
              type="number"
              step="0.1"
              value={currentRating}
              onChange={e => onChange({ ...teeSet, [ratingKey]: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="e.g. 72.0"
              className="h-10 text-sm w-full"
            />
          </div>
        </div>
      </div>

      {expanded && (
        <div className="p-3 space-y-3 bg-background">
          <p className="text-xs text-muted-foreground italic">Par and handicap indexes are managed at the course level above</p>
        </div>
      )}
    </div>
  );
}

function CourseCard({ course, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [viewGender, setViewGender] = useState("men's");
  const [courseInfoExpanded, setCourseInfoExpanded] = useState(true);

  const copyParHandicapToBoth = () => {
    if (!draft) return;
    if (viewGender === "men's") {
      setDraft(d => ({
        ...d,
        ladies_par: [...(d.par || DEFAULT_PAR)],
        ladies_hole_handicap_indexes: [...(d.hole_handicap_indexes || DEFAULT_HI)]
      }));
    } else {
      setDraft(d => ({
        ...d,
        par: [...(d.ladies_par || DEFAULT_PAR)],
        hole_handicap_indexes: [...(d.ladies_hole_handicap_indexes || DEFAULT_HI)]
      }));
    }
  };

  const startEdit = () => {
    // Extract par/handicap from first tee set (they're shared across all tee sets)
    const firstTee = course.tee_sets?.[0] || {};
    setDraft({ 
      ...course, 
      tee_sets: course.tee_sets || [],
      par: firstTee.par || DEFAULT_PAR,
      ladies_par: firstTee.ladies_par || DEFAULT_PAR,
      hole_handicap_indexes: firstTee.hole_handicap_indexes || DEFAULT_HI,
      ladies_hole_handicap_indexes: firstTee.ladies_hole_handicap_indexes || DEFAULT_HI,
    });
    setEditing(true);
  };

  const addTeeSet = () => {
    setDraft(d => ({
      ...d,
      tee_sets: [...(d.tee_sets || []), {
        name: "",
        slope: null,
        rating: null,
        ladies_slope: null,
        ladies_rating: null,
        gender: "men's",
      }]
    }));
  };

  const updateTeeSet = (index, updated) => {
    setDraft(d => {
      const tee_sets = [...d.tee_sets];
      tee_sets[index] = updated;
      return { ...d, tee_sets };
    });
  };

  const removeTeeSet = (index) => {
    setDraft(d => ({ ...d, tee_sets: d.tee_sets.filter((_, i) => i !== index) }));
  };

  const updateCoursePar = (index, value) => {
    const field = viewGender === "men's" ? "par" : "ladies_par";
    const arr = [...(draft[field] || DEFAULT_PAR)];
    arr[index] = value === "" ? "" : Number(value);
    setDraft(d => ({ ...d, [field]: arr }));
  };

  const updateCourseHI = (index, value) => {
    const field = viewGender === "men's" ? "hole_handicap_indexes" : "ladies_hole_handicap_indexes";
    const arr = [...(draft[field] || DEFAULT_HI)];
    arr[index] = value === "" ? "" : Number(value);
    setDraft(d => ({ ...d, [field]: arr }));
  };

  const handleSave = () => {
    const par = draft.par?.length === 18 ? draft.par : DEFAULT_PAR;
    const ladiesPar = draft.ladies_par?.length === 18 ? draft.ladies_par : DEFAULT_PAR;
    const hi = draft.hole_handicap_indexes?.length === 18 ? draft.hole_handicap_indexes : DEFAULT_HI;
    const ladiesHi = draft.ladies_hole_handicap_indexes?.length === 18 ? draft.ladies_hole_handicap_indexes : DEFAULT_HI;
    
    // If no tee sets exist, create a default one to hold the par/handicap data
    // (par and handicap indexes are stored inside tee sets, not at course level)
    const baseTeeSets = (draft.tee_sets && draft.tee_sets.length > 0)
      ? draft.tee_sets
      : [{ name: "Default", slope: 113, rating: 72.0, ladies_slope: null, ladies_rating: null, gender: "men's" }];
    
    // Update ALL tee sets with the same par/handicap (shared across course)
    const updatedTeeSets = baseTeeSets.map(ts => ({ 
      ...ts, 
      par, 
      ladies_par: ladiesPar,
      hole_handicap_indexes: hi,
      ladies_hole_handicap_indexes: ladiesHi 
    }));
    
    onSave({ ...draft, tee_sets: updatedTeeSets });
    setEditing(false);
  };

  if (!editing) {
    return (
      <>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-3">
          <p className="font-semibold text-foreground">{course.name}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="edit" onClick={startEdit}>Edit Course</Button>
            <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(true)} className="text-destructive border-destructive/30 hover:bg-destructive/10">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        
        <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Course?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{course.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-2 justify-end">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => { onDelete(course.id); setDeleteConfirm(false); }} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <div className="bg-card border border-primary rounded-xl p-4 space-y-3">
      <Input
        value={draft.name}
        onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
        placeholder="Course name"
        className="font-semibold"
      />



      <div className="space-y-2">
        {(draft.tee_sets || []).map((ts, i) => (
          <TeeSetEditor
            key={i}
            teeSet={ts}
            onChange={updated => updateTeeSet(i, updated)}
            onRemove={() => removeTeeSet(i)}
          />
        ))}
      </div>

      <Button size="sm" variant="outline" onClick={addTeeSet} className="gap-1.5">
        <Plus className="w-3.5 h-3.5" /> Add Tee Set
      </Button>

      {/* Collapsible Course Par & Handicap section */}
      <div className="border border-border rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setCourseInfoExpanded(!courseInfoExpanded)}
          className="w-full px-3 py-2 bg-muted/30 flex items-center justify-between"
        >
          <h3 className="text-sm font-semibold text-foreground">Course Par & Handicap</h3>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                copyParHandicapToBoth();
              }}
              className="h-7 text-xs"
            >
              Copy to Both
            </Button>
            <div className="flex rounded-md overflow-hidden border border-border">
              {["men's", "ladies'"].map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewGender(g);
                  }}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    viewGender === g
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {g === "men's" ? "Men" : "Ladies"}
                </button>
              ))}
            </div>
            {courseInfoExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {courseInfoExpanded && (
          <div className="p-3 space-y-3 bg-background">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-foreground">Par</span>
                <span className="text-[10px] text-muted-foreground">(3–5 per hole)</span>
              </div>
              <div className="grid grid-cols-9 gap-1">
                {Array(18).fill(0).map((_, i) => {
                  const field = viewGender === "men's" ? "par" : "ladies_par";
                  const val = (draft[field] || DEFAULT_PAR)[i];
                  return (
                    <div key={i} className="text-center">
                      <div className="text-xs text-muted-foreground mb-0.5">H{i + 1}</div>
                      <Input
                        type="number"
                        min="3" max="5"
                        value={val}
                        onChange={e => updateCoursePar(i, e.target.value)}
                        className="h-8 text-xs text-center px-1"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-foreground">Handicap Index</span>
                <span className="text-[10px] text-muted-foreground">(1–18, 1 = hardest)</span>
              </div>
              <div className="grid grid-cols-9 gap-1">
                {Array(18).fill(0).map((_, i) => {
                  const field = viewGender === "men's" ? "hole_handicap_indexes" : "ladies_hole_handicap_indexes";
                  const val = (draft[field] || DEFAULT_HI)[i];
                  return (
                    <div key={i} className="text-center">
                      <div className="text-xs text-muted-foreground mb-0.5">H{i + 1}</div>
                      <Input
                        type="number"
                        min="1" max="18"
                        value={val}
                        onChange={e => updateCourseHI(i, e.target.value)}
                        className="h-8 text-xs text-center px-1"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSave} className="gap-1.5">
          <Save className="w-3.5 h-3.5" /> Save
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </div>
  );
}

export default function CoursesManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");

  // All courses with tee data
  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: () => base44.entities.Course.filter({}, 'name', 500),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Course.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["courses"] }); setNewName(""); toast.success("Course created"); },
    onError: (error) => {
      console.error("Create course error:", error);
      toast.error(`Failed to create: ${error.message || "Unknown error"}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data) => {
      return base44.entities.Course.update(data.id, {
        name: data.name,
        tee_sets: data.tee_sets,
        par: data.par,
        ladies_par: data.ladies_par,
        hole_handicap_indexes: data.hole_handicap_indexes,
        ladies_hole_handicap_indexes: data.ladies_hole_handicap_indexes,
        is_private: data.is_private ?? false,
      });
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ["courses"] }); 
      toast.success("Course saved"); 
    },
    onError: (error) => {
      console.error("Update course error:", error);
      toast.error(`Failed to save: ${error.message || "Unknown error"}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Course.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["courses"] }); toast.success("Course deleted"); },
    onError: (error) => {
      console.error("Delete course error:", error);
      toast.error(`Failed to delete: ${error.message || "Unknown error"}`);
    },
  });

  const handleCreate = () => {
    if (!newName.trim()) return;
    createMutation.mutate({ name: newName.trim(), tee_sets: [] });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20 sm:pb-0">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/Settings')} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Settings
        </Button>
      </div>
      <PageDescription
        title="Course Management"
        description="Create and manage golf courses with multiple tee sets. Each tee set includes slope/rating for men and ladies, plus par and handicap indexes for all 18 holes."
      />

      {/* Add new course */}
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New course name"
          onKeyDown={e => e.key === "Enter" && handleCreate()}
          className="flex-1"
        />
        <Button onClick={handleCreate} disabled={!newName.trim() || createMutation.isPending} className="gap-1.5">
          <Plus className="w-4 h-4" /> Add
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : courses.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium">No courses yet</p>
          <p className="text-sm mt-1">Add a course above to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {courses.map(course => (
            <CourseCard
              key={course.id}
              course={course}
              onSave={(data) => updateMutation.mutate(data)}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}