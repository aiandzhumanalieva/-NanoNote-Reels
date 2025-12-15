import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Slide, VoiceName, VisualStyle } from "../types";

// Helper: Decode base64 to Uint8Array
function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper: Write string to DataView
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Helper: Wrap PCM data in WAV container
function pcmToWavBlob(pcmData: Uint8Array, sampleRate: number = 24000): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.byteLength;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF chunk
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true); // AudioFormat (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Copy PCM data
  const pcmBytes = new Uint8Array(buffer, 44);
  pcmBytes.set(pcmData);

  return new Blob([buffer], { type: 'audio/wav' });
}

// Helper to encode Audio for upload
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:audio/mp3;base64,")
      resolve(base64String.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Helper to clean JSON string from Markdown code blocks
function cleanJson(text: string): string {
  if (!text) return "[]";
  let cleaned = text.trim();
  // Remove ```json and ```
  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match) {
    cleaned = match[1];
  }
  return cleaned;
}

// 0. Voice Preview
export const generateVoicePreview = async (voice: VoiceName): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const text = "Привет! Я с удовольствием проведу этот урок для вас.";
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: { parts: [{ text }] },
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio generated");
  
  const pcmBytes = base64ToBytes(base64Audio);
  const wavBlob = pcmToWavBlob(pcmBytes);
  return URL.createObjectURL(wavBlob);
};

// 0.5 Generate Random Topic
export const generateRandomTopic = async (mode: 'biography' | 'topic'): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  let prompt = "";
  if (mode === 'biography') {
    prompt = "Ты — тренд-аналитик YouTube. Придумай ОДНУ уникальную, хайповую и неожиданную тему для короткого видео-биографии (Shorts/Reels). Избегай самых заезженных личностей (вроде Наполеона или Теслы, если они не в новом контексте). Найди 'скрытый бриллиант', скандальную фигуру или человека с безумной судьбой. Верни ТОЛЬКО тему (3-7 слов) на русском языке. Без кавычек.";
  } else {
    prompt = "Ты — главный редактор канала True Crime и мистики. Придумай ОДНУ уникальную, леденящую кровь и НЕ БАНАЛЬНУЮ тему для видео. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО предлагать 'Перевал Дятлова'. Избегай 'Титаника' и прочих клише. Найди редкий случай маньяка, странное исчезновение в нацпарке, жуткий исторический эксперимент или крипипасту, которая взорвет охваты. Верни ТОЛЬКО кликбейтный заголовок (3-7 слов) на русском языке. Без кавычек.";
  }

  const response = await ai.models.generateContent({
    model: 'gemini-flash-lite-latest',
    contents: prompt,
    config: {
        temperature: 1.2, // High creativity/randomness
        topP: 0.95,
        topK: 64,
    }
  });

  return response.text.trim();
};

