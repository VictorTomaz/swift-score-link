import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Check, Save, Lock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function CourseSetup({ round, onUpdate }) {
  const isReadOnly = !!round.course_id;
  const [pars, setPars] = useState(
    round.par?.length === 18 ? round.par : new Array(18).fill(4)
  );
  const [hdcps, setHdcps] = useState(
    round.hole_handicap_indexes?.length === 18
      ? round.hole_handicap_indexes
      : Array.from({ length: 18 }, (_, i) => i + 1)
  );
  const [ladiesHdcps, setLadiesHdcps] = useState(
    round.ladies_hole_handicap_indexes?.length === 18
      ? round.ladies_hole_handicap_indexes
      : Array.from({ length: 18 }, (_, i) => i + 1)
  );
  const [hdcpGender, setHdcpGender] = useState("men's");

  const activeHdcps = hdcpGender === "men's" ? hdcps : ladiesHdcps;
  const setActiveHdcps = hdcpGender === "men's" ? setHdcps : setLadiesHdcps;

  const updatePar = (i, val) => {
    const next = [...pars];
    next[i] = val === "" ? "" : Number(val);
    setPars(next);
  };

  const updateHdcp = (i, val) => {
    const next = [...activeHdcps];
    next[i] = val === "" ? "" : Number(val);
    setActiveHdcps(next);
  };

  const [saved, setSaved] = useState(false);

  const save = () => {
    const finalPars = pars.map(p => Number(p) || 4);
    const finalHdcps = hdcps.map((h, i) => Number(h) || i + 1);
    const finalLadiesHdcps = ladiesHdcps.map((h, i) => Number(h) || i + 1);
    onUpdate({ par: finalPars, hole_handicap_indexes: finalHdcps, ladies_hole_handicap_indexes: finalLadiesHdcps });
    setSaved(true);
    toast.success("Course data saved!");
    setTimeout(() => setSaved(false), 3000);
  };

  const saveAsCourse = async () => {
    const courseName = round.course_name?.trim();
    if (!courseName) {
      toast.error("Round must have a course name to save.");
      return;
    }
    const teeSetName = round.tee_set || "Default";
    const teeData = {
      name: teeSetName,
      slope: round.slope || 113,
      rating: round.rating || 72.0,
      par: pars,
      hole_handicap_indexes: hdcps,
      ladies_hole_handicap_indexes: ladiesHdcps,
    };

    if (round.course_id) {
      // Update the existing saved course
      const existing = await base44.entities.Course.filter({ id: round.course_id });
      if (existing?.[0]) {
        const updatedTeeSets = existing[0].tee_sets?.map(ts =>
          ts.name === teeSetName ? { ...ts, ...teeData } : ts
        ) || [teeData];
        // Add tee if it didn't exist
        if (!updatedTeeSets.some(ts => ts.name === teeSetName)) updatedTeeSets.push(teeData);
        await base44.entities.Course.update(round.course_id, { tee_sets: updatedTeeSets });
        toast.success(`"${courseName}" updated!`);
        return;
      }
    }

    // No course_id — create a new reusable course
    await base44.entities.Course.create({
      name: courseName,
      tee_sets: [teeData],
    });
    toast.success(`"${courseName}" saved as a reusable course!`);
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Course Setup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isReadOnly && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <Lock className="w-3 h-3 shrink-0" />
            <span>Course data is managed in <strong>Courses Management</strong>. This is read-only for reference.</span>
          </div>
        )}
        {!isReadOnly && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Set par and handicap index for each hole.</p>
            <div className="flex items-center gap-2">
              {hdcpGender === "ladies'" && (
                <button
                  type="button"
                  onClick={() => setLadiesHdcps([...hdcps])}
                  className="text-xs text-primary underline font-medium"
                >
                  Copy from Men's
                </button>
              )}
              <div className="flex rounded-md overflow-hidden border border-border shrink-0">
                {["men's", "ladies'"].map(g => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setHdcpGender(g)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      hdcpGender === g
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {g === "men's" ? "M HDCP" : "L HDCP"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left py-2 pr-3 font-medium">Hole</th>
                {Array.from({ length: 9 }, (_, i) => (
                  <th key={i} className="text-center py-2 px-1 font-medium w-10">{i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1 pr-3 font-medium text-foreground">Par</td>
                {pars.slice(0, 9).map((p, i) => (
                  <td key={i} className="px-0.5">
                    <Input
                     className="w-10 h-8 text-center text-xs p-0"
                     type="text"
                     inputMode="numeric"
                     value={p}
                     onChange={e => !isReadOnly && updatePar(i, e.target.value)}
                     readOnly={isReadOnly}
                    />
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-1 pr-3 font-medium text-foreground">HDCP</td>
                {activeHdcps.slice(0, 9).map((h, i) => (
                  <td key={i} className="px-0.5">
                    <Input
                     className="w-10 h-8 text-center text-xs p-0"
                     type="text"
                     inputMode="numeric"
                     value={h}
                     onChange={e => !isReadOnly && updateHdcp(i, e.target.value)}
                     readOnly={isReadOnly}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>

          <table className="w-full text-sm mt-4">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left py-2 pr-3 font-medium">Hole</th>
                {Array.from({ length: 9 }, (_, i) => (
                  <th key={i} className="text-center py-2 px-1 font-medium w-10">{i + 10}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1 pr-3 font-medium text-foreground">Par</td>
                {pars.slice(9, 18).map((p, i) => (
                  <td key={i} className="px-0.5">
                    <Input
                     className="w-10 h-8 text-center text-xs p-0"
                     type="text"
                     inputMode="numeric"
                     value={p}
                     onChange={e => !isReadOnly && updatePar(i + 9, e.target.value)}
                     readOnly={isReadOnly}
                    />
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-1 pr-3 font-medium text-foreground">HDCP</td>
                {activeHdcps.slice(9, 18).map((h, i) => (
                  <td key={i} className="px-0.5">
                    <Input
                     className="w-10 h-8 text-center text-xs p-0"
                     type="text"
                     inputMode="numeric"
                     value={h}
                     onChange={e => !isReadOnly && updateHdcp(i + 9, e.target.value)}
                     readOnly={isReadOnly}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        {!isReadOnly && (
          <div className="space-y-2">
            <Button onClick={save} className={`gap-2 w-full ${saved ? 'bg-green-600 hover:bg-green-600' : ''}`}>
              <Check className="w-4 h-4" /> {saved ? 'Saved!' : 'Save Course Data'}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              To edit a saved course's holes permanently, go to <strong>Courses Management</strong>.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}