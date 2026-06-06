import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Info, RefreshCw, UploadCloud, Link as LinkIcon, Trash2, CheckCircle2, AlertTriangle, FileText, UserPlus, X, Search, Check } from 'lucide-react';
import Calendar from './Calendar';
import { HOLIDAYS_2026, ROTA_TIMELINES, getDefaultTimelineIdx } from '../constants';
import { Leave, STAFF_SL_ELIGIBLE, STAFF_SL_TAKEN, Profile } from '../types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/utils';
import { isSameDay, startOfDay, format, parseISO, addDays, subDays } from 'date-fns';

export default function SickLeave({ onBack }: { onBack: () => void }) {
  const { profile } = useAuth();
  const [selectedTimelineIdx, setSelectedTimelineIdx] = useState(getDefaultTimelineIdx()); // Default to current
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [stagedDates, setStagedDates] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [selectedRole, setSelectedRole] = useState<'CCRN' | 'RN'>('RN');

  // Tagging states
  const [staff, setStaff] = useState<Profile[]>([]);
  const [taggedUsers, setTaggedUsers] = useState<{id: string, name: string}[]>([]);
  const [isTagging, setIsTagging] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const tagRef = useRef<HTMLDivElement>(null);

  // Click outside listener for tagging dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (tagRef.current && !tagRef.current.contains(event.target as Node)) {
        setIsTagging(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [tagRef]);

  const toggleTag = (staffMember: Profile) => {
    const isAlreadyTagged = taggedUsers.find(u => u.id === staffMember.id);
    if (isAlreadyTagged) {
      setTaggedUsers(taggedUsers.filter(u => u.id !== staffMember.id));
    } else {
      setTaggedUsers([...taggedUsers, { id: staffMember.id, name: staffMember.name }]);
    }
  };

  const filteredStaff = useMemo(() => {
    return staff.filter(s => {
      // Exclude current user from tagging themselves
      if (s.id === profile?.id) return false;
      return s.name.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [staff, searchTerm, profile]);

  useEffect(() => {
    if (profile?.roles?.includes('CCRN')) {
      setSelectedRole('CCRN');
    } else {
      setSelectedRole('RN');
    }
  }, [profile]);

  // Prescription attachment states
  const [attachMethod, setAttachMethod] = useState<'upload' | 'link'>('upload');
  const [driveLink, setDriveLink] = useState('');
  const [fileName, setFileName] = useState('');
  const [base64File, setBase64File] = useState('');
  const [fileSize, setFileSize] = useState('');

  const isAdmin = profile?.roles.includes('Admin');

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
    
    const channelName = `leaves_sl_changes_${Date.now()}`;
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
      // Fetch all leaves to know what is booked (including AL, LR, SL) to check clubbing!
      const { data: leavesData, error: leavesError } = await supabase
        .from('leaves')
        .select('*');
      
      if (leavesError) throw leavesError;

      if (leavesData) {
        setLeaves(leavesData);
      }

      // Fetch Staff for tagging
      const { data: staffData, error: staffError } = await supabase
        .from('profiles')
        .select('id, name, email, roles')
        .order('name');
      
      if (!staffError) {
        setStaff(staffData || []);
      } else {
        console.error('Error fetching staff for tagging:', staffError);
        if (profile) setStaff([profile as Profile]);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Convert File to Base64
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setFileName(file.name);
    setFileSize((file.size / 1024).toFixed(1) + ' KB');

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setBase64File(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Clear file attachment
  const handleClearAttachment = () => {
    setFileName('');
    setBase64File('');
    setFileSize('');
  };

  // Rule configuration & balances
  const slEligible = profile ? (STAFF_SL_ELIGIBLE[profile.name] ?? 12) : 12;
  const slBaseTaken = profile ? (STAFF_SL_TAKEN[profile.name] ?? 0) : 0;

  // Calculate current year approved SL
  const currentYear = new Date().getFullYear();
  const currentYearSlLeaves = leaves.filter(l => 
    l.user_id === profile?.id && 
    l.type === 'SL' && 
    new Date(l.date).getFullYear() === currentYear
  );

  const totalSlUsed = Math.max(slBaseTaken, currentYearSlLeaves.length);
  const slRemaining = slEligible - totalSlUsed;

  // Clubbing Validation Check
  const checkClubbing = (date: Date): { status: boolean; reason?: string } => {
    const dStr = format(date, 'yyyy-MM-dd');

    // 1. Check if selected date is an OPH or PH
    const holidayOnDate = HOLIDAYS_2026.find(h => h.date === dStr);
    if (holidayOnDate) {
      return { 
        status: true, 
        reason: `Selected date (${dStr}) is a scheduled holiday "${holidayOnDate.name}" (${holidayOnDate.type}). Sick leave cannot be taken on holidays.` 
      };
    }

    // 2. Check adjacent dates (D-1 and D+1) for being an OPH or PH
    const prevDStr = format(subDays(date, 1), 'yyyy-MM-dd');
    const nextDStr = format(addDays(date, 1), 'yyyy-MM-dd');

    const holidayPrev = HOLIDAYS_2026.find(h => h.date === prevDStr);
    if (holidayPrev) {
      return { 
        status: true, 
        reason: `Clubbing error: Day before (${prevDStr}) is a scheduled holiday "${holidayPrev.name}" (${holidayPrev.type}). Sick leave cannot touch holidays.` 
      };
    }

    const holidayNext = HOLIDAYS_2026.find(h => h.date === nextDStr);
    if (holidayNext) {
      return { 
        status: true, 
        reason: `Clubbing error: Day after (${nextDStr}) is a scheduled holiday "${holidayNext.name}" (${holidayNext.type}). Sick leave cannot touch holidays.` 
      };
    }

    // 3. Check if user already has AL or LR or other leaves on D, D-1, or D+1
    const userLeavesOnDates = leaves.filter(l => l.user_id === profile?.id);
    
    const leaveOnDate = userLeavesOnDates.find(l => {
      const lStr = l.date.includes('T') ? format(parseISO(l.date), 'yyyy-MM-dd') : l.date;
      return lStr === dStr && l.type !== 'SL'; // Exclude current SL dates to allow toggling off
    });
    if (leaveOnDate) {
      return { 
        status: true, 
        reason: `You already have an approved ${leaveOnDate.type} leave on this date (${dStr}).` 
      };
    }

    const leaveOnPrevDate = userLeavesOnDates.find(l => {
      const lStr = l.date.includes('T') ? format(parseISO(l.date), 'yyyy-MM-dd') : l.date;
      return lStr === prevDStr && l.type !== 'SL';
    });
    if (leaveOnPrevDate) {
      return { 
        status: true, 
        reason: `Clubbing error: You have an approved ${leaveOnPrevDate.type} leave on the day before (${prevDStr}). Sick Leave cannot be clubbed with AL or Planner Leaves.` 
      };
    }

    const leaveOnNextDate = userLeavesOnDates.find(l => {
      const lStr = l.date.includes('T') ? format(parseISO(l.date), 'yyyy-MM-dd') : l.date;
      return lStr === nextDStr && l.type !== 'SL';
    });
    if (leaveOnNextDate) {
      return { 
        status: true, 
        reason: `Clubbing error: You have an approved ${leaveOnNextDate.type} leave on the day after (${nextDStr}). Sick Leave cannot be clubbed with AL or Planner Leaves.` 
      };
    }

    return { status: false };
  };

  const handleDateClick = async (date: Date) => {
    if (!profile) return;

    const dStr = format(date, 'yyyy-MM-dd');

    // Access Denied rule: Prevent applying for role slots you do not hold (except Admin)
    if (!isAdmin && !profile.roles.includes(selectedRole)) {
      alert(`Access Denied: As a ${profile.roles.join('/')}, you cannot apply for sick leave in the ${selectedRole} field.`);
      return;
    }
    
    // Check if there is an existing SL locked for this user on this day
    const existingLeave = leaves.find(l => {
      const lDateStr = l.date.includes('T') ? format(parseISO(l.date), 'yyyy-MM-dd') : l.date;
      return lDateStr === dStr && l.user_id === profile.id && l.type === 'SL';
    });

    if (existingLeave) {
      // Allow removal of their own sick leave immediately
      const { error } = await supabase.from('leaves').delete().eq('id', existingLeave.id);
      if (!error) {
        setStagedDates(prev => prev.filter(d => d !== dStr));
        fetchLeaves();
      }
      return;
    }

    // Toggle logic for picking new staged dates
    if (stagedDates.includes(dStr)) {
      setStagedDates(prev => prev.filter(d => d !== dStr));
      return;
    }

    // Run Clubbing check only when selecting a date
    const clubbingResult = checkClubbing(date);
    if (clubbingResult.status) {
      alert(clubbingResult.reason);
      return;
    }

    // Check year/balance limit
    const totalSelected = stagedDates.length;
    if (!isAdmin && (totalSlUsed + totalSelected >= slEligible)) {
      alert(`Balance limit reached: You only have ${slRemaining} Sick Leave day(s) left.`);
      return;
    }

    setStagedDates(prev => [...prev, dStr]);
  };

  const handleSubmit = async () => {
    if (!profile || stagedDates.length === 0) return;

    // RULE: User applying for > 2 days must attach prescription
    const attachmentAttached = attachMethod === 'upload' ? !!base64File : !!driveLink.trim();
    if (stagedDates.length > 2 && !attachmentAttached) {
      alert(`Prescription Required: Since you are applying for ${stagedDates.length} days of Sick Leave, you must upload a prescription file or attach a Google Drive link.`);
      return;
    }

    setSubmitting(true);
    try {
      const attachmentUrl = attachMethod === 'upload' ? base64File : driveLink;
      
      // We will pack prescription metadata nicely into the message field for maximum schema compatibility,
      // and ALSO try inserting in `prescription_url` if they ran the setup query!
      const finalMessage = `[SICK LEAVE REQUEST]\nDates requested: ${stagedDates.join(', ')}\nPrescription: ${attachmentUrl || 'None Attached'}\nComment: ${message}`;

      // Insert Request
      const insertPayload: any = {
        user_id: profile.id,
        user_name: profile.name || 'Staff Member',
        action: 'Sick Leave Sync',
        dates: stagedDates,
        message: finalMessage,
        status: 'pending',
        tagged_user_id: taggedUsers.length > 0 ? taggedUsers.map(u => u.id).join(',') : null,
        tagged_user_name: taggedUsers.length > 0 ? taggedUsers.map(u => u.name).join(',') : null,
        created_at: new Date().toISOString()
      };

      // Add prescription_url parameter just in case they have it added to Postgres.
      // We also append it so that if it exists, it stores it cleanly.
      // We will safeguard any DB insert errors.
      try {
        const { error: syncError } = await supabase.from('requests').insert({
          ...insertPayload,
          prescription_url: attachmentUrl || null
        });
        
        if (syncError) {
          // If error is about undefined column, retry without the column!
          if (syncError.message?.includes('column') || syncError.code === '42703') {
            console.warn('DB table does not have "prescription_url" column, retrying with raw payload...');
            const { error: retryError } = await supabase.from('requests').insert(insertPayload);
            if (retryError) throw retryError;
          } else {
            throw syncError;
          }
        }
      } catch (err: any) {
        console.warn('Sync insert failed, using fallback raw requests insert:', err);
        const { error: fallbackError } = await supabase.from('requests').insert(insertPayload);
        if (fallbackError) throw fallbackError;
      }

      // Lock dates in leaves
      for (const dStr of stagedDates) {
        await supabase.from('leaves').insert({
          user_id: profile.id,
          user_name: profile.name,
          date: dStr,
          type: 'SL',
          locked_for_role: selectedRole
        });
      }

      // Notification logic
      const admins = staff.filter(s => s.roles?.some(r => r.toLowerCase() === 'admin'));
      const notifications: any[] = admins.map(admin => ({
        user_id: admin.id,
        title: 'New Sick Leave',
        message: `${profile?.name || 'Staff'} submitted Sick Leave: ${stagedDates.length} days`,
        type: 'danger',
        is_read: false,
        created_at: new Date().toISOString()
      }));

      // Notify tagged users
      taggedUsers.forEach(tu => {
        if (!admins.some(a => a.id === tu.id)) {
          notifications.push({
            user_id: tu.id,
            title: 'Tagged in Sick Leave',
            message: `${profile?.name || 'Staff'} submitted Sick Leave and tagged you for dates: ${stagedDates.join(', ')}`,
            type: 'warning',
            is_read: false,
            created_at: new Date().toISOString()
          });
        }
      });

      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications);
      }

      setStagedDates([]);
      setDriveLink('');
      setFileName('');
      setBase64File('');
      setMessage('');
      setTaggedUsers([]);
      alert("Sick Leave request submitted, synced to Admin tracker, and notifications sent!");
      await fetchLeaves();
    } catch (err: any) {
      console.error(err);
      alert(`Submission failed: ${err.message || 'Error occurred.'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen p-2 sm:p-4 md:p-8 max-w-7xl mx-auto space-y-4 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 sm:gap-6 px-1 md:px-0">
        <div className="space-y-2 sm:space-y-3">
          <button 
            onClick={onBack}
            className="group flex items-center gap-2 text-white/40 hover:text-red-400 transition-colors text-sm font-semibold inline-flex"
          >
            <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
            Back to Dashboard
          </button>
          
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-white tracking-tight leading-none uppercase italic">
              Sick <span className="text-red-500">Leave</span>
            </h1>
            <div className="self-start sm:self-auto bg-red-500/10 border border-red-500/20 rounded-full px-3 py-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-red-400 flex items-center gap-1.5 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              SL Manager
            </div>
          </div>
          
          <p className="text-white/40 text-[10px] sm:text-xs font-medium max-w-md uppercase tracking-[0.1em] leading-relaxed hidden sm:block">
            Easy booking with live limit enforcement and medical prescription compliance.
          </p>
        </div>

        {/* Balance cards */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 shrink-0 w-full xl:w-auto">
          <div className="glass p-3 sm:p-5 rounded-2xl border-white/5 flex flex-col justify-between min-w-[120px] sm:min-w-[150px]">
            <span className="text-[9px] sm:text-[11px] font-black tracking-widest text-white/30 uppercase">Annual Eligible</span>
            <div className="text-xl sm:text-3xl font-black text-white/80 mt-1 sm:mt-2">{slEligible} Days</div>
          </div>
          <div className="glass p-3 sm:p-5 rounded-2xl border-white/5 flex flex-col justify-between min-w-[120px] sm:min-w-[150px]">
            <span className="text-[9px] sm:text-[11px] font-black tracking-widest text-red-400/40 uppercase">Remaining Balance</span>
            <div className="text-xl sm:text-3xl font-black text-red-400 mt-1 sm:mt-2">{slRemaining} Days</div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Calendar Column */}
        <div className="xl:col-span-2 space-y-4">
          <div className="glass p-3 sm:p-6 rounded-3xl border-white/[0.03] space-y-4">
            {/* Rota Timelines & Role Select Tab */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 pb-4 gap-3">
              <div className="flex flex-col">
                <span className="text-[10px] sm:text-[11px] font-black text-white uppercase tracking-widest font-bold">Select Active Rota & Role</span>
                <span className="text-[9px] text-white/30 font-medium">Toggle view/booking for CCRN / RN roles</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Role Filter Tabs */}
                <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl">
                  {(['CCRN', 'RN'] as const).map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setSelectedRole(role)}
                      className={cn(
                        "px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all",
                        selectedRole === role 
                          ? "bg-red-500 text-white shadow-lg shadow-red-500/20" 
                          : "text-white/30 hover:text-white/60 hover:bg-white/5",
                        !isAdmin && !profile?.roles.includes(role) && "opacity-20 grayscale cursor-not-allowed"
                      )}
                    >
                      {role}
                    </button>
                  ))}
                </div>

                <select
                  value={selectedTimelineIdx}
                  onChange={(e) => setSelectedTimelineIdx(Number(e.target.value))}
                  className="bg-black/40 border border-white/10 rounded-xl px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold text-white hover:border-white/20 transition-all outline-none"
                >
                  {ROTA_TIMELINES.map((t, i) => (
                    <option key={i} value={i} className="bg-slate-900 text-white">
                      {format(parseISO(t.start), 'MMM d, yyyy')} - {format(parseISO(t.end), 'MMM d, yyyy')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="h-[350px] flex items-center justify-center">
                <RefreshCw className="w-8 h-8 text-red-500 animate-spin" />
              </div>
            ) : (
              <Calendar 
                startDate={startDate}
                endDate={endDate}
                holidays={HOLIDAYS_2026}
                leaves={leaves.filter(l => l.type === 'SL')}
                stagedDates={stagedDates}
                selectedRole={selectedRole}
                currentUserId={profile?.id || ''}
                onDateClick={handleDateClick}
              />
            )}
          </div>
        </div>

        {/* Submission & Upload Column */}
        <div className="space-y-4">
          <div className="glass p-4 sm:p-6 rounded-3xl border-white/[0.03] space-y-5">
            <div>
              <h2 className="text-sm sm:text-base font-black text-white/95 uppercase tracking-wider italic">Request Details</h2>
              <p className="text-[9px] text-white/40 mt-1 uppercase tracking-wider font-semibold">Step 2: Attach documents & describe comment</p>
            </div>

            {/* Selected Days Count */}
            <div className="flex items-center justify-between p-3.5 bg-white/[0.01] border border-white/5 rounded-2xl">
              <div className="flex flex-col">
                <span className="text-[11px] font-black text-white/40 uppercase tracking-widest leading-none">Days Chosen:</span>
                <span className="text-[8px] sm:text-[9px] font-black text-white/30 uppercase tracking-widest mt-1">Role: {selectedRole}</span>
              </div>
              <span className="text-xs sm:text-sm font-black text-red-400 font-mono tracking-widest bg-red-400/10 px-2.5 py-1 rounded-lg">
                {stagedDates.length} Days
              </span>
            </div>

            {/* RULE NOTE */}
            {stagedDates.length > 2 && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-2.5 text-[10px] text-red-400 font-bold uppercase tracking-wide leading-relaxed">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  Prescription required! You have selected over 2 dates. Please upload a doctor prescription or provide a Google Drive file link to proceed.
                </div>
              </div>
            )}

            {/* Prescription Uploader tabs */}
            <div className="space-y-3">
              <span className="text-[10px] font-black tracking-widest text-white/30 uppercase font-bold">Medic Prescription (Attachment)</span>
              
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-black/40 border border-white/5 rounded-xl">
                <button
                  type="button"
                  onClick={() => setAttachMethod('upload')}
                  className={cn(
                    "py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                    attachMethod === 'upload' ? "bg-red-500 text-white shadow-lg" : "text-white/40 hover:text-white"
                  )}
                >
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => setAttachMethod('link')}
                  className={cn(
                    "py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                    attachMethod === 'link' ? "bg-red-500 text-white shadow-lg" : "text-white/40 hover:text-white"
                  )}
                >
                  Drive Link
                </button>
              </div>

              {attachMethod === 'upload' ? (
                <div className="mt-2 text-center">
                  {!base64File ? (
                    <label className="border-2 border-dashed border-white/5 hover:border-red-500/30 bg-black/35 rounded-2xl p-6 flex flex-col items-center justify-center gap-2.5 cursor-pointer hover:bg-red-500/[0.02] transition-all group">
                      <div className="w-10 h-10 rounded-xl bg-white/5 group-hover:bg-red-500/10 flex items-center justify-center transition-colors">
                        <UploadCloud className="w-5 h-5 text-white/40 group-hover:text-red-400 transition-colors" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-black text-white/80 uppercase tracking-widest group-hover:text-white transition-colors">Click to upload file</span>
                        <span className="text-[8px] font-bold text-white/30 uppercase tracking-widest">Supports Jpeg, Png, Pdf up to 5MB</span>
                      </div>
                      <input 
                        type="file" 
                        accept="image/*,application/pdf" 
                        onChange={handleFileChange}
                        className="hidden" 
                      />
                    </label>
                  ) : (
                    <div className="p-3 bg-red-500/[0.03] border border-red-500/10 rounded-2xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5 text-red-400" />
                        </div>
                        <div className="text-left min-w-0">
                          <div className="text-[10px] font-black uppercase text-white/90 truncate max-w-[120px] sm:max-w-[180px]">
                            {fileName}
                          </div>
                          <div className="text-[8px] font-bold uppercase text-white/30 font-mono mt-0.5">
                            {fileSize}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleClearAttachment}
                        className="p-2 hover:bg-red-500/10 text-white/40 hover:text-red-400 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="relative">
                    <input
                      type="url"
                      placeholder="Paste Google Drive shared link..."
                      value={driveLink}
                      onChange={(e) => setDriveLink(e.target.value)}
                      className="w-full bg-black/45 border border-white/5 focus:border-red-500/30 rounded-2xl pl-10 pr-4 py-3 text-xs font-bold text-white tracking-wide placeholder:text-white/20 outline-none transition-colors"
                    />
                    <LinkIcon className="absolute left-3.5 top-3.5 w-4 h-4 text-white/30" />
                  </div>
                  <span className="text-[8px] font-bold tracking-widest uppercase text-white/20 block px-1">Ensure permissions are set to "Anyone with the link"</span>
                </div>
              )}
            </div>

            {/* Tag Members */}
            <div className="space-y-1.5 sm:space-y-2 relative" ref={tagRef}>
              <span className="text-[10px] font-black text-white/30 uppercase tracking-widest font-bold">Tag Members (Optional)</span>
              <div 
                onClick={() => setIsTagging(!isTagging)}
                className="w-full min-h-[44px] bg-black/45 border border-white/5 focus:border-red-500/30 rounded-2xl px-3 sm:px-4 py-2.5 text-white flex items-center justify-between cursor-pointer group hover:border-red-500/30 transition-all font-bold"
              >
                <div className="flex flex-wrap gap-1.5 items-center flex-1">
                  <UserPlus className="w-3.5 h-3.5 text-white/30 group-hover:text-red-400 shrink-0" />
                  {taggedUsers.length === 0 ? (
                    <span className="text-[11px] text-white/20 uppercase tracking-wider font-extrabold text-[10px]">Select staff to tag</span>
                  ) : (
                    taggedUsers.map(u => (
                      <span 
                        key={u.id} 
                        className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-lg border border-black/10 flex items-center gap-1 animate-in fade-in zoom-in duration-200"
                      >
                        @{u.name.split(' ')[0]}
                        <X 
                          className="w-2.5 h-2.5 hover:scale-125 transition-transform" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setTaggedUsers(taggedUsers.filter(tu => tu.id !== u.id));
                          }}
                        />
                      </span>
                    ))
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {taggedUsers.length > 0 && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setTaggedUsers([]);
                      }}
                      className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-red-400"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {isTagging && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute z-[110] bottom-full left-0 right-0 mb-2 bg-[#0e1217] border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-60 flex flex-col backdrop-blur-xl"
                >
                  <div className="p-2 sm:p-3 border-b border-white/5 bg-white/5 flex items-center gap-2">
                      <Search className="w-3 h-3 text-white/40" />
                      <input 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.preventDefault();
                        }}
                        className="bg-transparent border-none text-[11px] sm:text-xs text-white focus:outline-none w-full font-bold"
                        placeholder="Search staff to tag..."
                        autoFocus
                      />
                  </div>
                  <div className="overflow-y-auto">
                    {filteredStaff.length === 0 ? (
                      <div className="p-6 text-center text-[9px] text-white/20 uppercase tracking-widest font-black">
                        No staff found
                      </div>
                    ) : filteredStaff.map(s => {
                      const isSelected = taggedUsers.some(u => u.id === s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleTag(s);
                            setSearchTerm('');
                          }}
                          className={cn(
                            "w-full px-4 py-2.5 sm:py-3 text-left hover:bg-white/5 flex items-center justify-between group transition-colors border-b border-white/[0.02] last:border-0",
                            isSelected && "bg-red-500/10"
                          )}
                        >
                          <div>
                            <div className={cn(
                              "text-xs sm:text-sm font-bold transition-colors",
                              isSelected ? "text-red-400" : "text-white group-hover:text-red-400"
                            )}>
                              {s.name}
                            </div>
                            <div className="text-[9px] text-white/30 uppercase tracking-widest font-black">
                              {s.roles && Array.isArray(s.roles) ? s.roles.join(', ') : 'No Role'}
                            </div>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-red-500" />}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Reason/Comment Input */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-black text-white/30 uppercase tracking-widest font-bold">Comments/Reason (Optional)</span>
              <textarea
                placeholder="Details of your absence or comments for approval..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="w-full bg-black/45 border border-white/5 focus:border-red-500/30 rounded-2xl p-3.5 text-xs font-bold text-white tracking-wide placeholder:text-white/20 outline-none transition-colors"
              />
            </div>

            {/* List of staged dates */}
            {stagedDates.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] font-black text-white/30 uppercase tracking-widest font-bold">Dates Selected:</span>
                <div className="flex flex-wrap gap-1.5">
                  {stagedDates.sort().map(d => (
                    <span key={d} className="bg-red-500/5 border border-red-500/10 text-red-400 font-mono text-[9px] font-bold px-2 py-1 rounded-lg">
                      {format(parseISO(d), 'dd MMM yyyy')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Action Submit */}
            <button
              onClick={handleSubmit}
              disabled={stagedDates.length === 0 || submitting}
              className={cn(
                "w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2",
                stagedDates.length === 0 ? "bg-white/5 text-white/20 cursor-not-allowed border border-white/5" :
                submitting ? "bg-red-500/40 text-white cursor-wait" : "bg-red-600 hover:bg-red-700 text-white cursor-pointer shadow-[0_0_25px_rgba(239,68,68,0.2)] active:scale-95"
              )}
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Submitting Request...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Apply For Sick Leave
                </>
              )}
            </button>
          </div>

          {/* Rules Panel */}
          <div className="glass p-4 sm:p-6 rounded-3xl border-white/[0.03] space-y-3">
            <h3 className="text-[10px] sm:text-xs font-black text-red-400 uppercase tracking-widest flex items-center gap-2">
              <Info className="w-4 h-4" />
              Sick Leave Policy Rules
            </h3>
            <ul className="space-y-2 text-[9px] sm:text-[10px] font-medium text-white/50 uppercase tracking-wide leading-relaxed">
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-red-500/50 rounded-full shrink-0 mt-1" />
                <span>Eligibility limit: Max 12 days per calendar year.</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-red-500/50 rounded-full shrink-0 mt-1" />
                <span>Can NOT club AL, LR, or OPH/PH holidays on consecutive or same dates together.</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-red-500/50 rounded-full shrink-0 mt-1" />
                <span>Sick leave lasting 3 or more consecutive days MANDATORILY requires uploading prescription.</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-red-500/50 rounded-full shrink-0 mt-1" />
                <span>All requests sync directly to Admin balance database upon approvals.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