// 1. Generate Script from Topic
export const generateScriptFromTopic = async (topic: string, style: VisualStyle, isBiographyMode: boolean = false): Promise<Slide[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Customizing prompts based on style to ensure the Script Writer requests the right visuals
  let visualGuidance = "";
  if (style === VisualStyle.RedBlueAnime) {
    visualGuidance = "Keywords for visualPrompt: 'Anime style', 'Red and Blue lighting', 'Menacing shadows', 'Extreme close-ups', 'Psychological horror aesthetic'. NO TEXT on image.";
  } else if (style === VisualStyle.DarkNoir) {
    visualGuidance = "Keywords for visualPrompt: 'Classic Noir', 'Purple and Green neon', 'Motion comic', 'Silhouettes', 'Detective vibe'. NO TEXT on image.";
  } else if (style === VisualStyle.VintageCollage) {
    visualGuidance = "Keywords for visualPrompt: 'Vintage Photo', 'Grunge Texture', 'Newspaper clipping aesthetic', 'Black and White photo with ONE bright color element', 'Historical Archive'. NO TEXT on image.";
  } else if (style === VisualStyle.PixelArtRetro) {
    visualGuidance = "Keywords for visualPrompt: '16-bit Pixel Art', 'Retro Game', 'SNES Style', 'Isometric or Side scroller', 'Dithered shading'. NO TEXT on image.";
  } else if (style === VisualStyle.PaperCutout) {
    visualGuidance = "Keywords for visualPrompt: 'Paper Cutout', 'Diorama', 'Layered Paper Craft', 'Depth of field', 'Soft Shadows', 'Handmade texture'. NO TEXT on image.";
  } else if (style === VisualStyle.GhibliAnime) {
    visualGuidance = "Keywords for visualPrompt: 'Studio Ghibli style', 'Hayao Miyazaki', 'Lush hand-painted background', 'Saturated Colors', 'Fluffy clouds', 'Detailed 2D animation'. NO TEXT on image.";
  } else if (style === VisualStyle.DarkFantasy) {
    visualGuidance = "Keywords for visualPrompt: 'Dark Fantasy Oil Painting', 'Zdzisław Beksiński style', 'Elden Ring concept art', 'Gloomy atmosphere', 'Ancient ruins', 'Monsters in the mist'. NO TEXT on image.";
  } else {
    visualGuidance = "Keywords for visualPrompt: 'Cinematic', 'Realistic lighting', '4k', 'Movie still'. NO TEXT on image.";
  }

  let systemPrompt = "";

  if (isBiographyMode) {
    // --- BIOGRAPHY / FAST FACTS MODE PROMPT ---
    systemPrompt = `
      You are an energetic, fast-talking YouTuber creating a "Fast Facts" biography video.
      Topic: "${topic}".

      TONE: Alive, ironic, surprising, fast-paced. Like you are gossiping about history.
      CRITICAL REQUIREMENT: In Russian text, you MUST use the letter "ё" (yo) where grammatically appropriate (e.g., "ещё", "тёмный", "слёзы"). Do not use "е" instead of "ё".
      
      PACING STRATEGY: 
      - **EXTREMELY FAST CUTS**. Change the visual/slide every 3-5 seconds.
      - **content MUST BE SHORT**. Max 10-15 words per slide.
      
      OUTPUT REQUIREMENTS:
      -   Generate **18-22 slides** (frames).
      -   **content**: Spoken script (Russian). Max 1-2 short sentences. Must strictly fit 3-5 seconds.
      -   **visualPrompt**: Description of the historical photo or collage. ${visualGuidance}. Do not include instructions to add text.
    `;
  } else {
    // --- STANDARD DARK STORYTELLING PROMPT ---
    systemPrompt = `
      You are a master creator of viral TikToks and Reels in the genre of "Dark History", "True Crime", or "Mystery".
      Topic: "${topic}".

      STYLE GUIDE:
      -   **Atmosphere:** Dark, Mysterious, High Tension.
      -   **Pacing:** **Extremely fast**. Change visuals every **3-5 seconds**.
      -   **Structure:** Hook -> Rising Tension -> Climax -> Loop CTA.
      CRITICAL REQUIREMENT: In Russian text, you MUST use the letter "ё" (yo) where grammatically appropriate (e.g., "ещё", "тёмный", "слёзы"). Do not use "е" instead of "ё".
      
      OUTPUT REQUIREMENTS:
      -   Generate **18-22 slides** (frames).
      -   **content**: Spoken narration (Russian). **MAXIMUM 15 words per slide**. Keep it punchy.
      -   **visualPrompt**: Detailed English description of the image. 
          CRITICAL: Describe the SUBJECT explicitly. Don't say "A scary scene". Say "A 1950s doctor holding a syringe with glowing green liquid, low angle shot".
          ${visualGuidance}
    `;
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: systemPrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING },
            visualPrompt: { type: Type.STRING },
          },
          required: ["title", "content", "visualPrompt"]
        }
      }
    }
  });

  const rawSlides = JSON.parse(cleanJson(response.text || "[]"));
  return rawSlides.map((s: any, i: number) => ({ ...s, id: i, timestamp: 0 }));
};

