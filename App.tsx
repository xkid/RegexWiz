import React, { useState, useEffect, useMemo, useRef } from 'react';
import { generateRegexFromPrompt } from './services/geminiService';
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
  X
} from 'lucide-react';

const SAMPLE_DATA = `2023-10-27 10:00:01 [INFO] User login: alice_doe (IP: 192.168.1.45)
2023-10-27 10:05:23 [ERROR] Database connection failed (Retry: 1)
2023-10-27 10:06:05 [WARN] High memory usage: 85%
2023-10-27 10:15:00 [INFO] User logout: alice_doe`;

const DEFAULT_MUSIC_URL = "/bnova.mp3";
const STORAGE_KEY = "custom_bg_music";
// 2.5MB limit to be safe with localStorage 5MB limit (Base64 is ~33% larger)
const MAX_FILE_SIZE = 2.5 * 1024 * 1024; 

export default function App() {
  const [inputData, setInputData] = useState<string>(SAMPLE_DATA);
  const [userPrompt, setUserPrompt] = useState<string>("Extract timestamps and log levels");
  const [regexResult, setRegexResult] = useState<RegexResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  
  // Audio state
  const [musicSrc, setMusicSrc] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_MUSIC_URL;
    } catch (e) {
      return DEFAULT_MUSIC_URL;
    }
  });
  const [isMusicPlaying, setIsMusicPlaying] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  // To handle manual edits to the generated regex
  const [manualRegex, setManualRegex] = useState<string>("");
  const [manualFlags, setManualFlags] = useState<string>("gm");

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

  const toggleMusic = () => {
    if (audioRef.current) {
      if (audioError) {
        audioRef.current.load();
        setAudioError(false);
      }

      if (isMusicPlaying) {
        audioRef.current.pause();
        setIsMusicPlaying(false);
      } else {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsMusicPlaying(true);
              setError(null);
            })
            .catch(() => {
              console.error("Playback failed.");
              setError("Failed to play music.");
              setIsMusicPlaying(false);
            });
        }
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "audio/mpeg" && file.type !== "audio/mp3") {
      setUploadError("Please upload a valid MP3 file.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setUploadError(`File is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Max size is 2.5MB for local storage.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      try {
        localStorage.setItem(STORAGE_KEY, result);
        setMusicSrc(result);
        setUploadError(null);
        // Stop playing if changing track
        if (isMusicPlaying && audioRef.current) {
          audioRef.current.pause();
          setIsMusicPlaying(false);
        }
        setAudioError(false);
      } catch (err) {
        console.error("Storage error:", err);
        setUploadError("Storage quota exceeded. The file is too large to save in your browser.");
      }
    };
    reader.onerror = () => {
        setUploadError("Failed to read file.");
    }
    reader.readAsDataURL(file);
  };

  const handleResetMusic = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setMusicSrc(DEFAULT_MUSIC_URL);
      setUploadError(null);
      if (isMusicPlaying && audioRef.current) {
        audioRef.current.pause();
        setIsMusicPlaying(false);
      }
      setAudioError(false);
    } catch (e) {
      setUploadError("Failed to reset settings.");
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

  const isCustomMusic = musicSrc !== DEFAULT_MUSIC_URL;

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-200 p-4 md:p-8 font-sans selection:bg-indigo-500/30">
      {/* Background Audio */}
      <audio 
        ref={audioRef} 
        src={musicSrc} 
        loop 
        onError={() => {
          console.error("Audio error: Failed to load resource.");
          setAudioError(true);
          setIsMusicPlaying(false);
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
              title="Settings"
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
          <div className="bg-[#161b22] border border-gray-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Settings size={18} className="text-indigo-400" />
                Music Settings
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
            
            <div className="p-6 space-y-6">
              
              <div className="space-y-3">
                <div className="text-sm font-medium text-gray-400">Current Source</div>
                <div className="flex items-center gap-3 p-3 bg-[#0d1117] rounded-lg border border-gray-800">
                  <div className={`w-2 h-2 rounded-full ${isCustomMusic ? 'bg-indigo-400' : 'bg-gray-500'}`}></div>
                  <span className="text-gray-200 text-sm truncate flex-1">
                    {isCustomMusic ? 'Custom Uploaded File' : 'Default (bnova.mp3)'}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-400">Upload Custom Music (.mp3)</label>
                <div className="flex gap-2">
                  <label className="flex-1 cursor-pointer">
                    <input 
                      type="file" 
                      accept=".mp3,audio/mpeg" 
                      className="hidden" 
                      onChange={handleFileUpload}
                    />
                    <div className="flex items-center justify-center gap-2 w-full p-3 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/30 border-dashed rounded-lg text-indigo-400 text-sm font-medium transition-all group">
                      <Upload size={16} className="group-hover:scale-110 transition-transform" />
                      <span>Choose File (Max 2.5MB)</span>
                    </div>
                  </label>
                  
                  {isCustomMusic && (
                    <button 
                      onClick={handleResetMusic}
                      className="p-3 bg-red-900/20 hover:bg-red-900/30 border border-red-900/50 rounded-lg text-red-400 transition-colors"
                      title="Reset to Default"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Files are converted to Base64 and stored in your browser's Local Storage. 
                  Larger files may fail to save due to storage quotas.
                </p>
              </div>

              {uploadError && (
                <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-start gap-2 text-sm text-red-400">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-[#0d1117] border-t border-gray-800 flex justify-end">
              <button 
                onClick={() => {
                  setIsSettingsOpen(false);
                  setUploadError(null);
                }}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-md transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}