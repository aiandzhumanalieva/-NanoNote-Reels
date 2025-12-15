import React, { useEffect, useRef, useState } from 'react';
import { Presentation } from '../types';
import { Play, Pause, RefreshCw, SkipForward, SkipBack, Download, Loader2, Music, Gauge, ChevronsRight, Images as ImageIcon, FileText } from 'lucide-react';
import JSZip from 'jszip';

interface PlayerProps {
  presentation: Presentation;
  onReset: () => void;
}

export const Player: React.FC<PlayerProps> = ({ presentation, onReset }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMusicMuted, setIsMusicMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0); // 1.0, 1.25, 1.5
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const mode = presentation.mode;
  const audioSrc = mode === 'topic' || mode === 'script' || mode === 'biography' ? presentation.fullAudioUrl : presentation.originalAudioUrl;

  const [loadedImages, setLoadedImages] = useState<HTMLImageElement[]>([]);

  // Setup Background Music
  useEffect(() => {
    if (bgAudioRef.current && presentation.bgMusicUrl) {
       bgAudioRef.current.src = presentation.bgMusicUrl;
       bgAudioRef.current.volume = 0.20; 
       bgAudioRef.current.loop = true;
       // Prevent crash if music fails to load
       bgAudioRef.current.onerror = () => {
           console.warn("Background music failed to load. Playback will continue without music.");
       };
    }
  }, [presentation.bgMusicUrl]);

  // Toggle Music Mute
  useEffect(() => {
    if(bgAudioRef.current) {
        bgAudioRef.current.muted = isMusicMuted;
    }
  }, [isMusicMuted]);

  // Sync Playback Rate (Speed)
  useEffect(() => {
      if (audioRef.current) {
          audioRef.current.playbackRate = playbackRate;
      }
      if (bgAudioRef.current) {
          bgAudioRef.current.playbackRate = playbackRate;
      }
  }, [playbackRate]);

  useEffect(() => {
    const loadAllImages = async () => {
        const imgs = await Promise.all(
            presentation.slides.map(s => new Promise<HTMLImageElement>((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => {
                    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
                    resolve(img);
                }
                img.src = s.imageUrl || '';
                if (!s.imageUrl) {
                     img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
                     resolve(img);
                }
            }))
        );
        setLoadedImages(imgs);
    };
    loadAllImages();
  }, [presentation.slides]);

  useEffect(() => {
    if (audioRef.current && audioSrc) {
        if (audioRef.current.src !== audioSrc) {
            audioRef.current.src = audioSrc;
            audioRef.current.playbackRate = playbackRate;
        }
    }
  }, [audioSrc]);

  // --- RENDER LOOP (VERTICAL) ---
  useEffect(() => {
    if (loadedImages.length === 0) return;
    
    let animationFrameId: number;
    const ctx = canvasRef.current?.getContext('2d');
    
    const render = () => {
        if (!ctx || !canvasRef.current || !audioRef.current) return;
        
        const cvs = canvasRef.current;
        const time = audioRef.current.currentTime;
        
        let activeIdx = 0;
        let nextIdx = -1;
        
        for (let i = 0; i < presentation.slides.length; i++) {
            if (time >= (presentation.slides[i].timestamp || 0)) {
                activeIdx = i;
            }
        }
        if (activeIdx < presentation.slides.length - 1) {
            nextIdx = activeIdx + 1;
        }

        const currentSlide = presentation.slides[activeIdx];
        const nextSlide = nextIdx !== -1 ? presentation.slides[nextIdx] : null;

        const slideStart = currentSlide.timestamp || 0;
        const slideEnd = nextSlide ? nextSlide.timestamp : duration || (slideStart + 5);
        const slideDuration = Math.max(slideEnd - slideStart, 1);
        const progress = Math.min(Math.max((time - slideStart) / slideDuration, 0), 1);

        const TRANSITION_DURATION = 0.5 / playbackRate; 
        const timeToNext = slideEnd - time;
        const isTransitioning = nextSlide && timeToNext < TRANSITION_DURATION;
        
        const drawLayer = (img: HTMLImageElement, idx: number, opacity: number, localProgress: number) => {
            if (!img.width) return;
            ctx.globalAlpha = opacity;
            
            // Correct Aspect Ratio Handling (Object-Fit: Cover)
            const canvasAR = cvs.width / cvs.height;
            const imgAR = img.width / img.height;
            
            // 1. Calculate the 'Cover' rectangle (Maximum 9:16 rect that fits in source image)
            let coverW, coverH;
            if (imgAR > canvasAR) {
                // Image is wider than canvas: Constrain by height
                coverH = img.height;
                coverW = img.height * canvasAR;
            } else {
                // Image is taller than canvas: Constrain by width
                coverW = img.width;
                coverH = img.width / canvasAR;
            }

            // 2. Apply Scale (Zoom in/out)
            const isZoomIn = idx % 2 === 0;
            const scaleFactor = 0.15; // increased slightly for better effect
            let scale;
            if (isZoomIn) {
                scale = 1.0 + (localProgress * scaleFactor);
            } else {
                scale = 1.15 - (localProgress * scaleFactor);
            }
            
            // The view dimensions within the image
            const viewW = coverW / scale;
            const viewH = coverH / scale;

            // 3. Panning Logic
            const panXDir = (idx % 3) - 1; // -1, 0, 1
            const panYDir = ((idx + 1) % 3) - 1; // 0, 1, -1

            // Calculate max safe pan offsets to keep image covering the canvas
            // We can pan up to the edge of the image
            // Available slack = (img.width - viewW)
            const maxDX = Math.max(0, (img.width - viewW) / 2);
            const maxDY = Math.max(0, (img.height - viewH) / 2);
            
            // Dampen pan amount so we don't always hit the extreme edge
            const panX = panXDir * maxDX * localProgress * 0.8;
            const panY = panYDir * maxDY * localProgress * 0.8;

            const centerX = img.width / 2;
            const centerY = img.height / 2;

            const sx = (centerX + panX) - (viewW / 2);
            const sy = (centerY + panY) - (viewH / 2);

            ctx.drawImage(img, sx, sy, viewW, viewH, 0, 0, cvs.width, cvs.height);
        };

        // 1. Draw Background
        ctx.fillStyle = '#000'; // Keep video background black
        ctx.fillRect(0, 0, cvs.width, cvs.height);

        // 2. Draw Active Slide
        if (loadedImages[activeIdx]) {
            drawLayer(loadedImages[activeIdx], activeIdx, 1.0, progress);
        }

        // 3. Draw Transition
        if (isTransitioning && nextSlide && loadedImages[nextIdx]) {
            const transitionProgress = 1 - (timeToNext / TRANSITION_DURATION);
            const alpha = transitionProgress; 
            drawLayer(loadedImages[nextIdx], nextIdx, alpha, 0);
        }
        
        animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);

  }, [loadedImages, presentation, duration, playbackRate]);

  const handleMetadataLoaded = (e: React.SyntheticEvent<HTMLAudioElement>) => {
      const dur = e.currentTarget.duration;
      setDuration(dur);
      if ((mode === 'topic' || mode === 'script' || mode === 'biography') && presentation.slides.length > 0 && presentation.slides[0].timestamp === 0) {
          let accumulatedTime = 0;
          presentation.slides.forEach(slide => {
              slide.timestamp = accumulatedTime;
              const slideDuration = (slide.durationRatio || (1/presentation.slides.length)) * dur;
              accumulatedTime += slideDuration;
          });
      }
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const time = e.currentTarget.currentTime;
    setCurrentTime(time);
    
    // Sync Music
    if (bgAudioRef.current && isPlaying && !bgAudioRef.current.paused) {
         if (Math.abs(bgAudioRef.current.currentTime - (time % bgAudioRef.current.duration)) > 0.5) {
             // Sync logic
         }
    }

    let activeIndex = 0;
    for (let i = 0; i < presentation.slides.length; i++) {
        const slideTimestamp = presentation.slides[i].timestamp || 0;
        if (time >= slideTimestamp) {
            activeIndex = i;
        }
    }
    if (activeIndex !== currentSlideIndex) {
        setCurrentSlideIndex(activeIndex);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      if(bgAudioRef.current) bgAudioRef.current.pause();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      audioRef.current.play().catch(e => {
        if (e.name !== 'AbortError') {
             console.error("Play error:", e);
             setIsPlaying(false);
        }
      });
      if(bgAudioRef.current && presentation.bgMusicUrl && !isMusicMuted) {
          bgAudioRef.current.play().catch((e) => {
              console.warn("Background music play failed:", e);
          });
      }
    }
  };

  const toggleSpeed = () => {
      const speeds = [1.0, 1.25, 1.5];
      const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
      setPlaybackRate(speeds[nextIdx]);
  };

  const skipSlide = (direction: 'next' | 'prev') => {
    if (!audioRef.current) return;
    let targetIndex = currentSlideIndex;
    if (direction === 'next' && currentSlideIndex < presentation.slides.length - 1) {
       targetIndex = currentSlideIndex + 1;
    } else if (direction === 'prev' && currentSlideIndex > 0) {
       targetIndex = currentSlideIndex - 1;
    }
    if (targetIndex !== currentSlideIndex) {
        setCurrentSlideIndex(targetIndex);
        const targetTime = presentation.slides[targetIndex].timestamp || 0;
        audioRef.current.currentTime = targetTime;
        if(bgAudioRef.current) bgAudioRef.current.currentTime = targetTime % bgAudioRef.current.duration;
    }
  };


  const handleDownloadVideo = async () => {
      if (!audioRef.current || !audioSrc || !canvasRef.current) return;
      
      // Ensure we have loaded all images
      if (loadedImages.length < presentation.slides.length) {
          alert("Подождите полной загрузки всех кадров перед экспортом.");
          return;
      }

      setIsExporting(true);
      const exportPlaybackRate = 1.0; 

      try {
          // Default to WebM as requested
          let mimeType = 'video/webm';
          let fileExt = 'webm';
          
          // Only fallback to MP4 if WebM is NOT supported
          if (!MediaRecorder.isTypeSupported('video/webm')) {
              if (MediaRecorder.isTypeSupported('video/mp4')) {
                  mimeType = 'video/mp4';
                  fileExt = 'mp4';
              }
          }

          // Use OfflineAudioContext or Standard AudioContext to decode and mix properly
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const dest = audioCtx.createMediaStreamDestination();
          
          // --- AUDIO MIXING CHAIN (To prevent noise/clipping) ---
          
          // 1. Dynamics Compressor (The "Magic" Fix for Noise)
          // This squashes loud peaks that cause static crackle.
          const compressor = audioCtx.createDynamicsCompressor();
          compressor.threshold.value = -10;
          compressor.knee.value = 40;
          compressor.ratio.value = 12;
          compressor.attack.value = 0;
          compressor.release.value = 0.25;
          
          // 2. Master Gain (Safety margin)
          const masterGain = audioCtx.createGain();
          masterGain.gain.value = 0.95; // Slight reduction to be safe

          // Connect Chain: [Inputs] -> Compressor -> MasterGain -> Destination
          compressor.connect(masterGain);
          masterGain.connect(dest);
          masterGain.connect(audioCtx.destination); // Let user hear export

          // --- FETCH & DECODE VOICE ---
          // Use fetch instead of createMediaElementSource to avoid CPU glitches
          const response = await fetch(audioSrc);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          
          const voiceSource = audioCtx.createBufferSource();
          voiceSource.buffer = audioBuffer;
          voiceSource.playbackRate.value = exportPlaybackRate;

          const voiceGain = audioCtx.createGain();
          voiceGain.gain.value = 0.9; // 90% volume for voice
          voiceSource.connect(voiceGain);
          voiceGain.connect(compressor);

          // --- FETCH & DECODE MUSIC ---
          let bgSource: AudioBufferSourceNode | null = null;
          if (presentation.bgMusicUrl && !isMusicMuted) {
             try {
                 const bgResponse = await fetch(presentation.bgMusicUrl);
                 const bgArrayBuffer = await bgResponse.arrayBuffer();
                 const bgAudioBuffer = await audioCtx.decodeAudioData(bgArrayBuffer);
                 
                 bgSource = audioCtx.createBufferSource();
                 bgSource.buffer = bgAudioBuffer;
                 bgSource.loop = true;
                 bgSource.playbackRate.value = exportPlaybackRate;
                 
                 const bgGain = audioCtx.createGain();
                 bgGain.gain.value = 0.15; // 15% volume for music (prevents clipping when summed)
                 
                 bgSource.connect(bgGain);
                 bgGain.connect(compressor);
             } catch (e) {
                 console.warn("Failed to mix background music for export:", e);
             }
          }

          // --- VISUAL SETUP ---
          const renderCanvas = document.createElement('canvas');
          renderCanvas.width = 1080;  
          renderCanvas.height = 1920; 
          const ctx = renderCanvas.getContext('2d');
          if (!ctx) throw new Error("No canvas ctx");

          const canvasStream = renderCanvas.captureStream(30);
          const combinedStream = new MediaStream([
              ...canvasStream.getVideoTracks(),
              ...dest.stream.getAudioTracks()
          ]);

          const recorder = new MediaRecorder(combinedStream, {
              mimeType: mimeType,
              videoBitsPerSecond: 12000000 // Increased to 12 Mbps
          });

          const chunks: Blob[] = [];
          recorder.ondataavailable = (e) => {
              if (e.data.size > 0) chunks.push(e.data);
          };

          recorder.onstop = () => {
              const blob = new Blob(chunks, { type: mimeType });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `NanoReel_${presentation.topic.slice(0, 10).replace(/\s+/g, '_')}.${fileExt}`;
              a.click();
              setIsExporting(false);
              audioCtx.close();
          };

          // START EVERYTHING
          const startTime = audioCtx.currentTime + 0.1; // slight buffer
          voiceSource.start(startTime);
          if (bgSource) bgSource.start(startTime);
          recorder.start();

          // Duration tracking
          const totalDuration = audioBuffer.duration / exportPlaybackRate;

          // Event Listener for Voice End (cleanest stop)
          voiceSource.onended = () => {
              setTimeout(() => {
                  if (recorder.state === 'recording') recorder.stop();
              }, 500); // slight tail
          };

          // --- RENDER LOOP ---
          const renderExportFrame = () => {
              if (voiceSource.context.state === 'closed') return; // Abort if closed

              // Calculate time relative to AudioContext start
              const time = Math.max(0, (audioCtx.currentTime - startTime) * exportPlaybackRate);
              
              if (time > totalDuration + 1.0) { // Safety timeout
                   if (recorder.state === 'recording') recorder.stop();
                   return;
              }

              let activeIdx = 0;
              let nextIdx = -1;
              for (let i = 0; i < presentation.slides.length; i++) {
                if (time >= (presentation.slides[i].timestamp || 0)) activeIdx = i;
              }
              if (activeIdx < presentation.slides.length - 1) nextIdx = activeIdx + 1;

              const currentSlide = presentation.slides[activeIdx];
              const nextSlide = nextIdx !== -1 ? presentation.slides[nextIdx] : null;
              const slideStart = currentSlide.timestamp || 0;
              const slideEnd = nextSlide ? nextSlide.timestamp : totalDuration;
              const slideDuration = Math.max(slideEnd - slideStart, 0.1); 
              const progress = Math.min(Math.max((time - slideStart) / slideDuration, 0), 1);
              
              const TRANSITION_DURATION = 0.5 / exportPlaybackRate;
              const timeToNext = slideEnd - time;
              const isTransitioning = nextSlide && timeToNext < TRANSITION_DURATION;

              const drawLayer = (img: HTMLImageElement, idx: number, opacity: number, localProgress: number) => {
                ctx.globalAlpha = opacity;
                
                // Export Logic MUST match Preview Logic (Copy of Correct Aspect Ratio Handling)
                const canvasAR = renderCanvas.width / renderCanvas.height;
                const imgAR = img.width / img.height;
                
                let coverW, coverH;
                if (imgAR > canvasAR) {
                    coverH = img.height;
                    coverW = img.height * canvasAR;
                } else {
                    coverW = img.width;
                    coverH = img.width / canvasAR;
                }

                const isZoomIn = idx % 2 === 0;
                const scaleFactor = 0.15;
                let scale;
                if (isZoomIn) {
                    scale = 1.0 + (localProgress * scaleFactor);
                } else {
                    scale = 1.15 - (localProgress * scaleFactor);
                }
                
                const viewW = coverW / scale;
                const viewH = coverH / scale;

                const panXDir = (idx % 3) - 1;
                const panYDir = ((idx + 1) % 3) - 1;

                const maxDX = Math.max(0, (img.width - viewW) / 2);
                const maxDY = Math.max(0, (img.height - viewH) / 2);
                
                const panX = panXDir * maxDX * localProgress * 0.8;
                const panY = panYDir * maxDY * localProgress * 0.8;

                const centerX = img.width / 2;
                const centerY = img.height / 2;

                const sx = (centerX + panX) - (viewW / 2);
                const sy = (centerY + panY) - (viewH / 2);

                ctx.drawImage(img, sx, sy, viewW, viewH, 0, 0, renderCanvas.width, renderCanvas.height);
              };

              ctx.fillStyle = '#000';
              ctx.fillRect(0,0, renderCanvas.width, renderCanvas.height);

              if (loadedImages[activeIdx]) drawLayer(loadedImages[activeIdx], activeIdx, 1.0, progress);
              if (isTransitioning && nextSlide && loadedImages[nextIdx]) {
                  const transitionProgress = 1 - (timeToNext / TRANSITION_DURATION);
                  const alpha = transitionProgress; 
                  drawLayer(loadedImages[nextIdx], nextIdx, alpha, 0); 
              }
              
              requestAnimationFrame(renderExportFrame);
          };
          renderExportFrame();

      } catch (err) {
          console.error("Export failed", err);
          setIsExporting(false);
          alert("Экспорт не удался.");
      }
  };

  const handleDownloadImages = async () => {
    if (loadedImages.length === 0) return;
    try {
        const zip = new JSZip();
        const folder = zip.folder("NanoReel_Frames");
        
        presentation.slides.forEach((slide, idx) => {
            if (slide.imageUrl) {
                // imageUrl is usually "data:image/png;base64,....."
                const parts = slide.imageUrl.split(',');
                if (parts.length > 1) {
                    folder?.file(`frame_${idx + 1}.png`, parts[1], {base64: true});
                }
            }
        });

        const content = await zip.generateAsync({type:"blob"});
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NanoReel_Frames_${presentation.topic.slice(0, 10).replace(/\s+/g, '_')}.zip`;
        a.click();
    } catch (e) {
        console.error("Failed to zip images", e);
        alert("Не удалось скачать кадры.");
    }
  };

  const handleDownloadScript = () => {
    if (!presentation.slides || presentation.slides.length === 0) return;

    // Join content with double newlines to split paragraphs distinctly
    const scriptContent = presentation.slides
      .map(slide => slide.content)
      .join('\n\n');

    const blob = new Blob([scriptContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NanoReel_Script_${presentation.topic.slice(0, 10).replace(/\s+/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full w-full max-w-[400px] mx-auto bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200">
      
      {/* 
         VERTICAL 9:16 CANVAS CONTAINER
         Kept dark for video contrast, but rounded corners match the light container
      */}
      <div className="relative aspect-[9/16] bg-black flex items-center justify-center group overflow-hidden">
        
        <canvas 
            ref={canvasRef}
            width={1080}
            height={1920}
            className="w-full h-full object-contain"
        />

        {loadedImages.length !== presentation.slides.length && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                 <Loader2 className="animate-spin text-white w-8 h-8" />
            </div>
        )}

        {isExporting && (
            <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center z-50">
                <Loader2 className="animate-spin text-violet-600 w-12 h-12 mb-4" />
                <p className="text-slate-900 font-bold text-lg">Рендеринг Reels...</p>
                <p className="text-slate-500 text-sm">Улучшаем звук и собираем кадры</p>
            </div>
        )}
      </div>

      <div className="bg-white p-5 flex flex-col gap-3">
         {/* Progress Bar */}
         <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden cursor-pointer group" 
              onClick={(e) => {
                  if(audioRef.current && duration) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pos = (e.clientX - rect.left) / rect.width;
                      audioRef.current.currentTime = pos * duration;
                  }
              }}>
             <div 
                 className="bg-violet-600 h-full transition-all duration-100 group-hover:bg-violet-500" 
                 style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
             />
         </div>

         {/* Controls */}
         <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-3">
                <button onClick={() => skipSlide('prev')} className="text-slate-400 hover:text-slate-800 transition"><SkipBack size={24} /></button>
                <button onClick={togglePlay} className="w-12 h-12 bg-slate-900 hover:bg-slate-800 rounded-full flex items-center justify-center text-white shadow-xl transform active:scale-95 transition-all">
                    {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                </button>
                <button onClick={() => skipSlide('next')} className="text-slate-400 hover:text-slate-800 transition"><SkipForward size={24} /></button>
            </div>

            <div className="flex items-center gap-2">
                 {/* Speed Toggle */}
                 <button 
                    onClick={toggleSpeed} 
                    className="px-3 py-1.5 rounded-lg text-slate-500 hover:text-violet-700 bg-slate-50 hover:bg-violet-50 text-xs font-bold transition border border-slate-200"
                    title="Скорость"
                 >
                    {playbackRate}x
                 </button>

                 {/* Music Toggle */}
                {presentation.bgMusicUrl && (
                     <button 
                        onClick={() => setIsMusicMuted(!isMusicMuted)} 
                        className={`p-2 rounded-full transition ${isMusicMuted ? 'text-slate-400 hover:text-slate-600' : 'text-violet-600 bg-violet-50'}`}
                        title={isMusicMuted ? "Включить музыку" : "Выключить музыку"}
                     >
                        <Music size={18} />
                     </button>
                )}

                <button 
                    onClick={handleDownloadScript}
                    className="p-2 rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 transition shadow-sm border border-slate-200"
                    title="Скачать сценарий (TXT)"
                >
                    <FileText size={18} />
                </button>

                <button 
                    onClick={handleDownloadImages}
                    disabled={loadedImages.length === 0}
                    className="p-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition shadow-sm border border-indigo-100"
                    title="Скачать все кадры (ZIP)"
                >
                    <ImageIcon size={18} />
                </button>

                <button 
                    onClick={handleDownloadVideo}
                    disabled={isExporting || loadedImages.length === 0}
                    className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-md disabled:opacity-50"
                >
                    <Download size={14} />
                    Save
                </button>
                <button onClick={onReset} className="text-slate-400 hover:text-red-500 p-2 transition"><RefreshCw size={18} /></button>
            </div>
         </div>
         <span className="text-slate-400 text-xs text-center font-mono font-medium">
             {new Date(currentTime * 1000).toISOString().substr(14, 5)} / {new Date((duration || 0) * 1000).toISOString().substr(14, 5)}
         </span>
      </div>

      <audio 
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleMetadataLoaded}
        onEnded={() => {
            setIsPlaying(false);
            if(bgAudioRef.current) bgAudioRef.current.pause();
        }}
      />
      {/* Hidden Audio Element for Background Music Playback (Preview) */}
      <audio 
        ref={bgAudioRef}
        crossOrigin="anonymous" 
      />
    </div>
  );
};