"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Camera, X, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { base44 } from "@/api/base44Client";
import Webcam from "react-webcam";

export default function ScorecardScanner({ onScanComplete, onClose, round }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [showViewfinder, setShowViewfinder] = useState(false);
  const [autoCaptureReady, setAutoCaptureReady] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const webcamRef = useRef(null);
  const stabilityCheckRef = useRef(null);
  const lastImageDataRef = useRef(null);
  const stableFrameCountRef = useRef(0);

  const [stableCount, setStableCount] = useState(0);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [showCaptureButton, setShowCaptureButton] = useState(false);

  const handleAutoCapture = useCallback(() => {
    console.log("handleAutoCapture called, isProcessing:", isProcessing, "webcam:", !!webcamRef.current);
    if (!webcamRef.current || isProcessing) {
      console.log("Aborting capture - webcam or processing check failed");
      return;
    }
    const imageSrc = webcamRef.current.getScreenshot();
    console.log("Screenshot captured:", !!imageSrc);
    if (imageSrc) {
      setCaptureFlash(true);
      setTimeout(() => setCaptureFlash(false), 300);
      setCapturedImage(imageSrc);
      setAutoCaptureReady(false);
      setShowCaptureButton(false);
      if (stabilityCheckRef.current) {
        clearInterval(stabilityCheckRef.current);
      }
      processCapturedImage(imageSrc);
    }
  }, [isProcessing]);

  const checkImageStability = useCallback(() => {
    if (!webcamRef.current) {
      console.log("No webcam ref");
      return;
    }
    const video = webcamRef.current.video;
    if (!video || video.readyState !== 4) {
      console.log("Video not ready:", video?.readyState);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, 100, 100);
    const currentImageData = ctx.getImageData(0, 0, 100, 100).data;
    if (lastImageDataRef.current) {
      let diff = 0;
      for (let i = 0; i < currentImageData.length; i += 16) {
        diff += Math.abs(currentImageData[i] - lastImageDataRef.current[i]);
      }
      const avgDiff = diff / (currentImageData.length / 16);
      console.log("Frame diff:", avgDiff.toFixed(2), "stable count:", stableFrameCountRef.current);
      if (avgDiff < 25) {
        stableFrameCountRef.current += 1;
        if (stableFrameCountRef.current > 50) stableFrameCountRef.current = 50;
        setStableCount(stableFrameCountRef.current);
        if (stableFrameCountRef.current >= 50 && !showCaptureButton) {
          setShowCaptureButton(true);
        }
      } else {
        // Decay instead of full reset so minor camera noise doesn't kill all progress
        stableFrameCountRef.current = Math.max(0, stableFrameCountRef.current - 5);
        setStableCount(stableFrameCountRef.current);
        if (stableFrameCountRef.current < 50) {
          setShowCaptureButton(false);
        }
      }
    } else {
      console.log("First frame captured");
    }
    lastImageDataRef.current = currentImageData;
  }, [autoCaptureReady]);

  useEffect(() => {
    console.log("Viewfinder effect:", { showViewfinder, autoCaptureReady });
    if (showViewfinder && autoCaptureReady) {
      stabilityCheckRef.current = setInterval(checkImageStability, 100);
      console.log("Stability check interval started");
      return () => {
        if (stabilityCheckRef.current) {
          clearInterval(stabilityCheckRef.current);
          console.log("Stability check interval cleared");
        }
      };
    }
  }, [showViewfinder, autoCaptureReady, checkImageStability]);

  const handleOpenViewfinder = () => {
    setShowViewfinder(true);
    setError(null);
    setAutoCaptureReady(false);
    setCapturedImage(null);
    stableFrameCountRef.current = 0;
    setStableCount(0);
    lastImageDataRef.current = null;
  };

  const handleCloseViewfinder = () => {
    setShowViewfinder(false);
    setCapturedImage(null);
    setAutoCaptureReady(false);
    if (stabilityCheckRef.current) {
      clearInterval(stabilityCheckRef.current);
    }
  };

  const handleManualCapture = () => {
    if (!webcamRef.current || isProcessing) return;

    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) {
      setCapturedImage(imageSrc);
      if (stabilityCheckRef.current) {
        clearInterval(stabilityCheckRef.current);
      }
      processCapturedImage(imageSrc);
    }
  };

  const processCapturedImage = async (imageSrc) => {
    setIsProcessing(true);
    setError(null);

    try {
      const blob = await fetch(imageSrc).then(r => r.blob());
      const file = new File([blob], "scorecard.jpg", { type: "image/jpeg" });

      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: "object",
          properties: {
            players: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  player_name: { type: "string" },
                  hole_1: { type: "string", description: "Score for hole 1 only, NOT the OUT total. Use 'X' for DQ/pickup (no score on that hole)." },
                  hole_2: { type: "string", description: "Score for hole 2 only" },
                  hole_3: { type: "string", description: "Score for hole 3 only" },
                  hole_4: { type: "string", description: "Score for hole 4 only" },
                  hole_5: { type: "string", description: "Score for hole 5 only" },
                  hole_6: { type: "string", description: "Score for hole 6 only" },
                  hole_7: { type: "string", description: "Score for hole 7 only" },
                  hole_8: { type: "string", description: "Score for hole 8 only" },
                  hole_9: { type: "string", description: "Score for hole 9 only, NOT the OUT total" },
                  hole_10: { type: "string", description: "Score for hole 10 only, start of back nine" },
                  hole_11: { type: "string", description: "Score for hole 11 only" },
                  hole_12: { type: "string", description: "Score for hole 12 only" },
                  hole_13: { type: "string", description: "Score for hole 13 only" },
                  hole_14: { type: "string", description: "Score for hole 14 only" },
                  hole_15: { type: "string", description: "Score for hole 15 only" },
                  hole_16: { type: "string", description: "Score for hole 16 only" },
                  hole_17: { type: "string", description: "Score for hole 17 only" },
                  hole_18: { type: "string", description: "Score for hole 18 only, NOT the IN or TOT total" }
                },
                required: ["player_name"]
              }
            }
          },
          required: ["players"]
        }
      });

      if (result.status === "error") {
        throw new Error(result.details || "AI extraction failed");
      }

      const extractedPlayers = result.output?.players || [];
      
      if (!extractedPlayers || extractedPlayers.length === 0) {
        throw new Error("No players found in scorecard. Please ensure the image is clear and shows all 18 holes.");
      }

      const newPlayerScores = [];

      for (let i = 0; i < extractedPlayers.length; i++) {
        const extracted = extractedPlayers[i];
        const extractedName = (extracted.player_name || '').trim();
        
        let roundPlayer = findMatchingPlayer(extractedName, round?.players || []);
        
        if (!roundPlayer || !roundPlayer.player_id) {
          roundPlayer = round?.players?.[i];
        }
        
        if (!roundPlayer || !roundPlayer.player_id) {
          continue;
        }
        
        const holes = extractHoleScores(extracted);
        
        if (holes.every(h => h === '')) {
          continue;
        }

        newPlayerScores.push({
          playerId: roundPlayer.player_id,
          playerName: extracted?.player_name || roundPlayer?.name,
          scores: holes,
        });
      }

      if (!newPlayerScores || newPlayerScores.length === 0) {
        throw new Error("No valid scores were extracted. Please try again with a clearer image.");
      }

      onScanComplete(newPlayerScores);
      onClose();

    } catch (err) {
      console.error("Scan processing failed:", err);
      setError(err.message || "Processing failed. Please try again.");
      setIsProcessing(false);
      setCapturedImage(null);
    }
  };

  const findMatchingPlayer = (extractedName, players) => {
    if (!extractedName || !players || players.length === 0) return null;
    
    const normalize = (str) => str
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ');
    
    const normalizedExtracted = normalize(extractedName);
    
    let match = players.find(p => normalize(p.name || '') === normalizedExtracted);
    if (match) return match;
    
    match = players.find(p => {
      const normalizedRoster = normalize(p.name || '');
      return normalizedRoster.includes(normalizedExtracted) || 
             normalizedExtracted.includes(normalizedRoster);
    });
    if (match) return match;
    
    const extractedFirst = normalizedExtracted.split(' ')[0];
    if (extractedFirst.length > 1) {
      match = players.find(p => {
        const rosterFirst = normalize(p.name || '').split(' ')[0];
        return rosterFirst === extractedFirst;
      });
      if (match) return match;
    }
    
    for (const player of players) {
      const normalizedRoster = normalize(player.name || '');
      const longer = normalizedExtracted.length > normalizedRoster.length ? normalizedExtracted : normalizedRoster;
      const shorter = normalizedExtracted.length > normalizedRoster.length ? normalizedRoster : normalizedExtracted;
      
      let matches = 0;
      let shortIdx = 0;
      for (let longIdx = 0; longIdx < longer.length && shortIdx < shorter.length; longIdx++) {
        if (longer[longIdx] === shorter[shortIdx]) {
          matches++;
          shortIdx++;
        }
      }
      
      const similarity = matches / longer.length;
      if (similarity >= 0.7) {
        return player;
      }
    }
    
    return null;
  };

  const extractHoleScores = (extracted) => {
    const holes = Array(18).fill('');
    
    for (let h = 1; h <= 18; h++) {
      const scoreKey = `hole_${h}`;
      const scoreValue = extracted[scoreKey];
      
      if (scoreValue !== null && scoreValue !== undefined && scoreValue !== '') {
        const str = String(scoreValue).trim().toUpperCase();
        if (str === 'X') {
          holes[h - 1] = 'X';
        } else {
          const num = parseInt(str, 10);
          if (!isNaN(num) && num >= 1 && num <= 20) {
            holes[h - 1] = String(num);
          } else if (!isNaN(num) && num > 20) {
            console.warn(`Rejected score ${num} for hole ${h} - likely a total, not individual hole score`);
          }
        }
      }
    }
    
    if (holes.every(h => h === '') && extracted.scores) {
      const scoresArray = Array.isArray(extracted.scores) 
        ? extracted.scores 
        : String(extracted.scores).replace(/[^0-9Xx]/gi, '').split('');
      
      scoresArray.slice(0, 18).forEach((score, idx) => {
        const str = String(score).trim().toUpperCase();
        if (str === 'X') {
          holes[idx] = 'X';
        } else {
          const num = parseInt(str, 10);
          if (!isNaN(num) && num >= 1 && num <= 20) {
            holes[idx] = String(num);
          }
        }
      });
    }
    
    return holes;
  };

  const videoConstraints = {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 }
  };

  if (showViewfinder) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        <div className="relative flex-1 bg-black overflow-hidden">
          <Webcam
            ref={webcamRef}
            audio={false}
            videoConstraints={videoConstraints}
            screenshotFormat="image/jpeg"
            minScreenshotWidth={1280}
            minScreenshotHeight={720}
            className="absolute inset-0 w-full h-full object-cover"
            onUserMedia={() => setAutoCaptureReady(true)}
            onUserMediaError={(err) => {
              console.error("Webcam error:", err);
              setError("Camera access denied. Please enable camera permissions in your browser settings and try again.");
            }}
          />
          
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[85%] h-[70%] border-2 border-white/70 rounded-lg">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-white -mt-0.5 -ml-0.5"></div>
              <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-white -mt-0.5 -mr-0.5"></div>
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-white -mb-0.5 -ml-0.5"></div>
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-white -mb-0.5 -mr-0.5"></div>
            </div>
            
            {autoCaptureReady && !showCaptureButton && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2">
                <div className="bg-green-500/90 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  {`Hold steady... ${Math.round(stableCount * 2)}%`}
                </div>
                <div className="w-32 h-2 bg-black/30 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 transition-all duration-100"
                    style={{ width: `${Math.min(stableCount * 2, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {showCaptureButton && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2">
                <div className="bg-blue-500/90 text-white px-6 py-3 rounded-full text-base font-medium flex items-center gap-2 animate-pulse">
                  <CheckCircle className="w-5 h-5" />
                  Ready! Tap the camera button to capture
                </div>
              </div>
            )}

            {isProcessing && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2">
                <div className="bg-primary/90 text-white px-6 py-3 rounded-full text-base font-medium flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing scorecard...
                </div>
              </div>
            )}

            {captureFlash && (
              <div className="absolute inset-0 bg-white/80 animate-pulse pointer-events-none" />
            )}
          </div>

          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="bg-black p-6 flex items-center justify-center gap-4">
          {showCaptureButton ? (
            <Button 
              onClick={handleAutoCapture} 
              size="lg"
              className="w-20 h-20 rounded-full bg-blue-500 text-white hover:bg-blue-600 animate-pulse"
            >
              <Camera className="w-10 h-10" />
            </Button>
          ) : (
            <Button 
              onClick={handleManualCapture} 
              size="lg"
              className="w-16 h-16 rounded-full bg-white text-black hover:bg-white/90"
            >
              <Camera className="w-8 h-8" />
            </Button>
          )}
        </div>

        {error && (
          <div className="absolute bottom-32 left-4 right-4 bg-destructive/90 text-destructive-foreground p-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg bg-card border-border">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {isProcessing ? "Processing..." : "Scan Scorecard"}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-full transition-colors"
              disabled={isProcessing}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {!isProcessing && (
            <div className="space-y-4 py-8">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Camera className="w-8 h-8 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Use auto-capture for best results. Hold steady over the scorecard.
                </p>
              </div>

              <Button onClick={handleOpenViewfinder} className="w-full gap-2" size="lg">
                <Camera className="w-5 h-5" />
                Open Scanner
              </Button>
            </div>
          )}

          {isProcessing && capturedImage && (
            <div className="space-y-4">
              <div className="bg-black/60 rounded-lg p-6 text-center space-y-3">
                <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Processing scorecard...
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This may take a few seconds
                  </p>
                </div>
              </div>
              
              {error && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                  <Button 
                    onClick={() => {
                      setError(null);
                      setIsProcessing(false);
                      setCapturedImage(null);
                    }} 
                    variant="outline" 
                    className="w-full"
                  >
                    Try Again
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}