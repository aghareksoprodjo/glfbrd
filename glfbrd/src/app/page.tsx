'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSessionShareUrl } from '@/lib/utils';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface Course {
  id: string;
  name: string;
  location?: string;
}

export default function HomePage() {
  const router = useRouter();

  // Form state
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [groupName, setGroupName] = useState<string>('');
  const [hostName, setHostName] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Join session state
  const [inputCode, setInputCode] = useState<string>('');

  // Created session view state
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    async function fetchCourses() {
      const { data, error } = await supabase
        .from('courses')
        .select('id, name, location')
        .order('name');

      if (!error && data) {
        setCourses(data);
        if (data.length > 0) setSelectedCourseId(data[0].id);
      }
    }
    fetchCourses();
  }, []);

  const generateAccessCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let randomStr = '';
    for (let i = 0; i < 4; i++) {
      randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `JKT-${randomStr}`;
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId || !hostName.trim()) return;

    setIsLoading(true);
    const accessCode = generateAccessCode();

    try {
      // 1. Create new session
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          course_id: selectedCourseId,
          group_name: groupName.trim() || 'Golf Group',
          access_code: accessCode,
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // 2. Add Host as player
      if (session) {
        const { error: playerError } = await supabase
          .from('players')
          .insert({
            session_id: session.id,
            name: hostName.trim(),
          });

        if (playerError) console.error('Error adding host player:', playerError);
      }

      setCreatedCode(accessCode);
    } catch (err) {
      console.error('Failed to create session:', err);
      alert('Failed to create session. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) return;
    const cleanCode = inputCode.trim().toUpperCase();
    router.push(`/s?code=${encodeURIComponent(cleanCode)}`);
  };

  const handleCopyLink = () => {
    if (!createdCode) return;
    const url = getSessionShareUrl(createdCode);
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareUrl = createdCode ? getSessionShareUrl(createdCode) : '';

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-slate-800 rounded-2xl shadow-xl p-6 border border-slate-700 space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-emerald-400">glfbrd</h1>
          <p className="text-xs text-slate-400">Live Golf Scorecards & Leaderboards • Jabodetabek</p>
        </div>

        {/* Success View after Session Creation */}
        {createdCode ? (
          <div className="space-y-5 text-center">
            <div className="bg-emerald-950/50 border border-emerald-500/30 rounded-xl p-4 space-y-1">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Session Created</span>
              <div className="text-3xl font-mono font-bold text-white tracking-widest">{createdCode}</div>
            </div>

            <div className="space-y-2 text-left">
              <label className="text-xs font-medium text-slate-400">Share Link for Players</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg transition-colors shrink-0"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <button
              onClick={() => router.push(`/s?code=${createdCode}`)}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-lg transition-colors"
            >
              Enter Scorecard
            </button>
          </div>
        ) : (
          /* Create & Join Forms */
          <div className="space-y-6">
            <form onSubmit={handleCreateSession} className="space-y-4">
              <h2 className="text-base font-semibold text-white border-b border-slate-700 pb-2">Start a New Round</h2>
              
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Golf Course</label>
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                >
                  {courses.length === 0 ? (
                    <option value="">Loading courses...</option>
                  ) : (
                    courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.name} {course.location ? `(${course.location})` : ''}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Group / Round Name</label>
                <input
                  type="text"
                  placeholder="e.g. Sunday Morning Fourball"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Your Name (Host)</label>
                <input
                  type="text"
                  placeholder="e.g. Agha"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl shadow-lg transition-colors"
              >
                {isLoading ? 'Creating Session...' : 'Create Round'}
              </button>
            </form>

            <div className="relative pt-2">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-slate-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-slate-800 px-2 text-slate-400">Or Join Session</span>
              </div>
            </div>

            <form onSubmit={handleJoinSession} className="flex gap-2">
              <input
                type="text"
                placeholder="Session Code (e.g. JKT-A1B2)"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 uppercase tracking-wider focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium text-sm rounded-lg transition-colors shrink-0"
              >
                Join
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}