import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  Settings, 
  PlayCircle, 
  PauseCircle,
  Heart, 
  Plus, 
  MapPin, 
  ChevronRight,
  BookOpen,
  User,
  Loader2,
  Sparkles,
  Volume2,
  X,
  Upload,
  Trash2,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Story, Memory } from './types';
import { generateStoryFromImage, generateStoryAudio, generateSamplePhoto } from './services/gemini';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const INITIAL_STORIES: Story[] = [
  {
    id: '1',
    title: 'Summer of 1974',
    location: 'Pine Lake Resort',
    date: '1974',
    narrative: '"Remember the summer of 1974 at the lake? You and Sarah spent all day fishing, the water was so calm, and the air smelled like pine needles. It was one of your favorite vacations."',
    imageUrl: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&q=80&w=800',
    isFavorite: true
  },
  {
    id: '2',
    title: 'The Big Day',
    location: 'St. Mary\'s Cathedral',
    date: '1970',
    narrative: '"Do you recall the morning of your wedding? The sun was streaming through the stained glass, and the scent of lilies filled the air. You looked so radiant in your lace gown."',
    imageUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&q=80&w=800',
    isFavorite: false
  },
  {
    id: '3',
    title: 'First House Party',
    location: 'Maple Avenue',
    date: '1982',
    narrative: '"Remember the laughter at your first housewarming? The record player was spinning your favorite jazz, and the kitchen was full of friends and the smell of fresh apple pie."',
    imageUrl: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&q=80&w=800',
    isFavorite: false
  }
];

const INITIAL_MEMORIES: Memory[] = [
  {
    id: '1',
    imageUrl: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&q=80&w=800',
    description: 'Vacation at Pine Lake with Sarah. We went fishing all day.',
    date: '1974',
    location: 'Pine Lake Resort',
    timestamp: Date.now() - 1000000
  },
  {
    id: '2',
    imageUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&q=80&w=800',
    description: 'Our wedding day at the cathedral. Beautiful sun and lilies.',
    date: '1970',
    location: 'St. Mary\'s Cathedral',
    timestamp: Date.now() - 2000000
  },
  {
    id: '3',
    imageUrl: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&q=80&w=800',
    description: 'First housewarming party on Maple Avenue. Jazz music and apple pie.',
    date: '1982',
    location: 'Maple Avenue',
    timestamp: Date.now() - 3000000
  }
];

const MOODS = [
  { emoji: '😊', label: 'Joyful', color: 'bg-yellow-100 text-yellow-700' },
  { emoji: '😔', label: 'Melancholy', color: 'bg-blue-100 text-blue-700' },
  { emoji: '😰', label: 'Restless', color: 'bg-purple-100 text-purple-700' },
  { emoji: '🏠', label: 'Lonely', color: 'bg-orange-100 text-orange-700' },
  { emoji: '❓', label: 'Disoriented', color: 'bg-slate-100 text-slate-700' },
];

