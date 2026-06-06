import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Info, RefreshCw, Lock as LockIcon, Unlock, AlertTriangle } from 'lucide-react';
import Calendar from './Calendar';
import { HOLIDAYS_2026, ROTA_TIMELINES, getDefaultTimelineIdx } from '../constants';
import { Leave, UserRole } from '../types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/utils';
import { isSameDay, isAfter, isBefore, isWithinInterval, startOfDay, format, parseISO } from 'date-fns';

export default function LeaveRequest({ onBack }: { onBack: () => void }) {
  const { profile } = useAuth();
  const [selectedTimelineIdx, setSelectedTimelineIdx] = useState(getDefaultTimelineIdx()); // Default to current
  const [selectedRole, setSelectedRole] = useState<'CCRN' | 'RN'>('RN');
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [stagedDates, setStagedDates] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [isEditModeEnabled, setIsEditModeEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const isAdmin = profile?.roles.includes('Admin');

  const checkIsEditWindowActive = (): boolean => {
    const utc = Date.now();
    // IST is UTC + 5.5 hours
    const istDate = new Date(utc + 5.5 * 60 * 60 * 1000);
    const day = istDate.getUTCDate();
    return day >= 1 && day <= 9;
  };

  const isAutoWindowActive = checkIsEditWindowActive();
  const effectiveEditEnabled = isEditModeEnabled || isAutoWindowActive;

  // Set initial selected role based on user profile
  useEffect(() => {
    if (profile && !isAdmin) {
      if (profile.roles.includes('CCRN')) {
        setSelectedRole('CCRN');
      } else if (profile.roles.includes('RN')) {
        setSelectedRole('RN');
      }
    }
  }, [profile, isAdmin]);
  
  // Logic for filtered timelines for restricted users
  const today = new Date();
  const filteredTimelines = ROTA_TIMELINES.filter((t, idx) => {
    if (isAdmin) return true;
    // Show only the current and past rotas, or up to the current month's rota
    // For simplicity, if index is <= current month's index
    return idx <= today.getMonth() + 1; // Basic logic: current month plus one
  });

  const timeline = ROTA_TIMELINES[selectedTimelineIdx];
  const startDate = useMemo(() => {
    const [y, m, d] = timeline.start.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [timeline.start]);
  
  const endDate = useMemo(() => {
    const [y, m, d] = timeline.end.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [timeline.end]);

  useEffect(() => {
    fetchLeaves();
    fetchSettings();
    
    const channelName = `leaves_lr_changes_${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leaves' }, () => {
        fetchLeaves();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchLeaves = async () => {
    setLoading(true);
    try {
      const { data: leavesData, error: leavesError } = await supabase
        .from('leaves')
        .select('*')
        .eq('type', 'LR');
      
      if (leavesError) throw leavesError;

      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, name');

      const pMap: Record<string, string> = {};
      profilesData?.forEach(p => pMap[p.id] = p.name);
      setProfileMap(pMap);

      if (leavesData) {
        const enrichedLeaves = leavesData.map(l => ({
          ...l,
          user_name: pMap[l.user_id] || l.user_name // Dynamic sync
        }));
        setLeaves(enrichedLeaves);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('key', 'lr_edit_enabled')
      .single();
    
    if (!error && data) setIsEditModeEnabled(data.value);
  };

  const handleToggleEditMode = async () => {
    if (!isAdmin) return;
    const newValue = !isEditModeEnabled;
    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'lr_edit_enabled', value: newValue });
    
    if (!error) setIsEditModeEnabled(newValue);
  };

  const handleDateClick = async (date: Date) => {
    if (!profile) return;
    
    if (!isAdmin && !effectiveEditEnabled) {
      alert("Editing is currently restricted. Leave requests can only be modified automatically between the 1st (00:00 IST) and the 9th (23:59 IST) of every month, or when authorized by an Admin.");
      return;
    }

    // Role-based restriction: Non-admins can only apply in their own role's field
    if (!isAdmin && !profile.roles.includes(selectedRole as UserRole)) {
      alert(`Access Denied: As a ${profile.roles.join('/')}, you cannot apply for leave in the ${selectedRole} field.`);
      return;
    }

    const dStr = format(date, 'yyyy-MM-dd');
    const existingLeave = leaves.find(l => {
      const lDateStr = l.date.includes('T') ? format(parseISO(l.date), 'yyyy-MM-dd') : l.date;
      return lDateStr === dStr && l.locked_for_role === selectedRole;
    });
    
    if (existingLeave) {
      if (existingLeave.user_id === profile.id || isAdmin) {
        // Immediate removal as requested
        const { error } = await supabase.from('leaves').delete().eq('id', existingLeave.id);
        if (!error) {
          // Also remove from staged if it was there (shouldn't be, but safe)
          setStagedDates(prev => prev.filter(d => d !== dStr));
          fetchLeaves();
        }
      } else {
        alert(`This date is already locked by ${existingLeave.user_name}`);
      }
      return;
    }

    // Toggle logic for staged dates
    setStagedDates(prev => {
      if (prev.includes(dStr)) {
        return prev.filter(d => d !== dStr);
      }

      // Check limits (3 dates total including existing ones for this user in this rota)
      const userRotaLeaves = leaves.filter(l => {
        const lDateStr = l.date.includes('T') ? format(parseISO(l.date), 'yyyy-MM-dd') : l.date;
        const sStart = format(startDate, 'yyyy-MM-dd');
        const sEnd = format(endDate, 'yyyy-MM-dd');
        return (
          l.user_id === profile.id && 
          l.locked_for_role === selectedRole &&
          lDateStr >= sStart && lDateStr <= sEnd
        );
      });

      if (!isAdmin && (userRotaLeaves.length + prev.length >= 3)) {
        alert(`Limit reached: You can only select up to 3 individual dates per rota for ${selectedRole}.`);
        return prev;
      }

      return [...prev, dStr];
    });
  };

  const handleSubmit = async () => {
    if (!profile || stagedDates.length === 0) return;
    setSubmitting(true);

    try {
      // Create a unified request entry for these dates in the requests table
      if (stagedDates.length > 0 && profile) {
        const { error: syncError } = await supabase.from('requests').insert({
          user_id: profile.id,
          user_name: profile.name || 'Staff Member',
          action: 'Leave Request (LR) (Planner)',
          dates: stagedDates,
          message: `Requesting ${stagedDates.length} date(s) leave`,
          status: 'pending',
          created_at: new Date().toISOString()
        });
        if (syncError) {
          console.error('Sync to requests failed:', syncError);
          alert("Note: Dates locked on planner, but approval tracker creation failed. Please check Supabase 'requests' table RLS policies.");
        }
      }

      for (const dStr of stagedDates) {
        const existingLeave = leaves.find(l => {
          const lDateStr = l.date.includes('T') ? format(parseISO(l.date), 'yyyy-MM-dd') : l.date;
          return lDateStr === dStr && l.locked_for_role === selectedRole;
        });
        
        if (existingLeave) {
          if (existingLeave.user_id === profile.id || isAdmin) {
            await supabase.from('leaves').delete().eq('id', existingLeave.id);
          }
        } else {
          await supabase.from('leaves').insert({
            user_id: profile.id,
            user_name: profile.name,
            date: dStr, // Store plain date string
            type: 'LR',
            locked_for_role: selectedRole
          });
        }
      }
      setStagedDates([]);
      await fetchLeaves();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Helper date function for limit check
  // ... removed addDays as it is no longer used

  return (
    <div className="min-h-screen p-2 sm:p-4 md:p-8 max-w-7xl mx-auto space-y-4 md:space-y-8">
      {/* Header Section */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 sm:gap-6 px-1 md:px-0">
        <div className="space-y-2 sm:space-y-3">
          <button 
            onClick={onBack}
            className="group flex items-center gap-2 text-white/40 hover:text-orange-400 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em]">Dashboard</span>
          </button>
          <div className="flex items-center gap-2 sm:gap-4">
             <div className="w-1.5 sm:w-2 h-6 sm:h-12 bg-orange-500 rounded-full shadow-[0_0_15px_rgba(249,115,22,0.4)]" />
             <h1 className="text-xl sm:text-3xl md:text-5xl lg:text-6xl font-black tracking-tighter uppercase italic leading-none">
                Leave <span className="text-orange-500 underline decoration-white/10 underline-offset-8">Request</span>
             </h1>
          </div>
          <p className="text-white/40 text-[8px] sm:text-xs font-medium max-w-md uppercase tracking-[0.1em] leading-relaxed hidden sm:block">
             Select up to 3 individual dates per rota for your clinical role. First come, first served.
          </p>
          <div className="inline-flex flex-wrap items-center gap-2 bg-white/[0.02] border border-white/5 rounded-xl px-3 py-1.5 text-[10px]">
            <span className="font-mono text-white/40 uppercase tracking-wider">Access Lock:</span>
            {effectiveEditEnabled ? (
              <span className="font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-md flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active (Open)
              </span>
            ) : (
              <span className="font-black text-rose-400 uppercase tracking-widest bg-rose-500/10 px-2 py-0.5 rounded-md flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                Locked
              </span>
            )}
            <span className="text-white/30 font-medium tracking-tight">
              {isAutoWindowActive 
                ? "— Auto Window Open (1st - 9th of month IST)" 
                : "— Opens automatically 1st-9th every month (IST)"
              }
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 bg-white/[0.02] p-1.5 sm:p-2 rounded-xl sm:rounded-2xl border border-white/5 backdrop-blur-xl">
           {isAdmin && (
             <div className="flex items-center justify-between sm:justify-start gap-3 px-3 sm:px-4 border-b sm:border-b-0 sm:border-r border-white/5 py-1 sm:py-0">
                <span className="text-[9px] sm:text-[10px] font-black text-white/30 uppercase tracking-widest whitespace-nowrap">Global Edit</span>
                <button 
                  onClick={handleToggleEditMode}
                  className={cn(
                    "w-9 h-4.5 sm:w-10 sm:h-5 rounded-full relative transition-all duration-500",
                    isEditModeEnabled ? "bg-orange-600 shadow-[0_0_15px_rgba(249,115,22,0.4)]" : "bg-white/10"
                  )}
                >
                  <div className={cn(
                    "absolute top-0.5 w-3.5 h-3.5 sm:w-3 sm:h-3 rounded-full bg-white transition-all duration-500",
                    isEditModeEnabled ? "left-5 sm:left-6" : "left-0.5 sm:left-1"
                  )} />
                </button>
             </div>
           )}

           <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg sm:rounded-xl">
              {(['CCRN', 'RN'] as const).map(role => (
                <button
                  key={role}
                  onClick={() => setSelectedRole(role as any)}
                  className={cn(
                    "flex-1 sm:flex-none px-4 sm:px-6 py-2 sm:py-2.5 rounded-md sm:rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all",
                    selectedRole === role 
                      ? "bg-orange-600 text-white shadow-lg shadow-orange-500/20" 
                      : "text-white/30 hover:text-white/60 hover:bg-white/5",
                    !isAdmin && !profile?.roles.includes(role as any) && "opacity-20 grayscale cursor-not-allowed"
                  )}
                >
                  {role}
                </button>
              ))}
           </div>
           
           <div className="relative flex items-center gap-2 sm:gap-3 px-3 sm:px-6 py-2.5 sm:py-0 border-t sm:border-t-0 sm:border-l border-white/5 w-full sm:min-w-[240px] hover:bg-white/10 active:bg-white/20 transition-all cursor-pointer group rounded-lg sm:rounded-none">
              <div className="flex flex-col flex-1 sm:flex-none">
                <span className="text-[8px] sm:text-[9px] uppercase text-white/30 font-black tracking-widest mb-0.5">Rota Range</span>
                <div className="text-xs sm:text-sm font-black text-orange-400 flex items-center gap-2">
                  {filteredTimelines.find(t => ROTA_TIMELINES.indexOf(t) === selectedTimelineIdx)?.label.toUpperCase()}
                  <ChevronLeft className="w-3.5 h-3.5 rotate-270 text-orange-500/40" />
                </div>
              </div>
              <RefreshCw className="w-3.5 h-3.5 text-white/20 ml-auto group-hover:rotate-180 transition-transform duration-700" />
              
              <select 
                value={selectedTimelineIdx}
                onChange={(e) => setSelectedTimelineIdx(Number(e.target.value))}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
              >
                {filteredTimelines.map((t) => (
                  <option key={ROTA_TIMELINES.indexOf(t)} value={ROTA_TIMELINES.indexOf(t)} className="bg-slate-900">
                    {t.label.toUpperCase()}
                  </option>
                ))}
              </select>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 md:gap-8">
        {/* Main Calendar Area */}
        <div className="xl:col-span-9 space-y-4 sm:space-y-6">
          <div className="glass rounded-[1.25rem] sm:rounded-[2.5rem] p-1.5 sm:p-4 md:p-8 shadow-2xl relative overflow-hidden bg-gradient-to-br from-white/[0.04] to-transparent">
             <div className="flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4 mb-4 sm:mb-8 px-2 sm:px-0">
               <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                 <div className="flex h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-orange-50 animate-pulse shadow-[0_0_10px_rgba(249,115,22,0.8)]" />
                 <h3 className="text-[9px] sm:text-xs md:text-sm font-black uppercase tracking-[0.2em] text-orange-500/60">AL Matrix</h3>
               </div>
               
               <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-3 sm:gap-4 md:gap-8">
                  {stagedDates.length > 0 && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.9, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="flex-1 sm:flex-none px-4 sm:px-10 py-2.5 sm:py-3 bg-orange-600 hover:bg-orange-500 text-white text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-lg sm:rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50"
                    >
                      {submitting ? 'Syncing...' : `Confirm ${stagedDates.length}`}
                    </motion.button>
                  )}
                  
                  {!stagedDates.length && (
                    <div className="flex items-center gap-3 sm:gap-6 ml-auto sm:ml-0">
                      <div className="flex items-center gap-2">
                         <span className="text-[8px] sm:text-[10px] font-black text-white/30 uppercase tracking-widest">QUOTA:</span>
                         <div className="flex items-center gap-1">
                            <span className="text-xs sm:text-sm font-black text-white">{leaves.filter(l => {
                              const lDateStr = l.date.includes('T') ? format(parseISO(l.date), 'yyyy-MM-dd') : l.date;
                              const sStart = format(startDate, 'yyyy-MM-dd');
                              const sEnd = format(endDate, 'yyyy-MM-dd');
                              return (
                                l.user_id === profile?.id && 
                                l.locked_for_role === selectedRole &&
                                lDateStr >= sStart && lDateStr <= sEnd
                              );
                            }).length}</span>
                            <span className="text-[8px] sm:text-[10px] font-black text-white/20">/ 3</span>
                         </div>
                      </div>
                      <div className="hidden sm:block h-6 w-px bg-white/5" />
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500/40" />
                        <span className="text-[8px] sm:text-[9px] font-black text-white/40 uppercase leading-none">Role: {selectedRole}</span>
                      </div>
                    </div>
                  )}
               </div>
             </div>

             <div className="relative">
                {loading && (
                  <div className="absolute inset-0 z-20 backdrop-blur-sm bg-black/20 flex items-center justify-center rounded-2xl">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-2 border-orange-500/20 border-t-orange-500 rounded-full animate-spin" />
                      <span className="text-[10px] font-black text-orange-500/60 uppercase tracking-widest">Syncing...</span>
                    </div>
                  </div>
                )}

                <Calendar 
                  startDate={startDate} 
                  endDate={endDate}
                  holidays={HOLIDAYS_2026}
                  leaves={leaves}
                  stagedDates={stagedDates}
                  selectedRole={selectedRole}
                  currentUserId={profile?.id || ''}
                  onDateClick={handleDateClick}
                />
             </div>
          </div>
        </div>

        {/* Sidebar Space */}
        <div className="xl:col-span-3 space-y-6">
          <div className="glass rounded-[2rem] p-8 space-y-8 relative overflow-hidden bg-white/[0.02]">
            <div className="space-y-2">
               <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Rota Intel</h4>
               <div className="text-3xl font-black tracking-tighter uppercase italic leading-none text-orange-400">
                  {ROTA_TIMELINES[selectedTimelineIdx].label}
               </div>
               <div className="text-[10px] font-mono text-white/30 uppercase tracking-wider">
                  {format(startDate, 'MMM d')} — {format(endDate, 'MMM d, yyyy')}
               </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-3">
                 <div className="p-2.5 bg-orange-500/10 rounded-xl text-orange-500 shadow-inner">
                    <AlertTriangle className="w-5 h-5" />
                 </div>
                 <h3 className="text-[11px] font-black uppercase tracking-widest text-white/80">Protocols</h3>
              </div>
              
              <ul className="space-y-4">
                 {[
                   "PH approved only if worked on that day",
                   "First come, first served logic active",
                   "One staff per role per date limit",
                   "Maximum 5 consecutive OFFs allowed",
                   "Duty changes via Meghana/Ashwini",
                   "AL requests validated by manager"
                 ].map((rule, i) => (
                   <li key={i} className="flex gap-4 group">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500/30 mt-1.5 group-hover:bg-orange-500 transition-colors" />
                      <span className="text-[10px] text-white/40 group-hover:text-white/70 transition-colors tracking-wide font-medium leading-relaxed uppercase">{rule}</span>
                   </li>
                 ))}
              </ul>
            </div>

            <div className="pt-6 border-t border-white/5">
               <div className="flex items-center gap-4 p-4 bg-orange-500/5 rounded-2xl border border-orange-500/10">
                  <div className="flex-1">
                     <div className="text-[9px] font-black text-orange-500/60 uppercase mb-0.5 whitespace-nowrap">Identity Verification</div>
                     <div className="text-xs font-bold text-white/80 truncate">{profile?.name || 'Authorized Guest'}</div>
                  </div>
                  <div className={cn("w-2 h-2 rounded-full", profile ? "bg-green-500" : "bg-red-500")} />
               </div>
            </div>

            {isAdmin && (
              <button
                onClick={handleToggleEditMode}
                className={cn(
                  "w-full py-4 rounded-2xl flex items-center justify-center gap-3 transition-all font-black text-[10px] uppercase tracking-widest",
                  isEditModeEnabled 
                    ? "bg-red-500/15 text-red-500 border border-red-500/30 shadow-lg shadow-red-500/10" 
                    : "bg-white/5 text-white/30 border border-white/5 hover:bg-white/10"
                )}
              >
                {isEditModeEnabled ? (
                  <>
                    <Unlock className="w-4 h-4" />
                    <span>Admin Override: Active</span>
                  </>
                ) : (
                  <>
                    <LockIcon className="w-4 h-4" />
                    <span>Admin Override: Locked</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