// 1.5 Generate Slides from CUSTOM SCRIPT
export const generateSlidesFromCustomScript = async (script: string, style: VisualStyle): Promise<Slide[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Reusing visual guidance
  let visualGuidance = "";
  if (style === VisualStyle.RedBlueAnime) {
    visualGuidance = "Keywords for visualPrompt: 'Anime style', 'Red and Blue lighting', 'Menacing shadows'. NO TEXT.";
  } else if (style === VisualStyle.DarkNoir) {
    visualGuidance = "Keywords for visualPrompt: 'Classic Noir', 'Purple and Green neon', 'Motion comic'. NO TEXT.";
  } else if (style === VisualStyle.VintageCollage) {
    visualGuidance = "Keywords for visualPrompt: 'Vintage Photo', 'Grunge Texture', 'Newspaper clipping aesthetic'. NO TEXT.";
  } else if (style === VisualStyle.PixelArtRetro) {
    visualGuidance = "Keywords for visualPrompt: '16-bit Pixel Art', 'Retro Game', 'SNES Style'. NO TEXT on image.";
  } else if (style === VisualStyle.PaperCutout) {
    visualGuidance = "Keywords for visualPrompt: 'Paper Cutout', 'Diorama', 'Layered Paper Craft'. NO TEXT on image.";
  } else if (style === VisualStyle.GhibliAnime) {
    visualGuidance = "Keywords for visualPrompt: 'Studio Ghibli', 'Hayao Miyazaki', 'Lush Scenery', 'Vibrant Colors'. NO TEXT on image.";
  } else if (style === VisualStyle.DarkFantasy) {
    visualGuidance = "Keywords for visualPrompt: 'Dark Fantasy Oil Painting', 'Zdzisław Beksiński', 'Dark Souls', 'Ancient'. NO TEXT on image.";
  } else {
    visualGuidance = "Keywords for visualPrompt: 'Cinematic', 'Realistic lighting', '4k'. NO TEXT.";
  }

  const prompt = `
    Act as a Video Director. I have a finished script below.
    Break this script down into scenes for a Vertical Short (9:16).
    
    INSTRUCTIONS:
    - Split the text into **tiny segments** (max 10-15 words per segment).
    - **Aggressively split** long sentences into multiple visuals.
    - Aim for exactly 3-5 seconds of speech per slide.
    - Generate a 'visualPrompt' for each segment based on the text.
    - Ensure NO TEXT is requested in the visuals.
    - CRITICAL: Restore the letter "ё" in the Russian text if it is missing (e.g. use "ещё" instead of "еще", "всё" instead of "все" where appropriate).

    SCRIPT:
    "${script}"
    
    STYLE: ${visualGuidance}

    OUTPUT JSON:
    Return an Array of objects with: title, content, visualPrompt.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING },
            visualPrompt: { type: Type.STRING },
          },
          required: ["title", "content", "visualPrompt"]
        }
      }
    }
  });

  const rawSlides = JSON.parse(cleanJson(response.text || "[]"));
  return rawSlides.map((s: any, i: number) => ({ ...s, id: i, timestamp: 0 }));
};

// 2. Analyze Uploaded Audio to generate Slides
export const analyzeAudioForSlides = async (audioBlob: Blob, style: VisualStyle): Promise<Slide[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const base64Audio = await blobToBase64(audioBlob);

  let styleDesc = 'Noir Motion Comic';
  if (style === VisualStyle.RedBlueAnime) styleDesc = 'Dark Anime with Red/Blue lighting';
  if (style === VisualStyle.VintageCollage) styleDesc = 'Vintage Historical Photo Collage with grunge textures';
  if (style === VisualStyle.PixelArtRetro) styleDesc = '16-bit Retro Pixel Art (SNES style)';
  if (style === VisualStyle.PaperCutout) styleDesc = 'Layered Paper Cutout Diorama craft style';
  if (style === VisualStyle.GhibliAnime) styleDesc = 'Studio Ghibli style, lush hand-painted backgrounds, saturated colors';
  if (style === VisualStyle.DarkFantasy) styleDesc = 'Dark Fantasy Oil Painting, Beksiński style, Ancient, Gloomy';

  const prompt = `
    Analyze this audio for a Viral Reel (9:16).
    
    PACING: **Hyper-Fast**. Generate a new visual prompt every **3-5 seconds** of audio.
    STYLE: ${styleDesc}.
    CRITICAL: In Russian output (content), ALWAYS use the letter "ё" where appropriate (e.g. "ещё", "тёмный").
    
    For each segment return:
    1. Timestamp.
    2. 'visualPrompt': Explicit description of the visual scene in English. Be concrete about characters and objects. NO TEXT on image.
    3. 'content': Short summary/transcript of this 3-5s segment.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview', // Multimodal capable
    contents: {
      parts: [
        { inlineData: { mimeType: audioBlob.type || 'audio/mp3', data: base64Audio } },
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            timestamp: { type: Type.NUMBER },
            title: { type: Type.STRING },
            visualPrompt: { type: Type.STRING },
            content: { type: Type.STRING }
          },
          required: ["timestamp", "title", "visualPrompt", "content"]
        }
      }
    }
  });

  const rawSlides = JSON.parse(cleanJson(response.text || "[]"));
  return rawSlides.map((s: any, i: number) => ({ ...s, id: i }));
};