export default function App() {
  const [stories, setStories] = useState<Story[]>(INITIAL_STORIES);
  const [activeStory, setActiveStory] = useState<Story>(INITIAL_STORIES[0]);
  const [memories, setMemories] = useState<Memory[]>(INITIAL_MEMORIES);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStoryGenerating, setIsStoryGenerating] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMoodPanelOpen, setIsMoodPanelOpen] = useState(false);
  const [audioCache, setAudioCache] = useState<Record<string, string>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddMemory = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const newMemory: Memory = {
        id: Date.now().toString(),
        imageUrl: reader.result as string,
        description: '',
        timestamp: Date.now()
      };
      setMemories(prev => [newMemory, ...prev]);
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateMemory = (id: string, updates: Partial<Memory>) => {
    setMemories(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const handleDeleteMemory = (id: string) => {
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  };

  const playPCM = async (base64: string) => {
    stopAudio();

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }

    const context = audioContextRef.current;
    if (context.state === 'suspended') {
      await context.resume();
    }

    // Decode base64 to ArrayBuffer
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Gemini returns 16-bit linear PCM
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    const audioBuffer = context.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    source.onended = () => setIsPlaying(false);
    
    sourceNodeRef.current = source;
    source.start();
    setIsPlaying(true);
  };

  const handleListen = async (story: Story) => {
    if (isPlaying) {
      stopAudio();
      return;
    }

    if (audioCache[story.id]) {
      playPCM(audioCache[story.id]);
      return;
    }

    try {
      setIsAudioLoading(true);
      const base64 = await generateStoryAudio(story.narrative);
      setAudioCache(prev => ({ ...prev, [story.id]: base64 }));
      playPCM(base64);
    } catch (error: any) {
      console.error("Failed to generate audio:", error);
      if (error?.message?.includes('429') || error?.message?.includes('quota')) {
        alert("The AI narrator is currently resting (quota reached). Please try again in a few minutes!");
      } else {
        alert("Sorry, I couldn't start the narration right now.");
      }
    } finally {
      setIsAudioLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const handleGenerateSample = async (mood?: string) => {
    setIsMoodPanelOpen(false);
    setIsStoryGenerating(true);
    stopAudio();
    try {
      let imageUrl = '';
      let contextText = '';
      let suggestedDate = '';
      let suggestedLocation = '';

      if (memories.length > 0) {
        // Pick a random memory from settings
        const randomMemory = memories[Math.floor(Math.random() * memories.length)];
        imageUrl = randomMemory.imageUrl;
        contextText = randomMemory.description;
        suggestedDate = randomMemory.date || '';
        suggestedLocation = randomMemory.location || '';
      } else {
        // Fallback to sample photo generation if no memories exist
        const prompts = [
          "A family picnic in a sunny park with a red checkered blanket",
          "A young couple dancing in a vintage living room",
          "A child riding a bicycle on a suburban street"
        ];
        const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
        imageUrl = await generateSamplePhoto(randomPrompt);
      }
      
      const storyData = await generateStoryFromImage(imageUrl, mood, contextText);
      
      const newStory: Story = {
        id: Date.now().toString(),
        title: storyData.title || "New Memory",
        location: storyData.location || suggestedLocation || "Unknown Location",
        date: storyData.date || suggestedDate || "Unknown Date",
        narrative: storyData.narrative || "A beautiful new memory to cherish.",
        imageUrl: imageUrl,
        isFavorite: false
      };
      
      setStories(prev => [newStory, ...prev]);
      setActiveStory(newStory);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error("Generation failed:", error);
    } finally {
      setIsStoryGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-light flex flex-col max-w-md mx-auto shadow-2xl overflow-hidden relative">
      {/* Header */}
      <header className="flex items-center justify-between p-4 bg-white/80 backdrop-blur-md sticky top-0 z-10 border-b border-slate-100">
        <button className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <ArrowLeft className="w-6 h-6 text-slate-600" />
        </button>
        <h1 className="text-lg font-bold text-slate-800">Life Stories</h1>
        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="p-2 hover:bg-slate-100 rounded-full transition-colors"
        >
          <Settings className="w-6 h-6 text-slate-600" />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto pb-32">
        {/* Today's Story Section */}
        <section className="p-4 space-y-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-slate-900">Today's Story</h2>
            <p className="text-slate-500 text-sm">Based on your memories with Sarah</p>
          </div>

          <AnimatePresence mode="wait">
            <motion.div 
              key={activeStory.id}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 overflow-hidden border border-slate-100"
            >
              <div className="relative aspect-[4/3]">
                <img 
                  src={activeStory.imageUrl} 
                  alt={activeStory.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute bottom-6 left-6 text-white space-y-1 pr-24">
                  <h3 className="text-2xl font-bold">{activeStory.title}</h3>
                  <div className="flex items-center gap-1 text-white/80 text-sm">
                    <MapPin className="w-4 h-4" />
                    <span>{activeStory.location}</span>
                  </div>
                </div>

                <div className="absolute top-4 right-4 flex flex-col gap-3">
                  <button 
                    onClick={() => handleListen(activeStory)}
                    disabled={isAudioLoading || isStoryGenerating}
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 backdrop-blur-md",
                      isPlaying 
                        ? "bg-white/90 text-primary" 
                        : "bg-primary/90 text-white shadow-lg shadow-black/20 hover:bg-primary"
                    )}
                  >
                    {isAudioLoading ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : isPlaying ? (
                      <PauseCircle className="w-6 h-6" />
                    ) : (
                      <PlayCircle className="w-6 h-6" />
                    )}
                  </button>
                  <button className="w-12 h-12 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-md text-white hover:text-red-500 transition-colors">
                    <Heart className={cn("w-6 h-6", activeStory.isFavorite && "fill-current text-red-500")} />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <p className="text-slate-600 text-lg leading-relaxed italic font-medium">
                  {activeStory.narrative}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </section>

        {/* Past Stories Section */}
        <section className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-slate-900">Past Stories</h3>
            <button className="text-primary text-sm font-bold flex items-center gap-1">
              View all <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {stories.map((story) => (
              <motion.button
                key={story.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setActiveStory(story);
                  setIsPlaying(false);
                  stopAudio();
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={cn(
                  "flex flex-col gap-2 text-left group",
                  activeStory.id === story.id && "opacity-50"
                )}
              >
                <div className="aspect-square rounded-2xl overflow-hidden border-2 border-transparent group-hover:border-primary/20 transition-all">
                  <img 
                    src={story.imageUrl} 
                    alt={story.title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="px-1">
                  <p className="font-bold text-sm text-slate-800 truncate">{story.title}</p>
                  <p className="text-xs text-slate-400">{story.date}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </section>
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/80 backdrop-blur-xl border-t border-slate-100 px-6 pt-2 pb-8 flex items-center justify-between z-20">
        <button className="flex flex-col items-center gap-1 text-primary">
          <BookOpen className="w-7 h-7" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Stories</span>
        </button>

        <div className="relative -mt-12">
          <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg whitespace-nowrap">
            ADD NEW MEMORY
          </div>
          <button 
            onClick={() => setIsMoodPanelOpen(true)}
            disabled={isStoryGenerating}
            className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-white shadow-2xl shadow-primary/50 border-4 border-white active:scale-90 transition-transform disabled:opacity-50"
          >
            {isStoryGenerating ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : (
              <Plus className="w-8 h-8" />
            )}
          </button>
        </div>

        <button className="flex flex-col items-center gap-1 text-slate-300">
          <User className="w-7 h-7" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Profile</span>
        </button>
      </nav>

      {/* Mood Selection Panel */}
      <AnimatePresence>
        {isMoodPanelOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setIsMoodPanelOpen(false)}
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white w-full max-w-md rounded-t-[32px] p-8 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-8" />
              <h3 className="text-2xl font-bold text-slate-900 mb-2 text-center">How are you feeling?</h3>
              <p className="text-slate-500 text-center mb-8">Choose an emotion, and I'll find a memory for you.</p>
              
              <div className="grid grid-cols-1 gap-3">
                {MOODS.map((mood) => (
                  <button
                    key={mood.label}
                    onClick={() => handleGenerateSample(mood.label)}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-2xl transition-all active:scale-98 hover:brightness-95",
                      mood.color
                    )}
                  >
                    <span className="text-3xl">{mood.emoji}</span>
                    <span className="text-lg font-bold">{mood.label}</span>
                    <ChevronRight className="ml-auto w-5 h-5 opacity-50" />
                  </button>
                ))}
              </div>

              <button 
                onClick={() => handleGenerateSample()}
                className="w-full mt-6 py-4 text-slate-400 font-medium hover:text-slate-600 transition-colors"
              >
                Skip mood selection
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Magic Overlay */}
      <AnimatePresence>
        {isStoryGenerating && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-white/60 backdrop-blur-sm z-50 flex flex-col items-center justify-start pt-32 p-8 text-center space-y-4"
          >
            <div className="relative">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="w-24 h-24 rounded-full border-4 border-primary/10 border-t-primary"
              />
              <Sparkles className="w-10 h-10 text-primary absolute inset-0 m-auto animate-pulse" />
            </div>
            <div className="space-y-2">
              <h4 className="text-xl font-bold text-slate-800">Creating a Memory...</h4>
              <p className="text-slate-500 text-sm max-w-[200px]">Gemini is analyzing your photos to create a new memory</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings View */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 bg-slate-50 z-50 flex flex-col max-w-md mx-auto"
          >
            <header className="flex items-center justify-between p-4 bg-white border-b border-slate-100 sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <ArrowLeft className="w-6 h-6 text-slate-600" />
                </button>
                <h2 className="text-lg font-bold text-slate-800">Caregiver Settings</h2>
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-primary text-white p-2 rounded-full shadow-lg active:scale-95 transition-all"
              >
                <Plus className="w-6 h-6" />
              </button>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleAddMemory}
                accept="image/*"
                className="hidden"
              />
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                <h3 className="text-blue-800 font-bold text-sm mb-1 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  How it works
                </h3>
                <p className="text-blue-700 text-xs leading-relaxed">
                  Upload photos and add brief descriptions. Our AI uses these "seeds" to generate rich, sensory-focused reminiscence stories for your loved one.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-slate-800 font-bold text-sm uppercase tracking-wider">Source Memories</h3>
                  <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                    {memories.length} TOTAL
                  </span>
                </div>
                
                {memories.map((memory) => (
                  <div key={memory.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-4">
                    <div className="flex gap-4">
                      <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 border border-slate-100">
                        <img 
                          src={memory.imageUrl} 
                          alt="Memory" 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <textarea
                          placeholder="What happened in this photo? (e.g. 'Vacation at the lake with Sarah')"
                          value={memory.description}
                          onChange={(e) => handleUpdateMemory(memory.id, { description: e.target.value })}
                          className="w-full text-sm bg-slate-50 border-none rounded-xl p-3 focus:ring-2 focus:ring-primary/20 resize-none h-24"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                      <div className="flex gap-2">
                        <div className="flex items-center gap-1 bg-slate-50 rounded-lg px-2 py-1">
                          <ImageIcon className="w-3 h-3 text-slate-400" />
                          <input 
                            type="text"
                            placeholder="Year"
                            value={memory.date || ''}
                            onChange={(e) => handleUpdateMemory(memory.id, { date: e.target.value })}
                            className="text-[10px] bg-transparent border-none w-12 focus:ring-0 p-0"
                          />
                        </div>
                        <div className="flex items-center gap-1 bg-slate-50 rounded-lg px-2 py-1">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <input 
                            type="text"
                            placeholder="Location"
                            value={memory.location || ''}
                            onChange={(e) => handleUpdateMemory(memory.id, { location: e.target.value })}
                            className="text-[10px] bg-transparent border-none w-20 focus:ring-0 p-0"
                          />
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDeleteMemory(memory.id)}
                        className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {memories.length === 0 && (
                  <div className="text-center py-12 space-y-4">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
                      <Upload className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-slate-400 text-sm">No memories uploaded yet</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
