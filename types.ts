export interface Slide {
  id: number;
  title: string;
  content: string; // The spoken script
  visualPrompt: string;
  imageUrl?: string; // Populated after image generation
  timestamp: number; // calculated start time
  durationRatio?: number; // Estimated portion of total audio
  weight?: number; // For duration calculation
}

export enum VisualStyle {
  DarkNoir = 'dark_noir',
  RedBlueAnime = 'red_blue_anime',
  CinematicRealism = 'cinematic_realism',
  VintageCollage = 'vintage_collage',
  PixelArtRetro = 'pixel_art_retro',
  PaperCutout = 'paper_cutout',
  GhibliAnime = 'ghibli_anime',
  DarkFantasy = 'dark_fantasy'
}

export interface Presentation {
  topic: string;
  slides: Slide[];
  mode: 'topic' | 'audio_upload' | 'biography' | 'script';
  style: VisualStyle;
  bgMusicUrl?: string; // URL for background ambience
  fullAudioUrl?: string; // Single continuous audio file
  originalAudioUrl?: string; // Only for audio upload mode
}

export enum VoiceName {
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr'
}

export interface GenerationStatus {
  step: 'idle' | 'scripting' | 'script_review' | 'analyzing' | 'visualizing' | 'speaking' | 'complete' | 'error' | 'exporting';
  message: string;
  progress: number; // 0 to 100
}