// NEW FUNCTION: Construct the prompt string without generating image
export const constructImagePrompt = (visualPrompt: string, style: VisualStyle, contextContent: string): string => {
  // Style 1: The "Jujutsu Kaisen" / Dark Anime Look
  const redBlueAnimePrompt = `
    Generate a VERTICAL (9:16) high-quality anime-style illustration.
    CRITICAL: The image must be PORTRAIT orientation (Tall). Do not rotate the canvas.
    
    STORY CONTEXT: "${contextContent}"
    ACTION/SCENE: ${visualPrompt}

    AESTHETIC:
    -   **Style:** Modern Dark Shonen Anime (MAPPA, Jujutsu Kaisen).
    -   **Lighting:** EXTREME CONTRAST. Dominant CRIMSON RED and ELECTRIC BLUE lighting.
    -   **Atmosphere:** Intense, Action-packed.
    -   **Composition:** Vertical, Dynamic perspective (fish-eye, low angle).
    
    NEGATIVE PROMPT: sideways, rotated, landscape, horizontal, text, letters, words, subtitles, watermark, signature, 3d render, plastic, soft lighting, pastel colors, happy, blurry.
  `;

  // Style 2: The "Sin City" / Dark Noir Look
  const darkNoirPrompt = `
    Generate a VERTICAL (9:16) motion comic illustration.
    CRITICAL: The image must be PORTRAIT orientation (Tall). Do not rotate the canvas.
    
    STORY CONTEXT: "${contextContent}"
    ACTION/SCENE: ${visualPrompt}

    AESTHETIC:
    -   **Style:** Dark Noir Graphic Novel (Sin City, Batman: TAS).
    -   **Palette:** Deep Blacks, Midnight Blues, Toxic Greens.
    -   **Lighting:** Chiaroscuro, rim lighting, silhouettes.
    -   **Composition:** Vertical, Tall.
    
    NEGATIVE PROMPT: sideways, rotated, landscape, horizontal, text, letters, words, subtitles, watermark, signature, blurry, photorealistic, bright daylight, happy.
  `;

  // Style 3: Cinematic Realism
  const cinematicPrompt = `
    Generate a VERTICAL (9:16) photorealistic cinematic movie still.
    CRITICAL: The image must be PORTRAIT orientation (Tall). Do not rotate the canvas. Sky/Ceiling UP, Floor DOWN.
    
    STORY CONTEXT: "${contextContent}"
    ACTION/SCENE: ${visualPrompt}

    AESTHETIC:
    -   **Style:** High-budget thriller movie, HBO documentary.
    -   **Lighting:** Moody, volumetric fog, realistic textures, 8k.
    -   **Camera:** 35mm film grain, depth of field.
    -   **Composition:** Vertical shot.
    
    NEGATIVE PROMPT: sideways, rotated, landscape, horizontal, wide shot, text, letters, words, subtitles, watermark, signature, Cartoon, drawing, painting, illustration, anime.
  `;

  // Style 5: Vintage Collage
  const vintageCollagePrompt = `
    Generate a VERTICAL (9:16) mixed-media art collage.
    CRITICAL: The image must be PORTRAIT orientation (Tall). Do not rotate the canvas.
    
    STORY CONTEXT: "${contextContent}"
    ACTION/SCENE: ${visualPrompt}

    AESTHETIC:
    -   **Style:** Vintage Historical Collage, Grunge, DADA art style.
    -   **Elements:** Archival black and white photography, torn paper, rough paint.
    -   **Color:** Desaturated Sepia/Black&White with ONE bold accent (Red or Gold).
    -   **Vibe:** Historical, Documentary, Mysterious.
    -   **Composition:** Vertical poster.
    
    NEGATIVE PROMPT: sideways, rotated, landscape, horizontal, text, letters, words, subtitles, watermark, signature, cartoon, anime, bright neon colors, glossy, 3d render, modern clean look.
  `;

  // Style 7: Pixel Art
  const pixelArtPrompt = `
    Generate a VERTICAL (9:16) pixel art illustration.
    CRITICAL: The image must be PORTRAIT orientation (Tall). Do not rotate the canvas.
    
    STORY CONTEXT: "${contextContent}"
    ACTION/SCENE: ${visualPrompt}

    AESTHETIC:
    -   **Style:** 16-bit SNES video game, High Quality Pixel Art.
    -   **Technique:** Sharp pixels, Dithering shading, Isometric or Side-view.
    -   **Vibe:** Retro gaming, Nostalgic, Detailed.
    -   **Composition:** Vertical Mobile Screen aspect ratio.
    
    NEGATIVE PROMPT: sideways, rotated, landscape, horizontal, text, letters, words, subtitles, watermark, signature, blur, anti-aliasing, vector, smooth, 3d render, photo, realistic.
  `;

  // Style 8: Paper Cutout
  const paperCutoutPrompt = `
    Generate a VERTICAL (9:16) paper craft diorama illustration.
    CRITICAL: The image must be PORTRAIT orientation (Tall). Do not rotate the canvas.
    
    STORY CONTEXT: "${contextContent}"
    ACTION/SCENE: ${visualPrompt}

    AESTHETIC:
    -   **Style:** Layered Paper Cutout, Handmade Diorama.
    -   **Lighting:** Warm overhead lighting creating soft drop shadows between layers.
    -   **Texture:** Visible paper grain, cardboard edges.
    -   **Vibe:** Artsy, Crafty, Depth of field (tilt-shift).
    -   **Composition:** Vertical.
    
    NEGATIVE PROMPT: sideways, rotated, landscape, horizontal, text, letters, words, subtitles, watermark, signature, drawing, flat illustration, 3d render, plastic, glossy, neon, photo.
  `;

  // Style 9: Studio Ghibli (Adult Anime)
  const ghibliAnimePrompt = `
    Generate a PORTRAIT-ORIENTED (Vertical 9:16) anime illustration.
    CRITICAL: The image must be UPRIGHT. Sky/Ceiling at the TOP, Ground/Floor at the BOTTOM. DO NOT ROTATE the camera.

    STORY CONTEXT: "${contextContent}"
    ACTION/SCENE: ${visualPrompt}

    AESTHETIC:
    -   **Style:** Masterpiece by Studio Ghibli (Hayao Miyazaki style).
    -   **Technique:** Hand-painted backgrounds, traditional 2D animation feel.
    -   **Colors:** HIGHLY SATURATED, VIBRANT. Deep blues, lush greens, golden sunlight.
    -   **Vibe:** Emotional, Magical Realism, High-budget theatrical movie.
    -   **Details:** Fluffy clouds, swaying grass, detailed food/objects, expressive characters.
    -   **Composition:** Vertical framing, Tall image, Portrait mode.
    
    NEGATIVE PROMPT: sideways, rotated, horizontal, landscape mode, wide view turned sideways, text, letters, words, subtitles, watermark, signature, low quality, sketch, 3d render, cgi, plastic, glossy, dull colors, black and white, horror, gore.
  `;

  // Style 10: Dark Fantasy (Souls-like)
  const darkFantasyPrompt = `
    Generate a VERTICAL (9:16) Dark Fantasy Oil Painting.
    CRITICAL: The image must be PORTRAIT orientation (Tall). Do not rotate the canvas.

    STORY CONTEXT: "${contextContent}"
    ACTION/SCENE: ${visualPrompt}

    AESTHETIC:
    -   **Style:** Masterpiece Oil Painting, Zdzisław Beksiński, Frank Frazetta, Dark Souls Concept Art.
    -   **Technique:** Impasto, Heavy brushstrokes, Textured canvas, Surrealism.
    -   **Atmosphere:** Gloomy, Ancient, Nightmarish, Volumetric Fog, Torchlight.
    -   **Colors:** Muted earth tones, rust, blood red, deep shadow blacks.
    -   **Composition:** Vertical, Majestic, Ominous.

    NEGATIVE PROMPT: sideways, rotated, landscape, horizontal, anime, cartoon, sketch, vector, flat, bright, happy, clean, digital art, plastic, 3d render.
  `;

  let finalPrompt = darkNoirPrompt;
  if (style === VisualStyle.RedBlueAnime) finalPrompt = redBlueAnimePrompt;
  if (style === VisualStyle.CinematicRealism) finalPrompt = cinematicPrompt;
  if (style === VisualStyle.VintageCollage) finalPrompt = vintageCollagePrompt;
  if (style === VisualStyle.PixelArtRetro) finalPrompt = pixelArtPrompt;
  if (style === VisualStyle.PaperCutout) finalPrompt = paperCutoutPrompt;
  if (style === VisualStyle.GhibliAnime) finalPrompt = ghibliAnimePrompt;
  if (style === VisualStyle.DarkFantasy) finalPrompt = darkFantasyPrompt;

  return finalPrompt;
};

