'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Course, Tee } from '@/types/database';
import { Calendar, MapPin, User, Plus, Trash2, Copy, Check, Play, Flag, Trophy, Sparkles } from 'lucide-react';

interface PlayerInput {
  name: string;
  teeId: string;
}

export default function LandingPage() {
  const router = useRouter();

  // Form State
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [availableTees, setAvailableTees] = useState<Tee[]>([]);
  const [playDate, setPlayDate] = useState<string>('');
  const [players, setPlayers] = useState<PlayerInput[]>([
    { name: '', teeId: '' },
    { name: '', teeId: '' },
  ]);

  // UI State
  const [loadingCourses, setLoadingCourses] = useState<boolean>(true);
  const [loadingTees, setLoadingTees] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedSession, setGeneratedSession] = useState<{
    accessCode: string;
    url: string;
  } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Set default play date safely on client mount
  useEffect(() => {
    setPlayDate(new Date().toISOString().split('T')[0]);
  }, []);

  // Fetch Courses on Mount
useEffect(() => {
  async function fetchCourses() {
    setLoadingCourses(true);
    
    // Debug: Log environment check
    console.log("Supabase URL Configured:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "YES" : "NO");

    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      // Print detailed properties of the error
      console.error('Full Supabase Error Object:', error);
      console.error('Message:', error.message);
      console.error('Details:', error.details);
      console.error('Hint:', error.hint);
      console.error('Code:', error.code);

      setErrorMessage(`Failed to load courses: ${error.message || 'Check browser console'}`);
    } else if (data) {
      console.log('Courses fetched successfully:', data);
      setCourses(data);
      if (data.length > 0) {
        setSelectedCourseId(data[0].id);
      }
    }
    setLoadingCourses(false);
  }

  fetchCourses();
}, []);

  // Fetch Tees whenever Selected Course Changes
  useEffect(() => {
    if (!selectedCourseId) return;

    async function fetchTees() {
      setLoadingTees(true);
      const { data, error } = await supabase
        .from('tees')
        .select('*')
        .eq('course_id', selectedCourseId)
        .order('course_rating', { ascending: false });

      if (error) {
        console.error('Error fetching tees:', error);
      } else if (data) {
        setAvailableTees(data);
        if (data.length > 0) {
          const defaultTeeId = data[0].id;
          setPlayers((prev) =>
            prev.map((p) => ({ ...p, teeId: p.teeId || defaultTeeId }))
          );
        }
      }
      setLoadingTees(false);
    }

    fetchTees();
  }, [selectedCourseId]);

  // Player Handlers
  const handleAddPlayer = () => {
    if (players.length >= 8) return;
    const defaultTeeId = availableTees.length > 0 ? availableTees[0].id : '';
    setPlayers([...players, { name: '', teeId: defaultTeeId }]);
  };

  const handleRemovePlayer = (index: number) => {
    if (players.length <= 1) return;
    setPlayers(players.filter((_, i) => i !== index));
  };

  const handlePlayerNameChange = (index: number, name: string) => {
    const updated = [...players];
    updated[index].name = name;
    setPlayers(updated);
  };

  const handlePlayerTeeChange = (index: number, teeId: string) => {
    const updated = [...players];
    updated[index].teeId = teeId;
    setPlayers(updated);
  };

  // Generate Session Access Code (e.g. JKT-4921)
  const generateAccessCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'JKT-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // Session Generation Trigger
  const handleGenerateSession = async () => {
    setErrorMessage(null);

    if (!selectedCourseId) {
      setErrorMessage('Please select a golf course.');
      return;
    }

    const validPlayers = players.filter((p) => p.name.trim() !== '');
    if (validPlayers.length === 0) {
      setErrorMessage('Please enter at least one player name.');
      return;
    }

    setIsGenerating(true);

    try {
      const accessCode = generateAccessCode();

      // 1. Insert Session
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          access_code: accessCode,
          course_id: selectedCourseId,
          play_date: playDate || new Date().toISOString().split('T')[0],
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // 2. Insert Players
      const playersToInsert = validPlayers.map((p) => ({
        session_id: sessionData.id,
        name: p.name.trim(),
        tee_id: p.teeId || availableTees[0]?.id,
      }));

      const { error: playersError } = await supabase
        .from('players')
        .insert(playersToInsert);

      if (playersError) throw playersError;

      // 3. Success State
      const shareUrl = `${window.location.origin}/s/${accessCode}`;
      setGeneratedSession({ accessCode, url: shareUrl });
    } catch (err: any) {
      console.error('Failed to generate session:', err);
      setErrorMessage(err.message || 'Error generating session. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyUrl = () => {
    if (!generatedSession) return;
    navigator.clipboard.writeText(generatedSession.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Header Banner */}
      <header className="border-b border-amber-500/20 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-amber-500 p-2 rounded-lg text-slate-950 font-bold shadow-lg shadow-amber-500/20">
              <Flag className="w-5 h-5 fill-slate-950" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight uppercase text-white">
                glf<span className="text-amber-400">brd</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs font-semibold uppercase tracking-widest text-amber-500/80 border-l border-slate-700 pl-2">
                Tour Session Leaderboards
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-1 text-xs font-medium text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700/60">
            <Trophy className="w-3.5 h-3.5 text-amber-400 mr-1" />
            <span>Jabodetabek Edition</span>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2">
            Create Golf Session
          </h1>
          <p className="text-slate-400 text-sm sm:text-base max-w-lg mx-auto">
            Set up your group, choose tees, share the session link, and track live hole-by-hole leaderboards.
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-sm flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-400 hover:text-white font-bold ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Form Container */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5 sm:p-8 space-y-8">
          {/* SECTION 1: WHEN & WHERE */}
          <div>
            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-5">
              <div className="bg-slate-800 p-1.5 rounded text-amber-400">
                <MapPin className="w-4 h-4" />
              </div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-amber-400">
                1. Date & Course Location
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Datepicker */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Date of Play
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={playDate}
                    onChange={(e) => setPlayDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                  />
                  <Calendar className="w-4 h-4 text-slate-500 absolute right-3 top-3 pointer-events-none" />
                </div>
              </div>

              {/* Course Selection */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Golf Course
                </label>
                {loadingCourses ? (
                  <div className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-500 animate-pulse">
                    Loading Jabodetabek courses...
                  </div>
                ) : (
                  <select
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                  >
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.name} ({course.region})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 2: PLAYERS & TEES */}
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-5">
              <div className="flex items-center space-x-2">
                <div className="bg-slate-800 p-1.5 rounded text-amber-400">
                  <User className="w-4 h-4" />
                </div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-amber-400">
                  2. Players & Selected Tees
                </h2>
              </div>
              <span className="text-xs text-slate-500">
                {players.length} of 8 Players
              </span>
            </div>

            <div className="space-y-3">
              {players.map((player, idx) => (
                <div
                  key={idx}
                  className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80"
                >
                  <div className="flex items-center justify-between sm:justify-start gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-400 text-xs font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    {idx === 0 && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                        Host
                      </span>
                    )}
                  </div>

                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder={`Player ${idx + 1} Name`}
                      value={player.name}
                      onChange={(e) => handlePlayerNameChange(idx, e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="w-full sm:w-56">
                    {loadingTees ? (
                      <div className="text-xs text-slate-500 py-2 animate-pulse">
                        Loading tees...
                      </div>
                    ) : (
                      <select
                        value={player.teeId}
                        onChange={(e) => handlePlayerTeeChange(idx, e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                      >
                        {availableTees.map((tee) => (
                          <option key={tee.id} value={tee.id}>
                            {tee.name} Tee ({tee.course_rating} / {tee.slope_rating})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {players.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemovePlayer(idx)}
                      className="self-end sm:self-center text-slate-600 hover:text-red-400 p-2 transition-colors"
                      title="Remove Player"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {players.length < 8 && (
              <button
                type="button"
                onClick={handleAddPlayer}
                className="mt-4 flex items-center justify-center space-x-2 w-full py-2.5 rounded-xl border border-dashed border-slate-700 text-slate-400 hover:text-amber-400 hover:border-amber-500/50 hover:bg-slate-800/40 text-xs font-semibold transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Add Another Player</span>
              </button>
            )}
          </div>

          {/* SECTION 3: GENERATE / PLAY ACTIONS */}
          <div className="pt-4 border-t border-slate-800">
            {!generatedSession ? (
              <button
                type="button"
                onClick={handleGenerateSession}
                disabled={isGenerating}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3.5 px-6 rounded-xl shadow-lg shadow-amber-500/10 flex items-center justify-center space-x-2 transition-all transform active:scale-[0.99] disabled:opacity-50"
              >
                {isGenerating ? (
                  <span>Generating Session...</span>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 fill-slate-950" />
                    <span className="tracking-wide uppercase text-sm">
                      Generate Session
                    </span>
                  </>
                )}
              </button>
            ) : (
              <div className="bg-slate-950 border border-amber-500/40 rounded-xl p-5 space-y-4 animate-fade-in">
                <div className="flex items-center space-x-2 text-emerald-400 text-sm font-semibold">
                  <Check className="w-5 h-5" />
                  <span>Session Created! Code: {generatedSession.accessCode}</span>
                </div>

                <p className="text-xs text-slate-400">
                  Share this unique link with your group on WhatsApp so everyone can follow or submit scores:
                </p>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={generatedSession.url}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-amber-300 font-mono select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center space-x-1.5 transition-colors border border-slate-700"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-300" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => router.push(`/s/${generatedSession.accessCode}`)}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3.5 px-6 rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center space-x-2 transition-all transform active:scale-[0.99]"
                >
                  <Play className="w-5 h-5 fill-slate-950" />
                  <span className="tracking-wide uppercase text-sm">
                    Enter Session Screen & Play
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}