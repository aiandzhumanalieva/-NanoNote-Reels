import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Upload, Mic, FileAudio, PlayCircle, Loader2, Volume2, CheckCircle2, Edit2, Play, Pause, KeyRound, Palette, Zap, History, FileText, Music, LayoutTemplate, Plus, Star, X, Dices, Gamepad2, Scissors, Cloud, Skull, FileJson } from 'lucide-react';
import { Presentation, Slide, VoiceName, GenerationStatus, VisualStyle } from './types';
import * as gemini from './services/geminiService';
import { Player } from './components/Player';

// Declare the aistudio interface on the window object
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

const App: React.FC = () => {
  // Auth State
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [isCheckingKey, setIsCheckingKey] = useState<boolean>(true);

  const [mode, setMode] = useState<'topic' | 'audio' | 'biography' | 'script'>('biography');
  const [topic, setTopic] = useState('');
  const [customScript, setCustomScript] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>(VoiceName.Fenrir); 
  const [selectedStyle, setSelectedStyle] = useState<VisualStyle>(VisualStyle.VintageCollage); 
  
  // Music State
  const [selectedMusic, setSelectedMusic] = useState<string>('none'); 
  const [customBgMusic, setCustomBgMusic] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  
  // State for voice/music preview
  const [previewingVoice, setPreviewingVoice] = useState<VoiceName | null>(null);
  const [previewingMusic, setPreviewingMusic] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewMusicRef = useRef<HTMLAudioElement | null>(null);

  // Topic Generator State
  const [isGeneratingTopic, setIsGeneratingTopic] = useState(false);

  // State for workflow
  const [status, setStatus] = useState<GenerationStatus>({ step: 'idle', message: '', progress: 0 });
  const [rawSlides, setRawSlides] = useState<Slide[]>([]);
  const [presentation, setPresentation] = useState<Presentation | null>(null);

  useEffect(() => {
    const checkKey = async () => {
      try {
        if (window.aistudio && window.aistudio.hasSelectedApiKey) {
          const hasKey = await window.aistudio.hasSelectedApiKey();
          setHasApiKey(hasKey);
        } else {
          setHasApiKey(true);
        }
      } catch (e) {
        console.error("Error checking API key status:", e);
        setHasApiKey(false);
      } finally {
        setIsCheckingKey(false);
      }
    };
    checkKey();
  }, []);

  useEffect(() => {
    if (mode === 'biography') {
        setSelectedStyle(VisualStyle.VintageCollage);
        setSelectedVoice(VoiceName.Fenrir);
    } else if (mode === 'topic') {
        setSelectedStyle(VisualStyle.DarkNoir);
        setSelectedVoice(VoiceName.Puck);
    } else if (mode === 'script') {
        setSelectedStyle(VisualStyle.CinematicRealism);
        setSelectedVoice(VoiceName.Charon);
    } 
  }, [mode]);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      try {
        await window.aistudio.openSelectKey();
        setHasApiKey(true);
      } catch (e) {
        console.error("Failed to select key:", e);
      }
    }
  };

  const handlePreviewVoice = async (e: React.MouseEvent, voice: VoiceName) => {
    e.stopPropagation(); 
    if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
    }
    if (previewingVoice === voice) {
        setPreviewingVoice(null);
        return;
    }
    setPreviewingVoice(voice);
    try {
        const audioUrl = await gemini.generateVoicePreview(voice);
        const audio = new Audio();
        audio.src = audioUrl;
        previewAudioRef.current = audio;
        audio.onended = () => setPreviewingVoice(null);
        await audio.play();
    } catch (err) {
        console.error("Failed to preview voice", err);
        setPreviewingVoice(null);
        alert("Не удалось загрузить голос.");
    }
  };

  const handlePreviewMusic = (e: React.MouseEvent, url: string, id: string) => {
      e.stopPropagation();
      
      if (previewMusicRef.current) {
          try {
            previewMusicRef.current.pause();
            previewMusicRef.current.currentTime = 0;
          } catch(err) {}
          previewMusicRef.current = null;
      }

      if (previewingMusic === id) {
          setPreviewingMusic(null);
          return;
      }
      
      if (!url) return;

      setPreviewingMusic(id);
      
      const audio = new Audio();
      audio.volume = 0.5;
      if (url.startsWith('http')) {
         audio.crossOrigin = "anonymous";
      }
      audio.src = url;
      
      audio.onerror = (e) => {
          console.warn("Audio playback error:", e);
          if (previewingMusic === id) {
             setPreviewingMusic(null);
             alert("Ошибка воспроизведения. Проверьте путь к файлу.");
          }
      };

      audio.onended = () => {
          if (previewingMusic === id) {
              setPreviewingMusic(null);
          }
      };

      previewMusicRef.current = audio;
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
          playPromise.catch(error => {
              if (error.name === 'AbortError') return; 
              console.error("Music play error:", error);
              if (previewingMusic === id) setPreviewingMusic(null);
          });
      }
  };

  const handleCustomMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          setCustomBgMusic(file);
          setSelectedMusic('custom_upload');
          if (previewMusicRef.current) {
              previewMusicRef.current.pause();
              setPreviewingMusic(null);
          }
      }
  };

  const handlePreviewCustomMusic = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!customBgMusic) return;
      const url = URL.createObjectURL(customBgMusic);
      handlePreviewMusic(e, url, 'custom_upload');
  };

  const handleClearCustomMusic = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setCustomBgMusic(null);
      setSelectedMusic('none');
      if (previewMusicRef.current) {
          previewMusicRef.current.pause();
          setPreviewingMusic(null);
      }
  };

  const handleRandomTopic = async () => {
    if (mode !== 'biography' && mode !== 'topic') return;
    setIsGeneratingTopic(true);
    try {
        const newTopic = await gemini.generateRandomTopic(mode);
        setTopic(newTopic);
    } catch (e) {
        console.error("Failed to generate random topic", e);
    } finally {
        setIsGeneratingTopic(false);
    }
  };

  const handleGenerateScript = async () => {
    if (!topic) return;
    
    let msg = 'Пишем сценарий...';
    if (mode === 'biography') msg = 'Собираем факты...';

    setStatus({ step: 'scripting', message: msg, progress: 20 });

    try {
      const isBio = mode === 'biography';
      const slides = await gemini.generateScriptFromTopic(topic, selectedStyle, isBio);
      setRawSlides(slides);
      setStatus({ step: 'script_review', message: '', progress: 40 });
    } catch (error: any) {
      console.error(error);
      let errMsg = 'Не удалось создать сценарий.';
      if (error.message?.includes('403')) {
        errMsg = 'Ошибка доступа (403).';
        setHasApiKey(false);
      }
      setStatus({ step: 'error', message: errMsg, progress: 0 });
    }
  };

  const handleCreateFromScript = async () => {
      if (!customScript) return;
      setStatus({ step: 'scripting', message: 'Разбиваем сценарий...', progress: 20 });
      try {
          const slides = await gemini.generateSlidesFromCustomScript(customScript, selectedStyle);
          setRawSlides(slides);
          setStatus({ step: 'script_review', message: '', progress: 40 });
      } catch (error: any) {
          console.error(error);
          setStatus({ step: 'error', message: 'Ошибка обработки сценария.', progress: 0 });
      }
  };

  const updateSlideContent = (index: number, field: 'title' | 'content', value: string) => {
    const newSlides = [...rawSlides];
    newSlides[index] = { ...newSlides[index], [field]: value };
    setRawSlides(newSlides);
  };

  const calculateDurationWeight = (text: string): number => {
    let score = 30; 
    score += text.length;
    score += (text.match(/[,;]/g) || []).length * 8; 
    score += (text.match(/[.!?]/g) || []).length * 25;
    return score;
  };

  const getFinalMusicUrl = (): string | undefined => {
      if (selectedMusic === 'custom_upload' && customBgMusic) {
          return URL.createObjectURL(customBgMusic);
      }
      return undefined;
  };

  const handleProceedToProduction = async () => {
    setStatus({ step: 'visualizing', message: 'Генерируем кадры (пакетная обработка)...', progress: 45 });

    try {
      const processedSlides: Slide[] = new Array(rawSlides.length);
      const totalOps = rawSlides.length + 1; 
      let completedOps = 0;
      
      const BATCH_SIZE = 5; // Increased to 5
      const chunks = [];
      for (let i = 0; i < rawSlides.length; i += BATCH_SIZE) {
        chunks.push(rawSlides.slice(i, i + BATCH_SIZE));
      }

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const promises = chunk.map(async (slide) => {
            try {
                const img = await gemini.generateSlideImage(slide.visualPrompt, selectedStyle, slide.content);
                return { index: slide.id, img };
            } catch (e) {
                console.error(`Failed to gen image for slide ${slide.id}`, e);
                return { index: slide.id, img: null };
            }
        });

        const results = await Promise.all(promises);
        
        results.forEach(res => {
            const slide = rawSlides[res.index];
            const weight = calculateDurationWeight(slide.content);
            processedSlides[res.index] = {
                ...slide,
                imageUrl: res.img || undefined,
                weight: weight
            };
            completedOps++;
        });

         setStatus(prev => ({ 
             ...prev, 
             progress: 45 + (completedOps / totalOps) * 40,
             message: `Рендер: ${completedOps} / ${rawSlides.length} (Батч ${i+1}/${chunks.length})`
         }));
      }

      const totalWeight = processedSlides.reduce((acc, s) => acc + (s.weight || 1), 0);
      processedSlides.forEach(s => {
          s.durationRatio = (s.weight || 1) / totalWeight;
      });

      setStatus(prev => ({ ...prev, message: 'Сведение озвучки...' }));
      const fullAudio = await gemini.generateFullPresentationSpeech(rawSlides, selectedVoice);
      
      const bgMusicUrl = getFinalMusicUrl();

      setPresentation({
        topic: mode === 'script' ? customScript.slice(0, 30) + '...' : topic,
        slides: processedSlides,
        mode: mode,
        style: selectedStyle,
        fullAudioUrl: fullAudio,
        bgMusicUrl: bgMusicUrl
      });
      setStatus({ step: 'complete', message: 'Готово!', progress: 100 });

    } catch (error) {
       console.error(error);
       setStatus({ step: 'error', message: 'Ошибка при генерации.', progress: 0 });
    }
  };

  const handleCreateFromAudio = async () => {
    if (!audioFile) return;
    setStatus({ step: 'analyzing', message: 'Анализируем аудио...', progress: 10 });

    try {
        const slides = await gemini.analyzeAudioForSlides(audioFile, selectedStyle);
        setStatus({ step: 'visualizing', message: 'Создаем визуальный ряд...', progress: 40 });

        const processedSlides: Slide[] = new Array(slides.length);
        let completedOps = 0;
        
        const BATCH_SIZE = 5; // Increased to 5
        const chunks = [];
        for (let i = 0; i < slides.length; i += BATCH_SIZE) {
            chunks.push(slides.slice(i, i + BATCH_SIZE));
        }

        for (let i = 0; i < chunks.length; i++) {
             const chunk = chunks[i];
             const promises = chunk.map(async (slide) => {
                try {
                    const img = await gemini.generateSlideImage(slide.visualPrompt, selectedStyle, slide.content);
                    return { index: slide.id, img };
                } catch (e) {
                    console.error("Failed to gen image", e);
                    return { index: slide.id, img: undefined };
                }
             });

             const results = await Promise.all(promises);
             results.forEach(res => {
                 processedSlides[res.index] = { ...slides[res.index], imageUrl: res.img };
                 completedOps++;
             });

             setStatus(prev => ({ 
                ...prev, 
                progress: 40 + (completedOps / slides.length) * 60,
                message: `Кадр ${completedOps} из ${slides.length}`
             }));
        }

        const audioUrl = URL.createObjectURL(audioFile);
        const bgMusicUrl = getFinalMusicUrl();

        setPresentation({
            topic: audioFile.name,
            slides: processedSlides,
            mode: 'audio_upload',
            style: selectedStyle,
            originalAudioUrl: audioUrl,
            bgMusicUrl: bgMusicUrl
        });
        setStatus({ step: 'complete', message: 'Готово!', progress: 100 });

    } catch (error) {
        console.error(error);
        setStatus({ step: 'error', message: 'Ошибка обработки.', progress: 0 });
    }
  };

  const handleDownloadPrompts = () => {
    if (!rawSlides || rawSlides.length === 0) return;

    let output = "";

    rawSlides.forEach((slide) => {
        // Construct the full prompt that IS sent to the AI
        let fullImagePrompt = gemini.constructImagePrompt(slide.visualPrompt, selectedStyle, slide.content);

        // CLEAN UP MARKDOWN for "Just a list of prompts"
        fullImagePrompt = fullImagePrompt.replace(/\*\*/g, ""); // Remove bolding
        
        output += fullImagePrompt.trim();
        output += "\n\n--------------------------------------------------\n\n";
    });

    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Prompts_${(topic || 'script').slice(0, 15).replace(/\s+/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setPresentation(null);
    setRawSlides([]);
    setStatus({ step: 'idle', message: '', progress: 0 });
    setTopic('');
    setCustomScript('');
    setAudioFile(null);
  };

  const styleOptions = [
      { id: VisualStyle.GhibliAnime, label: 'Ghibli Style', desc: 'Студия Ghibli, сочные цвета.', icon: <Cloud size={16}/> },
      { id: VisualStyle.DarkFantasy, label: 'Dark Fantasy', desc: 'Масло, мрачно, Souls-like.', icon: <Skull size={16}/> },
      { id: VisualStyle.VintageCollage, label: 'Vintage Collage', desc: 'Гранж, старые фото, архив.', icon: <History size={16}/> },
      { id: VisualStyle.DarkNoir, label: 'Dark Noir', desc: 'Комикс, неон, тени.', icon: <Zap size={16}/> },
      { id: VisualStyle.RedBlueAnime, label: 'Red/Blue Anime', desc: 'MAPPA стиль, экшн.', icon: <Palette size={16}/> },
      { id: VisualStyle.CinematicRealism, label: 'Realism', desc: 'Киношный реализм, 4k.', icon: <LayoutTemplate size={16}/> },
      { id: VisualStyle.PixelArtRetro, label: 'Pixel Art', desc: '16-бит, ретро игры.', icon: <Gamepad2 size={16}/> },
      { id: VisualStyle.PaperCutout, label: 'Paper Craft', desc: 'Бумажная диорама.', icon: <Scissors size={16}/> },
  ];

  // All styles available for everyone now
  const currentStyles = styleOptions;

  if (isCheckingKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-violet-600 w-8 h-8" />
      </div>
    );
  }

  if (!hasApiKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
         <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-100 p-10 text-center animate-fade-in">
             <div className="w-20 h-20 bg-gradient-to-tr from-violet-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white font-bold text-4xl shadow-lg shadow-violet-200 mx-auto mb-6 transform -rotate-3">R</div>
             <h1 className="text-4xl font-bold text-slate-900 mb-3 font-['Neucha']">NanoNote Reels</h1>
             <p className="text-slate-500 mb-8 leading-relaxed">
               Создавайте виральные вертикальные видео с помощью ИИ за секунды.
             </p>
             <button onClick={handleSelectKey} className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg group">
                <KeyRound size={20} className="group-hover:rotate-12 transition-transform" />
                Вход (API Key)
             </button>
         </div>
      </div>
    )
  }

  // --- RENDER HELPERS ---
  const renderMusicSelector = () => (
    <div className="space-y-3">
        <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Music size={12} /> Фоновая Музыка
            </span>
            {selectedMusic !== 'none' && (
                <button onClick={() => setSelectedMusic('none')} className="text-xs text-red-400 hover:text-red-500 font-medium">
                    Убрать
                </button>
            )}
        </div>
        
        <div className="grid grid-cols-1 gap-2">
            {/* Custom Upload Option */}
            <div 
                className={`relative border rounded-xl p-3 cursor-pointer transition-all ${selectedMusic === 'custom_upload' ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500' : 'border-slate-200 hover:border-violet-300 hover:bg-slate-50'}`}
                onClick={() => document.getElementById('music-upload')?.click()}
            >
                <input 
                    type="file" 
                    id="music-upload" 
                    accept="audio/*" 
                    className="hidden" 
                    onChange={handleCustomMusicUpload}
                />
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${selectedMusic === 'custom_upload' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            <Upload size={14} />
                        </div>
                        <div className="flex flex-col">
                           <span className={`text-sm font-bold ${selectedMusic === 'custom_upload' ? 'text-violet-900' : 'text-slate-700'}`}>
                               {customBgMusic ? customBgMusic.name.slice(0, 20) + '...' : 'Загрузить свою'}
                           </span>
                           <span className="text-xs text-slate-400">MP3, WAV</span>
                        </div>
                    </div>
                    {customBgMusic && (
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={handlePreviewCustomMusic}
                                className="p-2 text-violet-600 hover:bg-violet-100 rounded-full"
                            >
                                {previewingMusic === 'custom_upload' ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>}
                            </button>
                            <button onClick={handleClearCustomMusic} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full">
                                <X size={14} />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-violet-200 selection:text-violet-900">
      <main className="container mx-auto max-w-5xl p-4 md:p-8">
        
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-tr from-violet-600 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-violet-200">R</div>
                <div>
                   <h1 className="text-xl font-bold text-slate-900 font-['Neucha']">NanoNote Reels</h1>
                   <p className="text-xs text-slate-400 font-medium">AI Video Generator</p>
                </div>
            </div>
            
            {status.step === 'complete' && (
                <button 
                    onClick={reset}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full text-slate-600 text-sm font-bold hover:bg-slate-50 transition shadow-sm"
                >
                    <Plus size={16} />
                    Новый проект
                </button>
            )}
        </header>

        {presentation ? (
            // --- PLAYER VIEW ---
            <div className="animate-fade-in-up">
                 <Player presentation={presentation} onReset={reset} />
            </div>
        ) : (
            // --- GENERATION FORM ---
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* LEFT: Controls */}
                <div className="lg:col-span-7 space-y-6">
                    
                    {/* Mode Selector */}
                    <div className="bg-white p-1 rounded-2xl border border-slate-200 shadow-sm flex overflow-hidden">
                        {[
                            { id: 'biography', label: 'Факты / Био', icon: <Star size={16} /> },
                            { id: 'topic', label: 'Dark Stories', icon: <Sparkles size={16} /> },
                            { id: 'script', label: 'Свой текст', icon: <FileText size={16} /> },
                            { id: 'audio', label: 'Из Аудио', icon: <Mic size={16} /> },
                        ].map((m) => (
                            <button
                                key={m.id}
                                onClick={() => {
                                    setMode(m.id as any);
                                    setRawSlides([]);
                                    setStatus({ step: 'idle', message: '', progress: 0 });
                                }}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-xl transition-all ${
                                    mode === m.id 
                                    ? 'bg-slate-900 text-white shadow-md' 
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                            >
                                {m.icon}
                                <span className="hidden sm:inline">{m.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* INPUT CARD */}
                    <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100 relative overflow-hidden group">
                         <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-500"></div>
                         
                         {status.step !== 'idle' && status.step !== 'script_review' && status.step !== 'error' && (
                             <div className="absolute inset-0 bg-white/90 z-20 flex flex-col items-center justify-center backdrop-blur-sm">
                                  <Loader2 className="w-12 h-12 text-violet-600 animate-spin mb-4" />
                                  <p className="text-lg font-bold text-slate-800">{status.message}</p>
                                  <div className="w-48 h-1.5 bg-slate-100 rounded-full mt-4 overflow-hidden">
                                      <div className="h-full bg-violet-600 transition-all duration-500" style={{ width: `${status.progress}%` }}></div>
                                  </div>
                             </div>
                         )}

                         {/* Mode: TOPIC / BIO */}
                         {(mode === 'topic' || mode === 'biography') && (
                             <div className="space-y-4">
                                 <label className="block text-sm font-bold text-slate-700">
                                     {mode === 'biography' ? 'О ком или о чем расскажем?' : 'Тема истории'}
                                 </label>
                                 <div className="relative">
                                     <input 
                                         type="text" 
                                         value={topic}
                                         onChange={(e) => setTopic(e.target.value)}
                                         placeholder={mode === 'biography' ? "Наполеон, Биткоин, История кофе..." : "Тайна перевала Дятлова, Исчезновение..."}
                                         className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-lg font-medium focus:ring-2 focus:ring-violet-500 focus:outline-none transition-all placeholder:text-slate-300"
                                     />
                                     <button 
                                        onClick={handleRandomTopic}
                                        disabled={isGeneratingTopic}
                                        className="absolute right-2 top-2 p-2 text-violet-600 hover:bg-violet-100 rounded-lg transition"
                                        title="Случайная тема"
                                     >
                                         {isGeneratingTopic ? <Loader2 className="animate-spin" size={20}/> : <Dices size={20}/>}
                                     </button>
                                 </div>
                                 <button 
                                    onClick={handleGenerateScript}
                                    disabled={!topic.trim()}
                                    className="w-full py-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-violet-200 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                                 >
                                     <Sparkles size={20} className="animate-pulse" />
                                     Создать сценарий
                                 </button>
                             </div>
                         )}

                         {/* Mode: SCRIPT */}
                         {mode === 'script' && (
                             <div className="space-y-4">
                                 <label className="block text-sm font-bold text-slate-700">Ваш текст (мы разобьем его на кадры)</label>
                                 <textarea 
                                     value={customScript}
                                     onChange={(e) => setCustomScript(e.target.value)}
                                     placeholder="Вставьте готовый текст для озвучки..."
                                     className="w-full h-40 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium focus:ring-2 focus:ring-violet-500 focus:outline-none transition-all placeholder:text-slate-300 resize-none"
                                 />
                                 <button 
                                    onClick={handleCreateFromScript}
                                    disabled={!customScript.trim()}
                                    className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                                 >
                                     <Scissors size={20} />
                                     Разбить на сцены
                                 </button>
                             </div>
                         )}

                         {/* Mode: AUDIO */}
                         {mode === 'audio' && (
                             <div className="space-y-6 text-center py-6">
                                 <div 
                                    onClick={() => document.getElementById('audio-upload')?.click()}
                                    className={`border-3 border-dashed rounded-2xl p-8 transition-all cursor-pointer group ${audioFile ? 'border-violet-500 bg-violet-50' : 'border-slate-200 hover:border-violet-400 hover:bg-slate-50'}`}
                                 >
                                     <input 
                                         type="file" 
                                         id="audio-upload" 
                                         accept="audio/*" 
                                         className="hidden" 
                                         onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                                     />
                                     <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm group-hover:scale-110 transition-transform text-violet-600">
                                         {audioFile ? <FileAudio size={32} /> : <Upload size={32} />}
                                     </div>
                                     <h3 className="text-lg font-bold text-slate-900 mb-1">
                                         {audioFile ? audioFile.name : 'Загрузить аудиофайл'}
                                     </h3>
                                     <p className="text-sm text-slate-400">
                                         {audioFile ? `${(audioFile.size / 1024 / 1024).toFixed(2)} MB` : 'MP3, WAV, M4A (до 10 мин)'}
                                     </p>
                                 </div>
                                 <button 
                                    onClick={handleCreateFromAudio}
                                    disabled={!audioFile}
                                    className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-slate-800 transition-all disabled:opacity-50"
                                 >
                                     Генерировать видео
                                 </button>
                             </div>
                         )}

                    </div>

                    {/* SCRIPT EDITOR (Only visible after script generation) */}
                    {status.step === 'script_review' && (
                         <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100 animate-fade-in-up">
                             <div className="flex items-center justify-between mb-4">
                                 <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                     <Edit2 size={18} /> Редактор Сценария
                                 </h2>
                                 <span className="text-xs font-bold px-2 py-1 bg-violet-100 text-violet-700 rounded-md">
                                     {rawSlides.length} сцен
                                 </span>
                             </div>
                             
                             <div className="max-h-[400px] overflow-y-auto pr-2 space-y-4 no-scrollbar">
                                 {rawSlides.map((slide, idx) => (
                                     <div key={slide.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100 hover:border-violet-200 transition-colors group">
                                         <div className="flex items-start gap-3">
                                             <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 mt-1 shrink-0">
                                                 {idx + 1}
                                             </div>
                                             <div className="flex-1 space-y-2">
                                                 <input 
                                                     value={slide.title}
                                                     onChange={(e) => updateSlideContent(idx, 'title', e.target.value)}
                                                     className="w-full bg-transparent text-sm font-bold text-slate-700 focus:outline-none focus:text-violet-700"
                                                     placeholder="Заголовок сцены"
                                                 />
                                                 <textarea 
                                                     value={slide.content}
                                                     onChange={(e) => updateSlideContent(idx, 'content', e.target.value)}
                                                     className="w-full bg-white p-2 rounded-lg text-sm text-slate-600 border border-slate-200 focus:ring-1 focus:ring-violet-500 focus:outline-none resize-none"
                                                     rows={2}
                                                 />
                                                 <p className="text-[10px] text-slate-400 italic">
                                                     Визуал: {slide.visualPrompt.slice(0, 50)}...
                                                 </p>
                                             </div>
                                         </div>
                                     </div>
                                 ))}
                             </div>

                             <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-2 gap-3">
                                 <button 
                                     onClick={handleDownloadPrompts}
                                     className="py-4 bg-white border-2 border-slate-200 text-slate-600 rounded-xl font-bold text-md hover:bg-slate-50 hover:border-violet-200 hover:text-violet-600 transition-all flex items-center justify-center gap-2 group"
                                 >
                                     <FileJson size={20} />
                                     Скачать Промпты
                                 </button>
                                 <button 
                                     onClick={handleProceedToProduction}
                                     className="py-4 bg-slate-900 text-white rounded-xl font-bold text-md shadow-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2 group"
                                 >
                                     <PlayCircle size={20} className="group-hover:scale-110 transition-transform"/>
                                     Запустить Продакшн
                                 </button>
                             </div>
                         </div>
                    )}
                </div>

                {/* RIGHT: Settings */}
                <div className="lg:col-span-5 space-y-6">
                    
                    {/* Visual Style Selector */}
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Palette size={14} /> Визуальный Стиль
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            {currentStyles.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => setSelectedStyle(s.id)}
                                    className={`relative p-3 rounded-xl border text-left transition-all hover:scale-[1.02] ${selectedStyle === s.id ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500' : 'border-slate-200 hover:border-violet-200'}`}
                                >
                                    <div className={`mb-2 w-8 h-8 rounded-lg flex items-center justify-center ${selectedStyle === s.id ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                        {s.icon}
                                    </div>
                                    <div className="text-sm font-bold text-slate-900">{s.label}</div>
                                    <div className="text-[10px] text-slate-500 leading-tight mt-1">{s.desc}</div>
                                    {selectedStyle === s.id && <div className="absolute top-2 right-2 text-violet-600"><CheckCircle2 size={16}/></div>}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Voice Selector */}
                    {(mode !== 'audio_upload' && mode !== 'audio') && (
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Mic size={14} /> Голос Озвучки
                            </h3>
                            <div className="space-y-2">
                                {Object.values(VoiceName).map((voice) => (
                                    <div 
                                        key={voice}
                                        onClick={() => setSelectedVoice(voice)}
                                        className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${selectedVoice === voice ? 'border-violet-500 bg-violet-50' : 'border-transparent hover:bg-slate-50'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${selectedVoice === voice ? 'bg-violet-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                                {voice[0]}
                                            </div>
                                            <span className="font-bold text-slate-700">{voice}</span>
                                        </div>
                                        <button 
                                            onClick={(e) => handlePreviewVoice(e, voice)}
                                            className="p-2 text-slate-400 hover:text-violet-600 hover:bg-white rounded-full transition-all"
                                        >
                                            {previewingVoice === voice ? <Volume2 size={16} className="animate-pulse text-violet-600" /> : <Play size={16} fill="currentColor" />}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Music Selector */}
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                         {renderMusicSelector()}
                    </div>

                </div>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;