// 3. Generate Image for a Slide
export const generateSlideImage = async (visualPrompt: string, style: VisualStyle, contextContent: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const finalPrompt = constructImagePrompt(visualPrompt, style, contextContent);

  // STRATEGY 1: Try High-Quality Pro Model (With Retries)
  const maxRetries = 2;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview', 
        contents: { parts: [{ text: finalPrompt }] },
        config: {
          imageConfig: {
            aspectRatio: "9:16",
            imageSize: "1K" 
          }
        }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries - 1;
      console.warn(`Primary image model failed (Pro) - Attempt ${attempt + 1}/${maxRetries}. Error:`, error);
      
      // If we still have retries, wait a bit
      if (!isLastAttempt) {
         await new Promise(resolve => setTimeout(resolve, 1500));
         continue; 
      }
      // If last attempt failed, we just proceed to Strategy 2 (Fallback)
    }
  }

  // STRATEGY 2: Fallback to Faster Flash Model
  // Note: Flash model does not support 'imageSize' param.
  try {
    console.log("Falling back to Flash image model...");
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image', 
      contents: { parts: [{ text: finalPrompt }] },
      config: {
        imageConfig: {
          aspectRatio: "9:16"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (error) {
    console.error("Secondary image model failed (Flash):", error);
    throw error; // Throw original error if both fail
  }
  
  throw new Error("No image generated");
};

// 4. Generate FULL Speech (Continuous)
export const generateFullPresentationSpeech = async (slides: Slide[], voice: VoiceName): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Combine all text into one script with pauses
  const fullScript = slides.map(s => s.content).join("\n\n");

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: { parts: [{ text: fullScript }] },
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio generated");
  
  const pcmBytes = base64ToBytes(base64Audio);
  const wavBlob = pcmToWavBlob(pcmBytes);
  return URL.createObjectURL(wavBlob);
};