import React, { useState, useEffect, useMemo, useRef } from 'react';
import { generateRegexFromPrompt } from './services/geminiService';
import * as audioStorage from './services/audioStorage';
import MatchHighlighter from './components/MatchHighlighter';
import { RegexResult } from './types';
import { 
  Wand2, 
  Copy, 
  Check, 
  AlertCircle, 
  Code, 
  Terminal, 
  Eraser,
  Play,
  Volume2,
  VolumeX,
  Settings,
  Upload,
  Trash2,
  X,
  Music,
  SkipForward
} from 'lucide-react';

const SAMPLE_DATA = `2023-10-27 10:00:01 [INFO] User login: alice_doe (IP: 192.168.1.45)
2023-10-27 10:05:23 [ERROR] Database connection failed (Retry: 1)
2023-10-27 10:06:05 [WARN] High memory usage: 85%
2023-10-27 10:15:00 [INFO] User logout: alice_doe`;

const DEFAULT_MUSIC_URL = "/bnova.mp3";

export default function App() {
  const [inputData, setInputData] = useState<string>(SAMPLE_DATA);
  const [userPrompt, setUserPrompt] = useState<string>("Extract timestamps and log levels");
  const [regexResult, setRegexResult] = useState<RegexResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  
  // Audio state
  const [playlist, setPlaylist] = useState<audioStorage.TrackMetadata[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [musicSrc, setMusicSrc] = useState<string>(DEFAULT_MUSIC_URL);
  const [isMusicPlaying, setIsMusicPlaying] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<boolean>(false);
  
  // Refs to manage audio object URLs and element
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isPlaylistLoading, setIsPlaylistLoading] = useState(false);
  
  // To handle manual edits to the generated regex
  const [manualRegex, setManualRegex] = useState<string>("");
  const [manualFlags, setManualFlags] = useState<string>("gm");

  // Load playlist on mount
  useEffect(() => {
    const loadPlaylist = async () => {
      try {
        const tracks = await audioStorage.getPlaylistMetadata();
        setPlaylist(tracks);
      } catch (e) {
        console.error("Failed to load playlist", e);
      }
    };
    loadPlaylist();
  }, []);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
      }
    };
  }, []);

  const handleGenerate = async () => {
    if (!inputData.trim() || !userPrompt.trim()) {
      setError("Please provide both data and a prompt.");
      return;
    }

    setLoading(true);
    setError(null);
    setRegexResult(null);

    try {
      const result = await generateRegexFromPrompt(inputData, userPrompt);
      setRegexResult(result);
      setManualRegex(result.pattern);
      setManualFlags(result.flags);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    const fullRegex = `/${manualRegex}/${manualFlags}`;
    navigator.clipboard.writeText(fullRegex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- Audio Logic ---

  const playTrackAtIndex = async (index: number) => {
    if (!audioRef.current) return;

    try {
      // If playlist is empty, use default
      if (playlist.length === 0) {
        setMusicSrc(DEFAULT_MUSIC_URL);
        setCurrentTrackIndex(0);
      } else {
        // Bounds check
        const safeIndex = index % playlist.length;
        const track = playlist[safeIndex];
        
        // Fetch blob from DB
        const blob = await audioStorage.getTrackBlob(track.id);
        
        if (blob) {
          // Revoke old URL to prevent memory leaks
          if (currentBlobUrlRef.current) {
            URL.revokeObjectURL(currentBlobUrlRef.current);
          }
          
          const newUrl = URL.createObjectURL(blob);
          currentBlobUrlRef.current = newUrl;
          setMusicSrc(newUrl);
          setCurrentTrackIndex(safeIndex);
        } else {
          console.error("Track blob not found, skipping");
          playNextTrack(); // Skip broken track
          return;
        }
      }

      // Reset error state and play
      setAudioError(false);
      // We need to wait for state update to propagate to <audio src>, 
      // but usually setting src prop works. 
      // However, we must call .load() if we are changing src dynamically while playing.
      // React handles the prop change, but we trigger play after a short delay or effect
      // to ensure the element is ready.
      
      // Let's rely on an effect listening to musicSrc changes to trigger play if isMusicPlaying is true
    } catch (e) {
      console.error("Error playing track:", e);
      setAudioError(true);
    }
  };

  // Effect to play audio when src changes if it was already playing
  useEffect(() => {
    if (isMusicPlaying && audioRef.current) {
      audioRef.current.load(); // Reload with new source
      const playPromise = audioRef.current.play();
      if (playPromise) {
        playPromise.catch(e => {
            console.error("Auto-play failed after track change", e);
            // Don't stop playing state, let user retry or next track logic handle it
        });
      }
    }
  }, [musicSrc]);

  const toggleMusic = async () => {
    if (!audioRef.current) return;

    if (isMusicPlaying) {
      audioRef.current.pause();
      setIsMusicPlaying(false);
    } else {
      // If starting for the first time and we have a playlist but src is still default
      // check if we need to load the first track from DB
      if (playlist.length > 0 && musicSrc === DEFAULT_MUSIC_URL && currentTrackIndex === 0) {
          await playTrackAtIndex(0);
      }
      
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsMusicPlaying(true);
            setAudioError(false);
          })
          .catch((e) => {
            console.error("Playback failed", e);
            // If failed, maybe try loading first track again properly if it was a source issue
            if (playlist.length > 0) {
                 playTrackAtIndex(0).then(() => {
                     // Try playing again after loading
                     audioRef.current?.play().then(() => {
                         setIsMusicPlaying(true);
                         setAudioError(false);
                     }).catch(err => {
                         console.error("Retry playback failed", err);
                         setAudioError(true);
                         setIsMusicPlaying(false);
                     });
                 });
            } else {
                setAudioError(true);
                setIsMusicPlaying(false);
            }
          });
      }
    }
  };

  const playNextTrack = () => {
    const nextIndex = (currentTrackIndex + 1) % (playlist.length || 1);
    playTrackAtIndex(nextIndex);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadError(null);
    setIsPlaylistLoading(true);

    let addedCount = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type !== "audio/mpeg" && file.type !== "audio/mp3") {
           // Skip invalid files or warn? Let's skip silently for bulk upload simplicity, or warn once.
           continue;
        }
        await audioStorage.addTrack(file);
        addedCount++;
      }
      
      // Refresh playlist
      const tracks = await audioStorage.getPlaylistMetadata();
      setPlaylist(tracks);
      
      // If we went from 0 to >0 tracks, switch to the first track immediately if playing default
      if (playlist.length === 0 && tracks.length > 0 && isMusicPlaying) {
          playTrackAtIndex(0);
      }

    } catch (err) {
      console.error("Upload failed", err);
      setUploadError("Failed to save some files to database.");
    } finally {
      setIsPlaylistLoading(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleDeleteTrack = async (id: string) => {
    try {
      await audioStorage.deleteTrack(id);
      const updatedPlaylist = await audioStorage.getPlaylistMetadata();
      setPlaylist(updatedPlaylist);
      
      // If we deleted the current playing track, play next (or prev, or stop)
      // For simplicity, if playlist becomes empty, reset to default.
      if (updatedPlaylist.length === 0) {
          setMusicSrc(DEFAULT_MUSIC_URL);
          setCurrentTrackIndex(0);
      } else {
          // Adjust index if needed? 
          // If we deleted a track before current index, decrement index
          // If we deleted current track, play the new track at this index (which was next)
          // For now, let's just trigger play at current index (which is now the next song)
          // If index is out of bounds (deleted last song), wrap to 0
          if (currentTrackIndex >= updatedPlaylist.length) {
              playTrackAtIndex(0);
          } else {
              // Reload current index (it's a different song now)
              playTrackAtIndex(currentTrackIndex);
          }
      }
    } catch (e) {
      console.error("Delete failed", e);
    }
  };

  const { matchCount, isRegexValid } = useMemo(() => {
    if (!manualRegex) return { matchCount: 0, isRegexValid: true };
    try {
      const safeFlags = manualFlags.includes('g') ? manualFlags : manualFlags + 'g';
      const re = new RegExp(manualRegex, safeFlags);
      const matches = inputData.match(re);
      return { matchCount: matches ? matches.length : 0, isRegexValid: true };
    } catch {
      return { matchCount: 0, isRegexValid: false };
    }
  }, [manualRegex, manualFlags, inputData]);

  // Determine display name for current track
  const currentTrackName = playlist.length > 0 
    ? playlist[currentTrackIndex]?.name 
    : "Default (bnova.mp3)";

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-200 p-4 md:p-8 font-sans selection:bg-indigo-500/30">
      {/* Background Audio */}
      <audio 
        ref={audioRef} 
        src={musicSrc} 
        // Loop only if using default or single track playlist? 
        // Actually if we want to loop playlist, we shouldn't use loop attribute on audio tag
        // We use onEnded to manually switch.
        // But if playlist is empty (default), we want loop.
        loop={playlist.length === 0} 
        onEnded={() => {
            if (playlist.length > 0) {
                playNextTrack();
            }
        }}
        onError={() => {
          console.error("Audio error: Failed to load resource.");
          setAudioError(true);
          // If error in playlist, try next
          if (playlist.length > 0 && isMusicPlaying) {
              setTimeout(() => playNextTrack(), 1000); // Small delay to avoid infinite error loop
          } else {
              setIsMusicPlaying(false);
          }
        }}
      />

      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between pb-6 border-b border-gray-800 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-900/20">
              <Terminal size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Regex Wizard</h1>
              <p className="text-gray-400 text-sm">AI-Powered Regular Expression Generator</p>
            </div>
          </div>
          <div className="flex gap-3">
             <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center justify-center p-2 text-gray-400 hover:text-white transition-colors border border-gray-700 hover:border-gray-500 rounded-md"
              title="Playlist Settings"
            >
              <Settings size={16} />
            </button>

             <button
              onClick={toggleMusic}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors border rounded-md ${
                isMusicPlaying 
                  ? "text-indigo-300 border-indigo-500/50 bg-indigo-500/10 hover:bg-indigo-500/20" 
                  : audioError 
                    ? "text-red-400 border-red-900 hover:border-red-700 opacity-80"
                    : "text-gray-400 border-gray-700 hover:border-gray-500 hover:text-white"
              }`}
              title={audioError ? "Audio source error" : "Toggle Background Music"}
            >
              {isMusicPlaying ? <Volume2 size={14} /> : <VolumeX size={14} />}
              {isMusicPlaying ? "Music On" : "Music Off"}
            </button>

             <button 
              onClick={() => {
                setInputData("");
                setUserPrompt("");
                setRegexResult(null);
                setManualRegex("");
                setError(null);
              }}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white transition-colors border border-gray-700 hover:border-gray-500 rounded-md"
            >
              <Eraser size={14} /> Clear All
            </button>
          </div>
        </header>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
          
          {/* Left Column: Inputs */}
          <div className="lg:col-span-5 space-y-6 flex flex-col h-full">
            
            {/* Input Data Section */}
            <div className="flex-1 flex flex-col min-h-[300px]">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 flex justify-between">
                <span>Test Data</span>
                <span className="text-gray-600 normal-case font-normal">{inputData.length} chars</span>
              </label>
              <div className="relative flex-1 bg-[#161b22] border border-gray-700 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-indigo-500 transition-all overflow-hidden group">
                <textarea
                  value={inputData}
                  onChange={(e) => setInputData(e.target.value)}
                  className="w-full h-full p-4 bg-transparent border-none resize-none focus:ring-0 text-sm font-mono text-gray-300 placeholder-gray-600 leading-relaxed"
                  placeholder="Paste your test string here..."
                  spellCheck={false}
                />
                <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                   <div className="px-2 py-1 bg-gray-800 text-gray-400 text-xs rounded border border-gray-700">Editable</div>
                </div>
              </div>
            </div>

            {/* Prompt Section */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                What do you want to match?
              </label>
              <div className="relative">
                <textarea
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  rows={3}
                  className="w-full bg-[#161b22] border border-gray-700 rounded-lg p-4 pr-12 text-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder-gray-600 resize-none"
                  placeholder="e.g. Find all email addresses or Extract dates in YYYY-MM-DD format..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      handleGenerate();
                    }
                  }}
                />
                <button
                  onClick={handleGenerate}
                  disabled={loading || !inputData || !userPrompt}
                  className="absolute bottom-3 right-3 p-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-indigo-500/20"
                  title="Generate Regex (Cmd/Ctrl + Enter)"
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white" />
                  ) : (
                    <Wand2 size={20} />
                  )}
                </button>
              </div>
              {error && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 p-3 rounded-md border border-red-900/50 animate-in fade-in slide-in-from-top-2">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Output & Visualization */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            
            {/* Regex Editor / Display */}
            <div className="bg-[#161b22] border border-gray-700 rounded-xl overflow-hidden flex flex-col shadow-xl">
              <div className="bg-[#0d1117] border-b border-gray-800 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code size={16} className={`transition-colors ${!isRegexValid ? 'text-red-400' : 'text-indigo-400'}`} />
                  <span className={`text-sm font-semibold transition-colors ${!isRegexValid ? 'text-red-400' : 'text-gray-300'}`}>
                    {isRegexValid ? 'Generated Pattern' : 'Invalid Pattern'}
                  </span>
                </div>
                {manualRegex && isRegexValid && (
                    <button 
                      onClick={copyToClipboard}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                )}
              </div>
              
              <div className={`p-4 md:p-6 bg-[#0d1117] transition-colors duration-200 ${!isRegexValid ? 'bg-red-950/10' : ''}`}>
                <div className="flex items-center font-mono text-lg md:text-xl">
                  <span className="text-gray-500 select-none">/</span>
                  <input
                    type="text"
                    value={manualRegex}
                    onChange={(e) => setManualRegex(e.target.value)}
                    placeholder={loading ? "Generating..." : "(regex will appear here)"}
                    className={`flex-1 bg-transparent border-none focus:ring-0 placeholder-gray-700 min-w-0 transition-colors duration-200 ${!isRegexValid ? 'text-red-400' : 'text-indigo-300'}`}
                    spellCheck={false}
                  />
                  <span className="text-gray-500 select-none">/</span>
                  <input
                    type="text"
                    value={manualFlags}
                    onChange={(e) => setManualFlags(e.target.value)}
                    className="w-12 bg-transparent border-none focus:ring-0 text-indigo-400"
                    maxLength={5}
                  />
                </div>
              </div>

               {regexResult?.explanation && (
                <div className="bg-[#161b22] px-6 py-4 border-t border-gray-800 text-sm text-gray-400 leading-relaxed">
                  <span className="text-indigo-400 font-medium mr-2">AI Explanation:</span>
                  {regexResult.explanation}
                </div>
              )}
            </div>

            {/* Live Match Preview */}
            <div className="flex-1 flex flex-col min-h-[300px] bg-[#161b22] border border-gray-700 rounded-xl overflow-hidden shadow-xl">
               <div className="bg-[#0d1117] border-b border-gray-800 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Play size={16} className="text-emerald-400" />
                  <span className="text-sm font-semibold text-gray-300">Live Match Preview</span>
                </div>
                <div className="px-2 py-0.5 bg-gray-800 rounded-full border border-gray-700 text-xs text-gray-300 font-mono">
                  {matchCount} match{matchCount !== 1 ? 'es' : ''} found
                </div>
              </div>
              
              <div className="flex-1 p-4 md:p-6 overflow-auto max-h-[600px]">
                {inputData ? (
                   <MatchHighlighter 
                    text={inputData} 
                    regexPattern={manualRegex} 
                    flags={manualFlags} 
                  />
                ) : (
                  <div className="text-gray-600 text-sm italic text-center mt-10">No data provided to match against.</div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#161b22] border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-4 border-b border-gray-800 shrink-0">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Music size={18} className="text-indigo-400" />
                Playlist Manager
              </h2>
              <button 
                onClick={() => {
                  setIsSettingsOpen(false);
                  setUploadError(null);
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                   <div className="text-sm font-medium text-gray-400">Current Queue</div>
                   <span className="text-xs text-gray-500">{playlist.length} track(s)</span>
                </div>
                
                <div className="bg-[#0d1117] rounded-lg border border-gray-800 overflow-hidden">
                  {playlist.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-500 italic">
                      Playlist is empty. Using default background music.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-800/50">
                      {playlist.map((track, idx) => (
                        <div key={track.id} className={`p-3 flex items-center gap-3 hover:bg-white/5 transition-colors ${currentTrackIndex === idx && playlist.length > 0 ? 'bg-indigo-500/10' : ''}`}>
                          <div className="text-gray-500 text-xs w-5 text-center shrink-0">
                            {currentTrackIndex === idx ? <Play size={10} className="text-indigo-400 mx-auto fill-current" /> : idx + 1}
                          </div>
                          <div className={`text-sm truncate flex-1 ${currentTrackIndex === idx ? 'text-indigo-300 font-medium' : 'text-gray-300'}`}>
                            {track.name}
                          </div>
                          <button 
                            onClick={() => handleDeleteTrack(track.id)}
                            className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                            title="Remove from playlist"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-400">Add to Playlist</label>
                <div className="flex gap-2">
                  <label className="flex-1 cursor-pointer">
                    <input 
                      type="file" 
                      accept=".mp3,audio/mpeg" 
                      className="hidden" 
                      multiple
                      onChange={handleFileUpload}
                      disabled={isPlaylistLoading}
                    />
                    <div className={`flex items-center justify-center gap-2 w-full p-3 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/30 border-dashed rounded-lg text-indigo-400 text-sm font-medium transition-all group ${isPlaylistLoading ? 'opacity-50 cursor-wait' : ''}`}>
                      {isPlaylistLoading ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-400 border-t-transparent" />
                      ) : (
                        <Upload size={16} className="group-hover:scale-110 transition-transform" />
                      )}
                      <span>{isPlaylistLoading ? "Processing..." : "Upload MP3s"}</span>
                    </div>
                  </label>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Songs are stored in your browser's IndexedDB. Storage limits depend on your available disk space.
                </p>
              </div>

              {uploadError && (
                <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-start gap-2 text-sm text-red-400">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-[#0d1117] border-t border-gray-800 flex justify-between items-center shrink-0">
              <div className="text-xs text-gray-500 flex items-center gap-2">
                {isMusicPlaying ? (
                  <>
                     <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                     Playing: <span className="text-gray-400 max-w-[150px] truncate">{currentTrackName}</span>
                  </>
                ) : (
                  <span>Player Stopped</span>
                )}
              </div>
              
              <div className="flex gap-2">
                {playlist.length > 0 && (
                   <button 
                    onClick={playNextTrack}
                    className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-md transition-colors flex items-center gap-2"
                    title="Next Track"
                  >
                    <SkipForward size={14} /> Next
                  </button>
                )}
                <button 
                  onClick={() => {
                    setIsSettingsOpen(false);
                    setUploadError(null);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-md transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}