import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, PieChart, Users, Calendar as CalendarIcon, Plus, Info, AlertCircle, Check, Clock, Edit, Database } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/utils';
import { getStaffEntitlement, STAFF_AL_TAKEN, STAFF_SL_ELIGIBLE, STAFF_SL_TAKEN } from '../types';
import { 
  format, 
  differenceInDays, 
  addDays, 
  getYear, 
  isWithinInterval, 
  startOfYear, 
  endOfYear, 
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  isAfter,
  isBefore
} from 'date-fns';

const MAX_AL_PER_YEAR = 19;

function PopoverCalendar({ 
  selectedYear, 
  fromDate, 
  toDate, 
  onSelect 
}: { 
  selectedYear: number, 
  fromDate: string, 
  toDate: string, 
  onSelect: (type: 'from' | 'to', date: string) => void 
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date(selectedYear, new Date().getMonth()));
  
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  
  const days = eachDayOfInterval({
    start: monthStart,
    end: monthEnd
  });

  const from = fromDate ? parseISO(fromDate) : null;
  const to = toDate ? parseISO(toDate) : null;

  return (
    <div className="space-y-6 select-none">
      {/* Calendar Header */}
      <div className="flex items-center justify-between px-2">
        <div className="flex flex-col">
          <div className="text-sm font-black text-white tracking-widest uppercase italic">
            {format(currentMonth, 'MMMM')}
          </div>
          <div className="text-[10px] font-bold text-emerald-500/60 uppercase tracking-[0.2em]">
            Session {format(currentMonth, 'yyyy')}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button 
            type="button"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button 
            type="button"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={`${d}-${i}`} className="text-center text-[9px] font-black text-white/20 pb-4 uppercase">{d}</div>
        ))}
        {Array.from({ length: monthStart.getDay() }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square opacity-0" />
        ))}
        {days.map((day, idx) => {
          const dStr = format(day, 'yyyy-MM-dd');
          const isSelectedFrom = from && isSameDay(day, from);
          const isSelectedTo = to && isSameDay(day, to);
          const isInRange = from && to && isWithinInterval(day, { start: from, end: to });
          const isToday = isSameDay(day, new Date());
          const isPast = isBefore(day, startOfYear(new Date(selectedYear, 0, 1))) || isAfter(day, endOfYear(new Date(selectedYear, 0, 1)));

          return (
            <motion.button
              key={dStr}
              type="button"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.005 }}
              disabled={isPast}
              onClick={() => {
                if (!fromDate || (fromDate && toDate)) {
                  onSelect('from', dStr);
                  onSelect('to', '');
                } else {
                  if (from && isBefore(day, from)) {
                    onSelect('from', dStr);
                    onSelect('to', '');
                  } else {
                    onSelect('to', dStr);
                  }
                }
              }}
              className={cn(
                "aspect-square rounded-xl text-[10px] font-black transition-all relative flex flex-col items-center justify-center border",
                isPast ? "opacity-10 cursor-not-allowed border-transparent" : "hover:z-20",
                isSelectedFrom || isSelectedTo ? "bg-emerald-500 text-white border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]" : 
                isInRange ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : 
                "text-white/40 bg-white/[0.02] border-white/[0.03] hover:border-white/20 hover:text-white",
                isToday && !isSelectedFrom && !isSelectedTo && !isInRange && "ring-1 ring-emerald-500/30"
              )}
            >
              <span className="relative z-10">{format(day, 'd')}</span>
              {isToday && !isSelectedFrom && !isSelectedTo && (
                <div className="absolute bottom-1.5 w-1 h-1 bg-emerald-500 rounded-full" />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

interface UserBalance {
  id: string;
  name: string;
  used: number;
  remaining: number;
  maxAl: number;
  isOverridden?: boolean;
}

export default function AlBalances({ onBack }: { onBack: () => void }) {
  const { profile } = useAuth();
  const isAdmin = profile?.roles.includes('Admin');
  
  const [balanceTab, setBalanceTab] = useState<'al' | 'sl'>('al');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [userBalances, setUserBalances] = useState<UserBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showApplyModal, setShowApplyModal] = useState(false);
  
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectingFor, setSelectingFor] = useState<'from' | 'to' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Override States for Admins
  const [editingUserOverride, setEditingUserOverride] = useState<UserBalance | null>(null);
  const [overrideTotalValue, setOverrideTotalValue] = useState<string>('');
  const [overrideUsedValue, setOverrideUsedValue] = useState<string>('');
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const [sqlNotificationNeeded, setSqlNotificationNeeded] = useState(false);
  const [showSqlInstructions, setShowSqlInstructions] = useState(false);

  useEffect(() => {
    fetchBalances();

    // Subscribe to realtime changes for live updates on AL/SL leaves or overrides changes
    const channelName = `al_balances_changes_${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leaves' }, () => {
        fetchBalances();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'al_overrides' }, () => {
        fetchBalances();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sl_overrides' }, () => {
        fetchBalances();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => {
        fetchBalances();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedYear, balanceTab]);

  const fetchBalances = async () => {
    setLoading(true);
    try {
      // Fetch all AL and SL leaves for the selected year
      const firstDay = format(startOfYear(new Date(selectedYear, 0, 1)), 'yyyy-MM-dd');
      const lastDay = format(endOfYear(new Date(selectedYear, 0, 1)), 'yyyy-MM-dd');

      const { data: leavesData, error: leavesError } = await supabase
        .from('leaves')
        .select('user_id, date, type')
        .in('type', ['AL', 'SL'])
        .gte('date', firstDay)
        .lte('date', lastDay);

      if (leavesError) throw leavesError;

      // Fetch all profiles to show names and zero-used users
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name');

      if (profilesError) throw profilesError;

      const today = new Date();
      const todayStr = format(today, 'yyyy-MM-dd');

      const alLeavesCounts: Record<string, number> = {};
      const slLeavesCounts: Record<string, number> = {};
      profilesData.forEach(p => {
        alLeavesCounts[p.id] = 0;
        slLeavesCounts[p.id] = 0;
      });

      leavesData?.forEach(leaf => {
        const isCurrentYear = selectedYear === today.getFullYear();
        const leafDateStr = leaf.date.includes('T') ? format(parseISO(leaf.date), 'yyyy-MM-dd') : leaf.date;
        
        if (!isCurrentYear || leafDateStr <= todayStr) {
          if (leaf.type === 'AL' && alLeavesCounts[leaf.user_id] !== undefined) {
            alLeavesCounts[leaf.user_id]++;
          } else if (leaf.type === 'SL' && slLeavesCounts[leaf.user_id] !== undefined) {
            slLeavesCounts[leaf.user_id]++;
          }
        }
      });

      // Try fetching overrides depending on active tab
      let overrides: any[] = [];
      const tableToFetch = balanceTab === 'al' ? 'al_overrides' : 'sl_overrides';
      const localKey = `${balanceTab}_overrides_${selectedYear}`;

      try {
        const { data: overridesData, error: overridesError } = await supabase
          .from(tableToFetch)
          .select('*')
          .eq('year', selectedYear);

        if (overridesError) {
          if (overridesError.code === '42P01' || overridesError.message?.includes('does not exist')) {
            setSqlNotificationNeeded(true);
            const localData = localStorage.getItem(localKey);
            overrides = localData ? JSON.parse(localData) : [];
          } else {
            console.warn('Overrides error:', overridesError);
          }
        } else {
          setSqlNotificationNeeded(false);
          overrides = overridesData || [];
        }
      } catch (err) {
        setSqlNotificationNeeded(true);
        const localData = localStorage.getItem(localKey);
        overrides = localData ? JSON.parse(localData) : [];
      }

      const overridesMap = new Map<string, any>();
      overrides.forEach(o => {
        overridesMap.set(o.user_id, o);
      });

      const processedBalances: UserBalance[] = profilesData
        .filter(p => p.name !== 'Akhila Akula')
        .map(p => {
          const userOverride = overridesMap.get(p.id);
          
          if (balanceTab === 'al') {
            // Entitlement base (if looking at current year, we check up to current today for live accruals)
            const isCurrentYear = selectedYear === today.getFullYear();
            const evaluationDate = isCurrentYear ? today : new Date(selectedYear, 11, 31);
            const baseEntitlement = getStaffEntitlement(p.name, selectedYear, evaluationDate);
            
            const maxAl = userOverride && userOverride.total_override !== null && userOverride.total_override !== undefined
              ? Number(userOverride.total_override)
              : baseEntitlement;

            let used = userOverride && userOverride.used_override !== null && userOverride.used_override !== undefined
              ? Number(userOverride.used_override)
              : alLeavesCounts[p.id];

            // For the year 2026, ensure that the used count is at least the baseline STAFF_AL_TAKEN from the image
            if (selectedYear === 2026 && !userOverride) {
              const baselineTaken = STAFF_AL_TAKEN[p.name] ?? 0;
              used = Math.max(baselineTaken, used);
            }

            return {
              id: p.id,
              name: p.name,
              used: used,
              maxAl: maxAl,
              remaining: maxAl - used,
              isOverridden: !!userOverride
            };
          } else {
            const baseEligible = STAFF_SL_ELIGIBLE[p.name] ?? 12;

            const maxAl = userOverride && userOverride.total_override !== null && userOverride.total_override !== undefined
              ? Number(userOverride.total_override)
              : baseEligible;

            let used = userOverride && userOverride.used_override !== null && userOverride.used_override !== undefined
              ? Number(userOverride.used_override)
              : slLeavesCounts[p.id];

            if (selectedYear === 2026 && !userOverride) {
              const baselineTaken = STAFF_SL_TAKEN[p.name] ?? 0;
              used = Math.max(baselineTaken, used);
            }

            return {
              id: p.id,
              name: p.name,
              used: used,
              maxAl: maxAl,
              remaining: maxAl - used,
              isOverridden: !!userOverride
            };
          }
        });

      // Sort by name
      setUserBalances(processedBalances.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      console.error('Error fetching balances:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError(null);

    const start = parseISO(fromDate);
    const end = parseISO(toDate);

    if (!fromDate || !toDate) {
      setError("Please select both dates.");
      return;
    }

    if (start > end) {
      setError("From date must be before or equal to To date.");
      return;
    }

    if (getYear(start) !== selectedYear || getYear(end) !== selectedYear) {
      setError(`Leaves must be within the selected year (${selectedYear}).`);
      return;
    }

    // Generate dates in range
    const daysRequested: string[] = [];
    let current = start;
    while (current <= end) {
      daysRequested.push(format(current, 'yyyy-MM-dd'));
      current = addDays(current, 1);
    }

    // Enforce SL rule: > 2 days must attach prescription (which is only possible through homepage Sick Leave screen)
    if (balanceTab === 'sl' && daysRequested.length > 2) {
      setError(`Prescription Required: For Sick Leave requests exceeding 2 days, please apply via the dedicated 'Sick Leave' hub on the Homepage to upload your medical prescription.`);
      return;
    }

    const myBalance = userBalances.find(b => b.id === profile.id);
    if (!myBalance) return;

    if (daysRequested.length > myBalance.remaining) {
      setError(`Insufficient balance. Requested: ${daysRequested.length}, Available: ${myBalance.remaining}`);
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create request for tracking
      const isAl = balanceTab === 'al';
      const { data: reqData, error: reqError } = await supabase.from('requests').insert({
        user_id: profile.id,
        user_name: profile.name,
        action: isAl ? 'Annual Leave (AL) Application' : 'Sick Leave Sync',
        dates: daysRequested,
        message: isAl 
          ? `AL application from ${fromDate} to ${toDate} (${daysRequested.length} days)`
          : `[SICK LEAVE REQUEST]\nDates requested: ${daysRequested.join(', ')}\nPrescription: None\nComment: Fast apply from balances table`,
        status: 'pending',
        created_at: new Date().toISOString()
      }).select().single();

      if (reqError) throw reqError;

      // 2. Create leaf entries
      const leafEntries = daysRequested.map(date => ({
        user_id: profile.id,
        user_name: profile.name,
        date: date,
        type: isAl ? 'AL' : 'SL',
        locked_for_role: profile.roles.includes('CCRN') ? 'CCRN' : 'RN'
      }));

      const { error: leavesError } = await supabase.from('leaves').insert(leafEntries);
      if (leavesError) throw leavesError;

      setShowApplyModal(false);
      setFromDate('');
      setToDate('');
      await fetchBalances();
    } catch (err: any) {
      console.error('Submit error:', err);
      setError(err.message || "Failed to submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveOverride = async (userId: string, totalCount: number | null, usedCount: number | null) => {
    setIsSavingOverride(true);
    const overridesTable = balanceTab === 'al' ? 'al_overrides' : 'sl_overrides';
    const localKey = `${balanceTab}_overrides_${selectedYear}`;
    try {
      if (sqlNotificationNeeded) {
        // Fallback: save to localStorage
        const localData = localStorage.getItem(localKey);
        const overrides = localData ? JSON.parse(localData) : [];
        const index = overrides.findIndex((o: any) => o.user_id === userId);
        
        const newValue = {
          user_id: userId,
          year: selectedYear,
          total_override: totalCount,
          used_override: usedCount
        };

        if (index >= 0) {
          if (totalCount === null && usedCount === null) {
            overrides.splice(index, 1);
          } else {
            overrides[index] = newValue;
          }
        } else {
          if (totalCount !== null || usedCount !== null) {
            overrides.push(newValue);
          }
        }
        localStorage.setItem(localKey, JSON.stringify(overrides));
        await fetchBalances();
        setEditingUserOverride(null);
      } else {
        // Database save: upsert
        if (totalCount === null && usedCount === null) {
          // Revert: delete override record
          const { error: deleteError } = await supabase
            .from(overridesTable)
            .delete()
            .match({ user_id: userId, year: selectedYear });

          if (deleteError) throw deleteError;
        } else {
          // Upsert
          const { error: upsertError } = await supabase
            .from(overridesTable)
            .upsert({
              user_id: userId,
              year: selectedYear,
              total_override: totalCount,
              used_override: usedCount,
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,year' });

          if (upsertError) throw upsertError;
        }
        await fetchBalances();
        setEditingUserOverride(null);
      }
    } catch (err: any) {
      console.error("Save override error:", err);
      alert(err.message || "Failed to save balance overrides.");
    } finally {
      setIsSavingOverride(false);
    }
  };

  const myBalance = userBalances.find(b => b.id === profile?.id);

  return (
    <div className="min-h-screen p-4 md:p-8 relative overflow-hidden">
      {/* Background dynamic orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[10%] left-[20%] w-[40vw] h-[40vw] bg-emerald-600/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[10%] right-[20%] w-[40vw] h-[40vw] bg-blue-600/5 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-6 sm:mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-4">
            <button 
              onClick={onBack}
              className="group flex items-center gap-2 text-white/60 hover:text-red-400 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Dashboard</span>
            </button>
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-2 h-10 rounded-full transition-all duration-500",
                balanceTab === 'al' 
                  ? "bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]" 
                  : "bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)]"
              )} />
              <h1 className="text-3xl sm:text-5xl font-black tracking-tighter uppercase italic text-white leading-none">
                {balanceTab === 'al' ? 'AL' : 'SICK'} <span className={balanceTab === 'al' ? 'text-emerald-500' : 'text-red-500'}>Balances</span>
              </h1>
            </div>
            <p className="text-white/60 text-[10px] sm:text-xs font-bold uppercase tracking-widest max-w-md">
              {balanceTab === 'al' 
                ? `Manage and track your annual leave entitlements. Max allowance: ${MAX_AL_PER_YEAR} days per year.`
                : "Manage and track your sick leave entitlements. Max allowance: 12 days per year."}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            {/* Toggle Tabs */}
            <div className="flex p-1 bg-white/5 border border-white/10 rounded-2xl">
              <button
                type="button"
                onClick={() => setBalanceTab('al')}
                className={cn(
                  "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  balanceTab === 'al' ? "bg-emerald-500 text-white shadow-lg" : "text-white/40 hover:text-white"
                )}
              >
                Annual Leave (AL)
              </button>
              <button
                type="button"
                onClick={() => setBalanceTab('sl')}
                className={cn(
                  "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  balanceTab === 'sl' ? "bg-red-500 text-white shadow-lg" : "text-white/40 hover:text-white"
                )}
              >
                Sick Leave (SL)
              </button>
            </div>

            {/* Year Selector */}
            <div className="flex items-center gap-3 bg-white/5 p-2 rounded-2xl border border-white/10 backdrop-blur-xl">
               <div className="flex items-center gap-2 px-4 border-r border-white/5">
                  <CalendarIcon className={cn("w-4 h-4", balanceTab === 'al' ? "text-emerald-400" : "text-red-400")} />
                  <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Select Year</span>
               </div>
               <select 
                 value={selectedYear}
                 onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                 className="bg-transparent text-white font-black uppercase tracking-widest outline-none px-4 py-2 cursor-pointer hover:bg-white/5 rounded-xl transition-colors"
               >
                 {[2025, 2026, 2027].map(y => (
                    <option key={y} value={y} className="bg-slate-900">{y}</option>
                 ))}
               </select>
            </div>
          </div>
        </div>

        {isAdmin && sqlNotificationNeeded && (
          <div className="mb-8 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-black text-amber-400 uppercase tracking-widest mb-1">Database Sync Required</h4>
                <p className="text-[10px] text-white/60 font-medium font-bold">
                  The <code className="bg-black/30 px-1.5 py-0.5 rounded text-white font-mono text-[9px] font-bold">{balanceTab === 'al' ? 'al_overrides' : 'sl_overrides'}</code> table is missing in Supabase. Overrides are currently saved in this browser's local storage only. Run the SQL schema to enable server sync for all team members.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowSqlInstructions(true)}
              className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-xl text-[9px] font-black uppercase tracking-widest border border-amber-500/20 shrink-0 transition-colors"
            >
              Get SQL Schema
            </button>
          </div>
        )}

        {/* Content Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* My Balance Card */}
          <div className="lg:col-span-4 space-y-6">
            <div className={cn(
              "glass rounded-[2rem] p-8 shadow-2xl relative overflow-hidden transition-colors border",
              balanceTab === 'al' ? "border-emerald-500/20 bg-emerald-500/[0.02]" : "border-red-500/20 bg-red-500/[0.02]"
            )}>
               <div className="absolute top-0 right-0 p-6 opacity-10">
                 <PieChart className={cn("w-24 h-24", balanceTab === 'al' ? "text-emerald-500" : "text-red-500")} />
               </div>
               
               <div className="relative z-10 space-y-8">
                  <div className="space-y-2">
                    <h3 className={cn(
                      "text-[10px] font-black uppercase tracking-widest",
                      balanceTab === 'al' ? "text-emerald-500/60" : "text-red-500/60"
                    )}>My {balanceTab === 'al' ? 'AL' : 'SL'} Summary ({selectedYear})</h3>
                    <div className={cn(
                      "text-6xl font-black tracking-tighter",
                      myBalance && myBalance.remaining < 0 ? "text-red-400 text-4xl animate-pulse" : "text-white"
                    )}>
                      {myBalance && myBalance.remaining < 0 ? `Overused ${Math.abs(myBalance.remaining)}` : (myBalance?.remaining || 0)}
                    </div>
                    <div className={cn(
                      "text-[10px] font-black uppercase tracking-widest",
                      myBalance && myBalance.remaining < 0 ? "text-red-400" : "text-white/60"
                    )}>
                      {myBalance && myBalance.remaining < 0 ? "Days Overused" : "Days Remaining"}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="glass-dark p-4 rounded-2xl border-white/10">
                      <div className="text-2xl font-black text-white">{myBalance?.used || 0}</div>
                      <div className="text-[8px] font-black uppercase tracking-widest text-white/60">Days Used</div>
                    </div>
                    <div className="glass-dark p-4 rounded-2xl border-white/10">
                      <div className="text-2xl font-black text-white/80">{myBalance?.maxAl || (balanceTab === 'al' ? getStaffEntitlement(profile?.name || '', selectedYear) : 12)}</div>
                      <div className="text-[8px] font-black uppercase tracking-widest text-white/60">Total Limit</div>
                    </div>
                  </div>

                  <button 
                    onClick={() => setShowApplyModal(true)}
                    className={cn(
                      "w-full py-4 text-white font-black rounded-2xl text-xs uppercase tracking-widest shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2",
                      balanceTab === 'al' 
                        ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20" 
                        : "bg-red-600 hover:bg-red-500 shadow-red-500/20"
                    )}
                  >
                    <Plus className="w-4 h-4" />
                    Apply for {balanceTab === 'al' ? 'AL' : 'SL'}
                  </button>
               </div>
            </div>

            <div className="glass rounded-[2rem] p-6 space-y-4">
               <div className="flex items-center gap-3">
                 <div className="p-2 bg-blue-500/10 rounded-xl text-blue-400">
                    <Info className="w-4 h-4" />
                 </div>
                 <h4 className="text-[10px] font-black uppercase tracking-widest text-white/70">{balanceTab === 'al' ? 'AL' : 'SL'} Policies</h4>
               </div>
               <ul className="space-y-3">
                 {(balanceTab === 'al' ? [
                   "Max 19 AL in a year from company",
                   "Can combinedly take off up to 25 days in a year",
                   "Requires 4 weeks notice",
                   "Approval syncs to Planner"
                 ] : [
                   "Max 12 SL entries per calendar year",
                   "Can NOT club AL and sick leave or OPH/PH together",
                   "Leave more than 2 days requires a prescription doc",
                   "Direct sync to user balance sheet upon approvals"
                 ]).map((p, i) => (
                   <li key={i} className="flex items-center gap-3 text-[10px] font-bold text-white/60 uppercase tracking-wide">
                     <div className={cn(
                       "w-1.5 h-1.5 rounded-full",
                       balanceTab === 'al' ? "bg-emerald-500/50" : "bg-red-500/50"
                     )} />
                     {p}
                   </li>
                 ))}
               </ul>
            </div>
          </div>

          {/* User List Section */}
          <div className="lg:col-span-8">
            <div className="glass rounded-[2.5rem] p-8 space-y-8 min-h-[500px]">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-blue-400" />
                    <h3 className="text-sm font-black uppercase tracking-widest text-white/90">
                      {isAdmin ? `Staff ${balanceTab === 'al' ? 'AL' : 'SL'} Status` : "My Colleagues Status"}
                    </h3>
                  </div>
                  <div className="text-[10px] font-black text-white/60 uppercase tracking-widest">
                    Showing {userBalances.length} Members
                  </div>
               </div>

               {loading ? (
                 <div className="flex flex-col items-center justify-center py-20 gap-4">
                   <div className={cn(
                     "w-10 h-10 border-2 rounded-full animate-spin",
                     balanceTab === 'al' ? "border-emerald-500/20 border-t-emerald-500" : "border-red-500/20 border-t-red-500"
                   )} />
                   <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Compiling Balances...</span>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {userBalances.map((user) => (
                      <div 
                        key={user.id}
                        className={cn(
                          "glass-dark p-6 rounded-3xl border border-white/5 relative overflow-hidden group transition-all",
                          balanceTab === 'al' ? "hover:border-emerald-500/30" : "hover:border-red-500/30",
                          user.id === profile?.id && (balanceTab === 'al' ? "border-emerald-500/50 bg-emerald-500/[0.03]" : "border-red-500/50 bg-red-500/[0.03]")
                        )}
                      >
                        <div className="flex items-center justify-between mb-4 relative z-10">
                           <div className="flex items-center gap-3">
                              <div className={cn(
                                "w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center font-black text-white/40 border border-white/5 transition-colors",
                                balanceTab === 'al' ? "group-hover:text-emerald-400" : "group-hover:text-red-400"
                              )}>
                                {user.name.charAt(0)}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    "text-xs font-black text-white transition-colors uppercase tracking-wide",
                                    balanceTab === 'al' ? "group-hover:text-emerald-200" : "group-hover:text-red-200"
                                  )}>{user.name}</span>
                                  {user.isOverridden && (
                                    <span className="px-1.5 py-0.5 bg-purple-500/20 border border-purple-500/30 text-[6px] font-black text-purple-400 rounded-md uppercase tracking-widest shrink-0">
                                      Overridden
                                    </span>
                                  )}
                                  {isAdmin && (
                                    <button
                                      onClick={() => {
                                        setEditingUserOverride(user);
                                        setOverrideTotalValue(user.maxAl.toString());
                                        setOverrideUsedValue(user.used.toString());
                                      }}
                                      className={cn(
                                        "p-1 text-white/20 rounded transition-colors shrink-0",
                                        balanceTab === 'al' ? "hover:text-emerald-400 hover:bg-white/10" : "hover:text-red-400 hover:bg-white/10"
                                      )}
                                      title={balanceTab === 'al' ? "Override AL Balance" : "Override SL Balance"}
                                    >
                                      <Edit className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                                <div className="text-[8px] font-bold text-white/60 uppercase tracking-widest">Full Entitlement</div>
                              </div>
                           </div>
                           <div className="text-right">
                              <div className={cn(
                                "text-lg font-black",
                                user.remaining > 5 ? (balanceTab === 'al' ? "text-emerald-400" : "text-red-400") : user.remaining > 0 ? "text-amber-400" : "text-red-400"
                              )}>
                                {user.remaining < 0 ? `Overused ${Math.abs(user.remaining)}` : user.remaining}
                              </div>
                              <div className={cn(
                                "text-[8px] font-semibold uppercase tracking-widest",
                                user.remaining < 0 ? "text-red-400" : "text-white/60"
                              )}>
                                {user.remaining < 0 ? "Over Limit" : "Left"}
                              </div>
                           </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="relative h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                           <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${(user.used / user.maxAl) * 100}%` }}
                              className={cn(
                                "absolute inset-y-0 left-0 transition-all duration-1000 ease-out",
                                user.used >= user.maxAl ? "bg-red-500" : (balanceTab === 'al' ? "bg-emerald-500" : "bg-red-500")
                              )}
                           />
                        </div>
                        
                        <div className="mt-3 flex justify-between text-[8px] font-black uppercase tracking-widest">
                           <span className="text-white/60">Used: <strong className="text-white font-black">{user.used}d</strong></span>
                           <span className="text-white/60">Max: <strong className="text-white font-black">{user.maxAl}d</strong></span>
                        </div>
                      </div>
                    ))}
                 </div>
               )}
            </div>
          </div>
        </div>
      </div>

      {/* Apply Modal */}
      <AnimatePresence>
        {showApplyModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !submitting && setShowApplyModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-xl"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-[#1e293b] rounded-[2.5rem] border border-white/20 shadow-2xl max-h-[95vh] overflow-y-auto"
            >
              <div className={cn(
                "p-8 border-b border-white/5",
                balanceTab === 'al' ? "bg-emerald-500/[0.02]" : "bg-red-500/[0.02]"
              )}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-black uppercase tracking-tighter text-white italic">
                    Apply for <span className={balanceTab === 'al' ? "text-emerald-500 underline underline-offset-4 decoration-emerald-500/20" : "text-red-500 underline underline-offset-4 decoration-red-500/20"}>
                      {balanceTab === 'al' ? 'Annual Leave' : 'Sick Leave'}
                    </span>
                  </h3>
                  <div className={cn(
                    "px-3 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest",
                    balanceTab === 'al' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"
                  )}>
                    {selectedYear} Session
                  </div>
                </div>
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">
                  {myBalance && myBalance.remaining < 0 
                    ? `Your current balance is overused by ${Math.abs(myBalance.remaining)} days`
                    : `Your current balance is ${myBalance?.remaining || 0} days`}
                </p>
              </div>

              <form onSubmit={handleApply} className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setSelectingFor(selectingFor === 'from' ? null : 'from')}
                      className={cn(
                        "p-4 rounded-2xl border transition-all text-left group relative overflow-hidden",
                        selectingFor === 'from' 
                          ? (balanceTab === 'al' ? "bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.1)]" : "bg-red-500/10 border-red-500/40 shadow-[0_0_30px_rgba(239,68,68,0.1)]") 
                          : "bg-white/5 border-white/10 hover:border-white/20",
                      )}
                    >
                      <div className={cn(
                        "text-[8px] font-black text-white/20 uppercase tracking-widest mb-1 transition-colors",
                        balanceTab === 'al' ? "group-hover:text-emerald-500/40" : "group-hover:text-red-500/40"
                      )}>Start Date</div>
                      <div className="flex items-center gap-2">
                        <CalendarIcon className={cn("w-4 h-4", fromDate ? (balanceTab === 'al' ? "text-emerald-500" : "text-red-500") : "text-white/10")} />
                        <div className={cn("text-xs font-black uppercase italic tracking-tighter", fromDate ? "text-white" : "text-white/10")}>
                          {fromDate ? format(parseISO(fromDate), 'dd MMM yyyy') : 'Pick Date'}
                        </div>
                      </div>
                      {selectingFor === 'from' && <motion.div layoutId="active-indicator" className={cn("absolute bottom-0 left-0 right-0 h-1", balanceTab === 'al' ? "bg-emerald-500" : "bg-red-500")} />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectingFor(selectingFor === 'to' ? null : 'to')}
                      className={cn(
                        "p-4 rounded-2xl border transition-all text-left group relative overflow-hidden",
                        selectingFor === 'to' 
                          ? (balanceTab === 'al' ? "bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.1)]" : "bg-red-500/10 border-red-500/40 shadow-[0_0_30px_rgba(239,68,68,0.1)]") 
                          : "bg-white/5 border-white/10 hover:border-white/20",
                      )}
                    >
                      <div className={cn(
                        "text-[8px] font-black text-white/20 uppercase tracking-widest mb-1 transition-colors",
                        balanceTab === 'al' ? "group-hover:text-emerald-500/40" : "group-hover:text-red-500/40"
                      )}>End Date</div>
                      <div className="flex items-center gap-2">
                        <CalendarIcon className={cn("w-4 h-4", toDate ? (balanceTab === 'al' ? "text-emerald-500" : "text-red-500") : "text-white/10")} />
                        <div className={cn("text-xs font-black uppercase italic tracking-tighter", toDate ? "text-white" : "text-white/10")}>
                          {toDate ? format(parseISO(toDate), 'dd MMM yyyy') : 'Pick Date'}
                        </div>
                      </div>
                      {selectingFor === 'to' && <motion.div layoutId="active-indicator" className={cn("absolute bottom-0 left-0 right-0 h-1", balanceTab === 'al' ? "bg-emerald-500" : "bg-red-500")} />}
                    </button>
                  </div>

                  <AnimatePresence mode="wait">
                    {selectingFor ? (
                      <motion.div
                        key="calendar-view"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-white/[0.02] border border-white/5 rounded-3xl p-6 overflow-hidden"
                      >
                        <PopoverCalendar 
                          selectedYear={selectedYear}
                          fromDate={fromDate}
                          toDate={toDate}
                          onSelect={(type, date) => {
                            if (type === 'from') {
                              setFromDate(date);
                              if (!toDate) setSelectingFor('to');
                            } else {
                              setToDate(date);
                              setSelectingFor(null);
                            }
                          }}
                        />
                      </motion.div>
                    ) : (
                      fromDate && toDate && (
                        <motion.div 
                          key="summary-view"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className={cn(
                            "p-6 rounded-3xl border flex items-center justify-between group overflow-hidden relative",
                            balanceTab === 'al' ? "bg-emerald-500/[0.05] border-emerald-500/10" : "bg-red-500/[0.05] border-red-500/10"
                          )}
                        >
                           <div className="absolute -right-8 -bottom-8 opacity-5 group-hover:scale-110 transition-transform duration-500">
                             <Clock className="w-32 h-32" />
                           </div>
                           <div className="flex items-center gap-5">
                              <div className={cn(
                                "w-12 h-12 rounded-2xl flex items-center justify-center",
                                balanceTab === 'al' ? "bg-emerald-500/20" : "bg-red-500/20"
                              )}>
                                 <Clock className={cn("w-5 h-5", balanceTab === 'al' ? "text-emerald-500" : "text-red-500")} />
                              </div>
                              <div>
                                 <div className={cn(
                                   "text-[10px] font-black uppercase tracking-widest underline underline-offset-4",
                                   balanceTab === 'al' ? "text-emerald-500/80 decoration-emerald-500/20" : "text-red-500/80 decoration-red-500/20"
                                 )}>Duration Calculated</div>
                                 <div className="text-3xl font-black text-white italic tracking-tighter">
                                   {differenceInDays(parseISO(toDate), parseISO(fromDate)) + 1} <span className="text-sm not-italic text-white/40 ml-1 uppercase">Days Selection</span>
                                 </div>
                              </div>
                           </div>
                           <Check className={cn("w-6 h-6 animate-pulse", balanceTab === 'al' ? "text-emerald-500" : "text-red-500")} />
                        </motion.div>
                      )
                    )}
                  </AnimatePresence>
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 text-red-400"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wide leading-tight">{error}</span>
                  </motion.div>
                )}

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowApplyModal(false)}
                    disabled={submitting}
                    className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={submitting}
                    className={cn(
                      "flex-[2] py-4 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3",
                      balanceTab === 'al' 
                        ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20" 
                        : "bg-red-600 hover:bg-red-500 shadow-red-500/20"
                    )}
                  >
                    {submitting ? 'Processing...' : 'Confirm for Approval'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {editingUserOverride && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSavingOverride && setEditingUserOverride(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-xl"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[#1e293b] rounded-[2.5rem] border border-white/20 shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-white/5 bg-purple-500/[0.02]">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-black uppercase tracking-tighter text-white italic">
                    Manual <span className="text-purple-400">Balance Override</span>
                  </h3>
                  <div className="px-3 py-1 bg-purple-500/10 rounded-full border border-purple-500/20 text-[8px] font-black text-purple-400 uppercase tracking-widest">
                    Admin Tool
                  </div>
                </div>
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">
                  Override entitlement parameters for {editingUserOverride.name} in {selectedYear}. Type: {balanceTab === 'al' ? 'AL' : 'SL'}
                </p>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <label className="block text-[8px] font-black text-white/30 uppercase tracking-widest mb-2">Total Allowance Override</label>
                  <input
                    type="number"
                    value={overrideTotalValue}
                    onChange={(e) => setOverrideTotalValue(e.target.value)}
                    placeholder="e.g. 15"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white font-black outline-none focus:border-purple-500/50 focus:bg-white/[0.08] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[8px] font-black text-white/30 uppercase tracking-widest mb-2">Used Days Override</label>
                  <input
                    type="number"
                    value={overrideUsedValue}
                    onChange={(e) => setOverrideUsedValue(e.target.value)}
                    placeholder="e.g. 2"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white font-black outline-none focus:border-purple-500/50 focus:bg-white/[0.08] transition-all"
                  />
                </div>

                <div className="text-[9px] text-white/30 font-medium leading-relaxed bg-white/[0.02] p-4 rounded-xl border border-white/5">
                  Overriding used days or limits will bypass standard auto-calculation logic and instantly adjust the displayed "Remaining" score. This does <span className="text-purple-400 font-bold">NOT</span> alter any calendar entries in the planner.
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setEditingUserOverride(null)}
                      disabled={isSavingOverride}
                      className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => handleSaveOverride(
                        editingUserOverride.id, 
                        overrideTotalValue ? parseFloat(overrideTotalValue) : null,
                        overrideUsedValue ? parseFloat(overrideUsedValue) : null
                      )}
                      disabled={isSavingOverride}
                      className="flex-[2] py-4 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-lg shadow-purple-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSavingOverride ? 'Saving...' : 'Apply Overrides'}
                    </button>
                  </div>

                  {editingUserOverride.isOverridden && (
                    <button
                      onClick={() => handleSaveOverride(editingUserOverride.id, null, null)}
                      disabled={isSavingOverride}
                      className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-[9px] font-black uppercase tracking-widest border border-red-500/20 transition-all active:scale-95"
                    >
                      Revert to automatic calculations
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showSqlInstructions && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSqlInstructions(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-xl"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-[#1e293b] rounded-[2.5rem] border border-white/20 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
            >
              <div className="p-8 border-b border-white/5 bg-amber-500/[0.02] shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-black uppercase tracking-tighter text-white italic">
                    Supabase <span className="text-amber-400">Database Setup</span>
                  </h3>
                  <button 
                    onClick={() => setShowSqlInstructions(false)}
                    className="px-3 py-1 bg-amber-500/10 rounded-full border border-amber-500/20 text-[8px] font-black text-amber-400 uppercase tracking-widest hover:bg-amber-500/20 transition-colors"
                  >
                    Close
                  </button>
                </div>
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">
                  Paste this SQL statement inside your Supabase dashboard's SQL Editor to register overrides tables for both Annual Leave and Sick Leave.
                </p>
              </div>

               <div className="p-8 space-y-6 overflow-y-auto flex-1">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-black text-white/30 uppercase tracking-widest font-bold">Recommended Setup Script</span>
                    <button
                      onClick={() => {
                        const sqlText = `CREATE TABLE IF NOT EXISTS public.al_overrides (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    total_override DOUBLE PRECISION,
    used_override DOUBLE PRECISION,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (user_id, year)
);

CREATE TABLE IF NOT EXISTS public.sl_overrides (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    total_override DOUBLE PRECISION,
    used_override DOUBLE PRECISION,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (user_id, year)
);

ALTER TABLE public.al_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sl_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated staff" ON public.al_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable read access for authenticated staff" ON public.sl_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable write access for system administrators" ON public.al_overrides FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.roles @> ARRAY['CCRN'::text])
);
CREATE POLICY "Enable write access for system administrators" ON public.sl_overrides FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.roles @> ARRAY['CCRN'::text])
);`;
                        navigator.clipboard.writeText(sqlText);
                        alert("SQL copied to clipboard!");
                      }}
                      className="text-[8px] font-black text-amber-400 hover:underline uppercase tracking-widest"
                    >
                      Copy SQL
                    </button>
                  </div>
                  <pre className="p-5 bg-black/40 rounded-2xl text-[10px] text-zinc-300 font-mono overflow-x-auto leading-relaxed border border-white/5 select-all">
{`CREATE TABLE IF NOT EXISTS public.al_overrides (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    total_override DOUBLE PRECISION,
    used_override DOUBLE PRECISION,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (user_id, year)
);

CREATE TABLE IF NOT EXISTS public.sl_overrides (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    total_override DOUBLE PRECISION,
    used_override DOUBLE PRECISION,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (user_id, year)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.al_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sl_overrides ENABLE ROW LEVEL SECURITY;

-- Creating Access Control Security Policies
CREATE POLICY "Enable read for al_overrides" ON public.al_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable read for sl_overrides" ON public.sl_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable write for al_overrides system admins" ON public.al_overrides FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.roles @> ARRAY['CCRN'::text]
  )
);
CREATE POLICY "Enable write for sl_overrides system admins" ON public.sl_overrides FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.roles @> ARRAY['CCRN'::text]
  )
);`}
                  </pre>
                </div>

                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl text-[9px] text-white/40 leading-relaxed font-bold uppercase tracking-wider">
                  💡 Note: Enabling RLS and configuring policies makes sure regular nurse staff have Read-Only view of overrides, while CCRN admins have full privilege (add, edit, delete overrides for both AL and SL).
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
