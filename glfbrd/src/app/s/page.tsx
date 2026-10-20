'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Session, Course, Tee, Hole, HoleDistance, Player, Score } from '@/types/database';
import { Flag, Trophy, UserCheck, RefreshCw, CheckCircle2, Share2, ArrowLeft } from 'lucide-react';

function SessionContent() {
  const searchParams = useSearchParams();
  const rawAccessCode = searchParams.get('code') || '';
  const accessCode = rawAccessCode.toUpperCase();
  const router = useRouter();

  // Data State
  const [session, setSession] = useState<Session | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [tees, setTees] = useState<Tee[]>([]);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [distances, setDistances] = useState<HoleDistance[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState<Score[]>([]);

  // UI State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Player Identification State
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [tempPlayerId, setTempPlayerId] = useState<string | null>(null);
  const [isIdentified, setIsIdentified] = useState<boolean>(false);

  // Score Input Modal State
  const [activeHole, setActiveHole] = useState<Hole | null>(null);
  const [scoreInput, setScoreInput] = useState<string>('');
  const [isSavingScore, setIsSavingScore] = useState<boolean>(false);
  const [copiedShare, setCopiedShare] = useState<boolean>(false);

  // 1. Fetch Session Data & Setup Realtime Listener
  useEffect(() => {
    if (!accessCode) {
      setLoading(false);
      setError('No session code provided in URL.');
      return;
    }

    async function loadSessionData() {
      setLoading(true);
      setError(null);

      try {
        // Fetch Session
        const { data: sessionData, error: sessionErr } = await supabase
          .from('sessions')
          .select('*')
          .eq('access_code', accessCode)
          .single();

        if (sessionErr || !sessionData) {
          setError(`Session "${accessCode}" not found. Please check the access code.`);
          setLoading(false);
          return;
        }

        setSession(sessionData);

        // Fetch Course, Tees, Holes, Players, Scores
        const [courseRes, teesRes, holesRes, playersRes, scoresRes] = await Promise.all([
          supabase.from('courses').select('*').eq('id', sessionData.course_id).single(),
          supabase.from('tees').select('*').eq('course_id', sessionData.course_id),
          supabase.from('holes').select('*').eq('course_id', sessionData.course_id).order('hole_number', { ascending: true }),
          supabase.from('players').select('*').eq('session_id', sessionData.id),
          supabase.from('scores').select('*').eq('session_id', sessionData.id),
        ]);

        if (courseRes.data) setCourse(courseRes.data);
        if (teesRes.data) setTees(teesRes.data);
        if (holesRes.data) setHoles(holesRes.data);
        if (playersRes.data) setPlayers(playersRes.data);
        if (scoresRes.data) setScores(scoresRes.data);

        // Fetch Hole Distances
        if (holesRes.data && holesRes.data.length > 0) {
          const holeIds = holesRes.data.map((h) => h.id);
          const { data: distData } = await supabase
            .from('hole_distances')
            .select('*')
            .in('hole_id', holeIds);

          if (distData) setDistances(distData);
        }

        // Check LocalStorage for previously identified player in this session
        const storedPlayerId = localStorage.getItem(`glfbrd_identified_${sessionData.id}`);
        if (storedPlayerId && playersRes.data?.some((p) => p.id === storedPlayerId)) {
          setSelectedPlayerId(storedPlayerId);
          setIsIdentified(true);
        }

      } catch (err: any) {
        console.error('Error loading session:', err);
        setError('Failed to load session details.');
      } finally {
        setLoading(false);
      }
    }

    loadSessionData();

    // Realtime Subscriptions for Scores
    const channel = supabase
      .channel(`session_scores_${accessCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scores' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newScore = payload.new as Score;
            setScores((prev) => {
              const filtered = prev.filter(
                (s) => !(s.player_id === newScore.player_id && s.hole_id === newScore.hole_id)
              );
              return [...filtered, newScore];
            });
          } else if (payload.eventType === 'DELETE') {
            const deletedScore = payload.old as Score;
            setScores((prev) => prev.filter((s) => s.id !== deletedScore.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accessCode]);

  // Player Identification Confirmation
  const handleConfirmPlayer = () => {
    if (!tempPlayerId || !session) return;
    setSelectedPlayerId(tempPlayerId);
    setIsIdentified(true);
    localStorage.setItem(`glfbrd_identified_${session.id}`, tempPlayerId);
  };

  const handleSwitchPlayer = () => {
    setIsIdentified(false);
    setTempPlayerId(selectedPlayerId);
  };

  // Score Box Click Handler
  const handleOpenScoreModal = (hole: Hole) => {
    if (!selectedPlayerId) return;
    setActiveHole(hole);

    const existing = scores.find(
      (s) => s.player_id === selectedPlayerId && s.hole_id === hole.id
    );
    setScoreInput(existing ? String(existing.strokes) : '');
  };

  // Submit Score to Supabase (Idempotent Upsert)
  const handleSaveScore = async () => {
    if (!activeHole || !selectedPlayerId || !session) return;

    const numScore = parseInt(scoreInput.trim(), 10);
    if (isNaN(numScore) || numScore < 1) {
      alert('Please enter a valid stroke count.');
      return;
    }

    setIsSavingScore(true);

    try {
      const { data, error } = await supabase
        .from('scores')
        .upsert(
          {
            session_id: session.id,
            player_id: selectedPlayerId,
            hole_id: activeHole.id,
            strokes: numScore,
          },
          { onConflict: 'session_id,player_id,hole_id' }
        )
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        const savedScore = data[0];
        setScores((prev) => {
          const filtered = prev.filter(
            (s) => !(s.player_id === savedScore.player_id && s.hole_id === savedScore.hole_id)
          );
          return [...filtered, savedScore];
        });
      }

      setActiveHole(null);
      setScoreInput('');
    } catch (err: any) {
      console.error('Error saving score:', err?.message || err);
      alert(`Failed to save score: ${err?.message || 'Check database permissions'}`);
    } finally {
      setIsSavingScore(false);
    }
  };

  // Helper: Get distance in meters for specific hole and player's tee
  const getDistanceForHole = (holeId: string, playerTeeId?: string) => {
    if (!playerTeeId) return '-';
    const dist = distances.find(
      (d) => d.hole_id === holeId && d.tee_id === playerTeeId
    );
    return dist ? `${dist.distance_meters}` : '-';
  };

  // Active Identified Player Object
  const activePlayer = players.find((p) => p.id === selectedPlayerId);
  const activePlayerTee = tees.find((t) => t.id === activePlayer?.tee_id);

  // Scorecard Nine-Split Logic & Totals
  const frontHoles = holes.filter((h) => h.hole_number <= 9);
  const backHoles = holes.filter((h) => h.hole_number >= 10);

  const frontParTotal = frontHoles.reduce((sum, h) => sum + h.par, 0);
  const backParTotal = backHoles.reduce((sum, h) => sum + h.par, 0);
  const grandParTotal = frontParTotal + backParTotal;

  const frontDistTotal = activePlayer?.tee_id
    ? frontHoles.reduce((sum, h) => {
        const d = distances.find((dist) => dist.hole_id === h.id && dist.tee_id === activePlayer.tee_id);
        return sum + (d?.distance_meters || 0);
      }, 0)
    : 0;

  const backDistTotal = activePlayer?.tee_id
    ? backHoles.reduce((sum, h) => {
        const d = distances.find((dist) => dist.hole_id === h.id && dist.tee_id === activePlayer.tee_id);
        return sum + (d?.distance_meters || 0);
      }, 0)
    : 0;

  const grandDistTotal = frontDistTotal + backDistTotal;

  // Active Player Stroke Calculations
  const playerScores = activePlayer ? scores.filter((s) => s.player_id === activePlayer.id) : [];

  const frontPlayerScores = frontHoles.map((h) => playerScores.find((s) => s.hole_id === h.id)).filter(Boolean) as Score[];
  const frontStrokesTotal = frontPlayerScores.reduce((sum, s) => sum + s.strokes, 0);

  const backPlayerScores = backHoles.map((h) => playerScores.find((s) => s.hole_id === h.id)).filter(Boolean) as Score[];
  const backStrokesTotal = backPlayerScores.reduce((sum, s) => sum + s.strokes, 0);

  const grandStrokesTotal = frontStrokesTotal + backStrokesTotal;
  const grandHolesPlayedTotal = frontPlayerScores.length + backPlayerScores.length;

  // Render Hole Score Badge with Golf Formatting Shapes
  const renderScoreShape = (strokes: number | undefined, par: number) => {
    if (strokes === undefined || strokes === null) return null;

    const diff = strokes - par;

    // Eagle or better (-2 or less): Double Circle
    if (diff <= -2) {
      return (
        <div className="relative flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-amber-400 bg-amber-500/20 text-amber-300 font-black text-xs sm:text-sm shadow-md">
          <div className="absolute inset-0.5 rounded-full border border-amber-400" />
          {strokes}
        </div>
      );
    }
    // Birdie (-1): Single Circle
    if (diff === -1) {
      return (
        <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-amber-400 text-amber-400 font-bold text-xs sm:text-sm bg-amber-400/10">
          {strokes}
        </div>
      );
    }
    // Par (0): Standard clean text
    if (diff === 0) {
      return (
        <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 text-white font-bold text-xs sm:text-sm">
          {strokes}
        </div>
      );
    }
    // Bogey (+1): Single Square
    if (diff === 1) {
      return (
        <div className="flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 border-2 border-slate-400 text-slate-300 font-bold text-xs sm:text-sm">
          {strokes}
        </div>
      );
    }
    // Double Bogey or worse (+2 or higher): Double Square
    return (
      <div className="relative flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 border-2 border-slate-500 bg-slate-900 text-slate-300 font-bold text-xs sm:text-sm">
        <div className="absolute inset-0.5 border border-slate-500" />
        {strokes}
      </div>
    );
  };

  // Compute Live Leaderboard (Deduplicated by Hole ID)
  const leaderboard = players.map((player) => {
    // Map hole_id -> latest score for this player to prevent duplicates
    const uniqueScoresMap = new Map<string, Score>();
    scores
      .filter((s) => s.player_id === player.id)
      .forEach((s) => uniqueScoresMap.set(s.hole_id, s));

    const uniquePlayerScores = Array.from(uniqueScoresMap.values());
    const holesPlayed = uniquePlayerScores.length;

    let totalStrokes = 0;
    let totalParPlayed = 0;

    uniquePlayerScores.forEach((s) => {
      const h = holes.find((hole) => hole.id === s.hole_id);
      if (h) {
        totalStrokes += s.strokes;
        totalParPlayed += h.par;
      }
    });

    const relativeToPar = totalStrokes - totalParPlayed;

    return {
      player,
      holesPlayed,
      totalStrokes,
      relativeToPar,
    };
  });

  // Sort Leaderboard
  leaderboard.sort((a, b) => {
    if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0;
    if (a.holesPlayed === 0) return 1;
    if (b.holesPlayed === 0) return -1;

    if (a.relativeToPar !== b.relativeToPar) {
      return a.relativeToPar - b.relativeToPar;
    }
    if (b.holesPlayed !== a.holesPlayed) {
      return b.holesPlayed - a.holesPlayed;
    }
    return a.totalStrokes - b.totalStrokes;
  });

  // Format Leaderboard Ties (e.g. T1, T2)
  let currentRank = 1;
  const formattedLeaderboard = leaderboard.map((item, idx, arr) => {
    if (idx > 0) {
      const prev = arr[idx - 1];
      const isTied =
        item.holesPlayed > 0 &&
        item.relativeToPar === prev.relativeToPar &&
        item.holesPlayed === prev.holesPlayed;

      if (!isTied) {
        currentRank = idx + 1;
      }
    }

    const tieCount = arr.filter(
      (x) =>
        x.holesPlayed > 0 &&
        x.relativeToPar === item.relativeToPar &&
        x.holesPlayed === item.holesPlayed
    ).length;

    const rankDisplay =
      item.holesPlayed === 0
        ? '-'
        : tieCount > 1
        ? `T${currentRank}`
        : `${currentRank}`;

    let scoreDisplay = '-';
    if (item.holesPlayed > 0) {
      if (item.relativeToPar === 0) scoreDisplay = 'E';
      else if (item.relativeToPar > 0) scoreDisplay = `+${item.relativeToPar}`;
      else scoreDisplay = `${item.relativeToPar}`;
    }

    return {
      ...item,
      rankDisplay,
      scoreDisplay,
    };
  });

  // Share Link Handler
  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-3">
          <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
          <p className="text-sm text-slate-400 font-medium">Loading session gameplay...</p>
        </div>
      </div>
    );
  }

  if (error || !session || !course) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
          <h2 className="text-xl font-bold text-red-400">Session Error</h2>
          <p className="text-sm text-slate-400">{error || 'Unable to find session.'}</p>
          <button
            onClick={() => router.push('/')}
            className="w-full py-3 bg-amber-500 text-slate-950 font-bold rounded-xl hover:bg-amber-400 transition-colors"
          >
            Return to Home Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16 selection:bg-amber-500 selection:text-slate-950">
      {/* Header Banner */}
      <header className="border-b border-amber-500/20 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => router.push('/')}
              className="p-1.5 text-slate-400 hover:text-white transition-colors"
              title="Home"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center space-x-2">
              <div className="bg-amber-500 p-1.5 rounded-lg text-slate-950 font-bold">
                <Flag className="w-4 h-4 fill-slate-950" />
              </div>
              <span className="text-lg font-black tracking-tight text-white uppercase">
                glf<span className="text-amber-400">brd</span>
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="bg-slate-800 border border-slate-700/60 text-amber-400 font-mono font-bold text-xs px-2.5 py-1 rounded-md">
              {accessCode}
            </span>
            <button
              onClick={handleShare}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
              title="Share Session Link"
            >
              {copiedShare ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-6 space-y-8">
        {/* Course Banner */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
              Live Golf Session
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {course.name}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {course.region} • {session.play_date}
            </p>
          </div>

          {/* Scoring As Badge */}
          {isIdentified && activePlayer && (
            <div className="flex items-center justify-between sm:justify-end gap-3 bg-slate-950/80 border border-slate-800 px-3.5 py-2 rounded-xl">
              <div className="text-left">
                <div className="text-[10px] uppercase font-semibold text-slate-400">Scoring As</div>
                <div className="text-sm font-bold text-amber-300 flex items-center space-x-1">
                  <span>{activePlayer.name}</span>
                  {activePlayerTee && (
                    <span className="text-[10px] text-slate-400 font-normal">
                      ({activePlayerTee.name} Tee)
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={handleSwitchPlayer}
                className="text-xs text-slate-400 hover:text-amber-400 underline font-medium"
              >
                Change
              </button>
            </div>
          )}
        </div>

        {/* PLAYER IDENTIFICATION ONBOARDING */}
        {!isIdentified && (
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-6 shadow-2xl space-y-6 animate-fade-in">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-2">
                <UserCheck className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-black text-white">Who are you?</h2>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Select your name to start entering hole scores for this session.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {players.map((p) => {
                const playerTee = tees.find((t) => t.id === p.tee_id);
                const isSelected = tempPlayerId === p.id;

                return (
                  <button
                    key={p.id}
                    onClick={() => setTempPlayerId(p.id)}
                    className={`p-4 rounded-xl border text-left flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500 text-white shadow-lg shadow-amber-500/10 scale-[1.01]'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm">{p.name}</div>
                      {playerTee && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          {playerTee.name} Tee ({playerTee.course_rating} / {playerTee.slope_rating})
                        </div>
                      )}
                    </div>
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0" />}
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleConfirmPlayer}
              disabled={!tempPlayerId}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold uppercase text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-40"
            >
              Start Scoring
            </button>
          </div>
        )}

        {/* 18-HOLE SPLIT SCORECARD SECTION */}
        {isIdentified && activePlayer && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-amber-400">
                  Interactive Scorecard
                </h2>
                <p className="text-xs text-slate-400">
                  Tap any score box to enter or edit your hole score.
                </p>
              </div>
              <span className="text-xs text-slate-500 font-mono">18 Holes</span>
            </div>

            {/* FRONT NINE (HOLES 1 - 9) */}
            <div className="space-y-2">
              <div className="text-xs font-extrabold uppercase tracking-widest text-slate-400 flex items-center justify-between px-1">
                <span>Front Nine (Out)</span>
                <span className="text-amber-400 font-mono">
                  {frontPlayerScores.length > 0 ? `${frontStrokesTotal} Strokes` : `Par ${frontParTotal}`}
                </span>
              </div>
              <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                <div className="min-w-[340px]">
                  {/* Front Hole Numbers Header */}
                  <div className="grid grid-cols-[60px_repeat(9,minmax(26px,1fr))_48px] bg-slate-950 text-[11px] font-bold text-slate-400 border border-slate-800 rounded-t-xl text-center divide-x divide-slate-800">
                    <div className="py-2 px-1 text-left text-slate-300 pl-2">Hole</div>
                    {frontHoles.map((h) => (
                      <div key={h.id} className="py-2">
                        {h.hole_number}
                      </div>
                    ))}
                    <div className="py-2 bg-amber-500/10 text-amber-400 font-black">OUT</div>
                  </div>

                  {/* Front Par Row */}
                  <div className="grid grid-cols-[60px_repeat(9,minmax(26px,1fr))_48px] bg-slate-900/90 text-[11px] font-semibold text-slate-400 border-x border-b border-slate-800 text-center divide-x divide-slate-800">
                    <div className="py-1.5 px-1 text-left uppercase text-[10px] pl-2">Par</div>
                    {frontHoles.map((h) => (
                      <div key={h.id} className="py-1.5 text-slate-300 font-mono">
                        {h.par}
                      </div>
                    ))}
                    <div className="py-1.5 font-bold font-mono text-slate-200 bg-amber-500/10">{frontParTotal}</div>
                  </div>

                  {/* Front Distance Row */}
                  <div className="grid grid-cols-[60px_repeat(9,minmax(26px,1fr))_48px] bg-slate-900/60 text-[10px] text-slate-500 border-x border-b border-slate-800 text-center divide-x divide-slate-800">
                    <div className="py-1 px-1 text-left uppercase text-[9px] pl-2">Dist</div>
                    {frontHoles.map((h) => (
                      <div key={h.id} className="py-1 font-mono text-[9px]">
                        {getDistanceForHole(h.id, activePlayer.tee_id)}
                      </div>
                    ))}
                    <div className="py-1 font-mono text-[9px] text-slate-400 bg-amber-500/5">{frontDistTotal ? `${frontDistTotal}m` : '-'}</div>
                  </div>

                  {/* Front Handicap Row */}
                  <div className="grid grid-cols-[60px_repeat(9,minmax(26px,1fr))_48px] bg-slate-900/40 text-[10px] text-slate-500 border-x border-b border-slate-800 text-center divide-x divide-slate-800">
                    <div className="py-1 px-1 text-left uppercase text-[9px] pl-2">HCP</div>
                    {frontHoles.map((h) => (
                      <div key={h.id} className="py-1 font-mono text-[9px]">
                        {h.handicap_index}
                      </div>
                    ))}
                    <div className="py-1 font-mono text-[9px] text-slate-600 bg-amber-500/5">-</div>
                  </div>

                  {/* Front Score Interactive Row */}
                  <div className="grid grid-cols-[60px_repeat(9,minmax(26px,1fr))_48px] bg-slate-950/80 border-x border-b border-slate-800 rounded-b-xl text-center divide-x divide-slate-800 items-center">
                    <div className="py-3 px-1 text-left font-bold text-xs text-amber-400 truncate pl-2">
                      Score
                    </div>
                    {frontHoles.map((h) => {
                      const existingScore = scores.find(
                        (s) => s.player_id === activePlayer.id && s.hole_id === h.id
                      );

                      return (
                        <button
                          key={h.id}
                          onClick={() => handleOpenScoreModal(h)}
                          className="py-2 flex items-center justify-center hover:bg-amber-500/10 transition-colors focus:outline-none"
                        >
                          {existingScore ? (
                            renderScoreShape(existingScore.strokes, h.par)
                          ) : (
                            <span className="w-6 h-6 rounded border border-dashed border-slate-700 hover:border-amber-400 flex items-center justify-center text-slate-600 text-xs font-mono">
                              -
                            </span>
                          )}
                        </button>
                      );
                    })}
                    <div className="py-2.5 font-black text-sm font-mono text-amber-300 bg-amber-500/10">
                      {frontPlayerScores.length > 0 ? frontStrokesTotal : '-'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* BACK NINE (HOLES 10 - 18) & TOTALS */}
            <div className="space-y-2 pt-2">
              <div className="text-xs font-extrabold uppercase tracking-widest text-slate-400 flex items-center justify-between px-1">
                <span>Back Nine (In) & Total</span>
                <span className="text-amber-400 font-mono">
                  {backPlayerScores.length > 0 ? `${backStrokesTotal} Strokes` : `Par ${backParTotal}`}
                </span>
              </div>
              <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                <div className="min-w-[360px]">
                  {/* Back Hole Numbers Header */}
                  <div className="grid grid-cols-[60px_repeat(9,minmax(26px,1fr))_44px_48px] bg-slate-950 text-[11px] font-bold text-slate-400 border border-slate-800 rounded-t-xl text-center divide-x divide-slate-800">
                    <div className="py-2 px-1 text-left text-slate-300 pl-2">Hole</div>
                    {backHoles.map((h) => (
                      <div key={h.id} className="py-2">
                        {h.hole_number}
                      </div>
                    ))}
                    <div className="py-2 bg-amber-500/10 text-amber-400 font-black">IN</div>
                    <div className="py-2 bg-amber-500 text-slate-950 font-black">TOT</div>
                  </div>

                  {/* Back Par Row */}
                  <div className="grid grid-cols-[60px_repeat(9,minmax(26px,1fr))_44px_48px] bg-slate-900/90 text-[11px] font-semibold text-slate-400 border-x border-b border-slate-800 text-center divide-x divide-slate-800">
                    <div className="py-1.5 px-1 text-left uppercase text-[10px] pl-2">Par</div>
                    {backHoles.map((h) => (
                      <div key={h.id} className="py-1.5 text-slate-300 font-mono">
                        {h.par}
                      </div>
                    ))}
                    <div className="py-1.5 font-bold font-mono text-slate-200 bg-amber-500/10">{backParTotal}</div>
                    <div className="py-1.5 font-black font-mono text-slate-100 bg-amber-500/20">{grandParTotal}</div>
                  </div>

                  {/* Back Distance Row */}
                  <div className="grid grid-cols-[60px_repeat(9,minmax(26px,1fr))_44px_48px] bg-slate-900/60 text-[10px] text-slate-500 border-x border-b border-slate-800 text-center divide-x divide-slate-800">
                    <div className="py-1 px-1 text-left uppercase text-[9px] pl-2">Dist</div>
                    {backHoles.map((h) => (
                      <div key={h.id} className="py-1 font-mono text-[9px]">
                        {getDistanceForHole(h.id, activePlayer.tee_id)}
                      </div>
                    ))}
                    <div className="py-1 font-mono text-[9px] text-slate-400 bg-amber-500/5">{backDistTotal ? `${backDistTotal}m` : '-'}</div>
                    <div className="py-1 font-mono text-[9px] text-slate-300 bg-amber-500/10">{grandDistTotal ? `${grandDistTotal}m` : '-'}</div>
                  </div>

                  {/* Back Handicap Row */}
                  <div className="grid grid-cols-[60px_repeat(9,minmax(26px,1fr))_44px_48px] bg-slate-900/40 text-[10px] text-slate-500 border-x border-b border-slate-800 text-center divide-x divide-slate-800">
                    <div className="py-1 px-1 text-left uppercase text-[9px] pl-2">HCP</div>
                    {backHoles.map((h) => (
                      <div key={h.id} className="py-1 font-mono text-[9px]">
                        {h.handicap_index}
                      </div>
                    ))}
                    <div className="py-1 font-mono text-[9px] text-slate-600 bg-amber-500/5">-</div>
                    <div className="py-1 font-mono text-[9px] text-slate-600 bg-amber-500/10">-</div>
                  </div>

                  {/* Back Score Interactive Row */}
                  <div className="grid grid-cols-[60px_repeat(9,minmax(26px,1fr))_44px_48px] bg-slate-950/80 border-x border-b border-slate-800 rounded-b-xl text-center divide-x divide-slate-800 items-center">
                    <div className="py-3 px-1 text-left font-bold text-xs text-amber-400 truncate pl-2">
                      Score
                    </div>
                    {backHoles.map((h) => {
                      const existingScore = scores.find(
                        (s) => s.player_id === activePlayer.id && s.hole_id === h.id
                      );

                      return (
                        <button
                          key={h.id}
                          onClick={() => handleOpenScoreModal(h)}
                          className="py-2 flex items-center justify-center hover:bg-amber-500/10 transition-colors focus:outline-none"
                        >
                          {existingScore ? (
                            renderScoreShape(existingScore.strokes, h.par)
                          ) : (
                            <span className="w-6 h-6 rounded border border-dashed border-slate-700 hover:border-amber-400 flex items-center justify-center text-slate-600 text-xs font-mono">
                              -
                            </span>
                          )}
                        </button>
                      );
                    })}
                    <div className="py-2.5 font-black text-sm font-mono text-amber-300 bg-amber-500/10">
                      {backPlayerScores.length > 0 ? backStrokesTotal : '-'}
                    </div>
                    <div className="py-2.5 font-black text-sm font-mono text-amber-400 bg-amber-500/20">
                      {grandHolesPlayedTotal > 0 ? grandStrokesTotal : '-'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* LIVE LEADERBOARD SECTION */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                Live Leaderboard
              </h2>
            </div>
            <span className="text-xs font-semibold text-emerald-400 flex items-center space-x-1 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />
              Live Realtime
            </span>
          </div>

          {/* Leaderboard Table */}
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3 text-center w-12">Pos</th>
                  <th className="py-3 px-4">Player</th>
                  <th className="py-3 px-3 text-center">Score</th>
                  <th className="py-3 px-3 text-center">Thru</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-medium">
                {formattedLeaderboard.map((item) => {
                  const isCurrent = item.player.id === selectedPlayerId;
                  const playerTee = tees.find((t) => t.id === item.player.tee_id);

                  return (
                    <tr
                      key={item.player.id}
                      className={`transition-colors ${
                        isCurrent
                          ? 'bg-amber-500/10 text-amber-300 font-bold'
                          : 'hover:bg-slate-900/60 text-slate-200'
                      }`}
                    >
                      {/* Position */}
                      <td className="py-3.5 px-3 text-center font-black text-xs font-mono">
                        {item.rankDisplay}
                      </td>

                      {/* Player Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold">{item.player.name}</span>
                          {isCurrent && (
                            <span className="text-[9px] bg-amber-500 text-slate-950 font-black px-1.5 py-0.2 rounded uppercase">
                              You
                            </span>
                          )}
                        </div>
                        {playerTee && (
                          <div className="text-[10px] text-slate-500 font-normal">
                            {playerTee.name} Tee
                          </div>
                        )}
                      </td>

                      {/* Score To Par */}
                      <td className="py-3.5 px-3 text-center font-black text-sm font-mono">
                        <span
                          className={
                            item.scoreDisplay.startsWith('-')
                              ? 'text-amber-400'
                              : item.scoreDisplay === 'E'
                              ? 'text-emerald-400'
                              : item.scoreDisplay.startsWith('+')
                              ? 'text-slate-300'
                              : 'text-slate-600'
                          }
                        >
                          {item.scoreDisplay}
                        </span>
                      </td>

                      {/* Holes Played / Final Score */}
                      <td className="py-3.5 px-3 text-center font-mono text-xs text-slate-400">
                        {item.holesPlayed === 18 ? (
                          <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            {item.totalStrokes} (F)
                          </span>
                        ) : (
                          <span>{item.holesPlayed > 0 ? item.holesPlayed : '-'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* SCORE INPUT MODAL KEYPAD */}
      {activeHole && activePlayer && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-white">
                  Hole {activeHole.hole_number} Score
                </h3>
                <p className="text-xs text-slate-400">
                  Par {activeHole.par} • HCP {activeHole.handicap_index} • {getDistanceForHole(activeHole.id, activePlayer.tee_id)}m
                </p>
              </div>
              <button
                onClick={() => setActiveHole(null)}
                className="text-slate-500 hover:text-white font-bold text-lg p-1"
              >
                ✕
              </button>
            </div>

            {/* Numerical Input Box */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Total Strokes
              </label>
              <input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                autoFocus
                placeholder="Enter score (e.g. 4)"
                value={scoreInput}
                onChange={(e) => setScoreInput(e.target.value)}
                className="w-full bg-slate-950 border border-amber-500/50 rounded-xl px-4 py-3.5 text-center text-2xl font-black font-mono text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Quick Score Shortcuts */}
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => setScoreInput(String(Math.max(1, activeHole.par - 1)))}
                className="py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold rounded-lg border border-amber-500/30"
              >
                Birdie ({activeHole.par - 1})
              </button>
              <button
                onClick={() => setScoreInput(String(activeHole.par))}
                className="py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg border border-slate-700"
              >
                Par ({activeHole.par})
              </button>
              <button
                onClick={() => setScoreInput(String(activeHole.par + 1))}
                className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-slate-700"
              >
                Bogey ({activeHole.par + 1})
              </button>
              <button
                onClick={() => setScoreInput(String(activeHole.par + 2))}
                className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-bold rounded-lg border border-slate-700"
              >
                Double ({activeHole.par + 2})
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveHole(null)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveScore}
                disabled={isSavingScore || !scoreInput.trim()}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all disabled:opacity-50"
              >
                {isSavingScore ? 'Saving...' : 'Save Score'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SessionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
          <div className="flex flex-col items-center space-y-3">
            <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
            <p className="text-sm text-slate-400 font-medium">Loading session...</p>
          </div>
        </div>
      }
    >
      <SessionContent />
    </Suspense>
  );
}