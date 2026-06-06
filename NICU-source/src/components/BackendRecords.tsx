import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  Search, 
  Download, 
  Copy, 
  Check, 
  Calendar, 
  Filter, 
  Users, 
  SlidersHorizontal, 
  FileSpreadsheet,
  RefreshCw,
  Clock,
  Briefcase,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { ROTA_TIMELINES, getDefaultTimelineIdx } from '../constants';
import { cn } from '../lib/utils';
import { Profile } from '../types';

interface LeafRecord {
  id: string;
  user_id: string;
  user_name: string;
  type: 'AL' | 'LR' | 'SL';
  date: string;
  locked_for_role: 'CCRN' | 'RN';
  created_at: string;
}

interface RequestRecord {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  dates: string[];
  message: string;
  status: string;
  created_at: string;
  tagged_user_name?: string;
}

// Unified Record shape for the unified table
interface UnifiedRecord {
  id: string;
  userId: string;
  userName: string;
  userRoles: string[];
  category: 'Annual Leave' | 'Leave Request' | 'Sick Leave' | 'Manual Request';
  actionLabel: string;
  roleType: 'CCRN' | 'RN' | 'N/A';
  dates: string[]; // sorted dates
  dateRangeStr: string; // e.g. "Jun 24 - Jun 26 (3 days)" or single date
  message: string;
  status: 'Approved' | 'Pending' | 'Rejected' | 'N/A';
  createdAt: string;
}

export default function BackendRecords({ onBack }: { onBack: () => void }) {
  const { profile } = useAuth();
  
  // Loading & State
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [leaves, setLeaves] = useState<LeafRecord[]>([]);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  
  // Copy feedback
  const [copied, setCopied] = useState(false);
  
  // Filters State
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'CCRN' | 'RN'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'AL' | 'LR' | 'SL' | 'MANUAL'>('ALL');
  const [timelineFilter, setTimelineFilter] = useState<string>('ALL'); // 'ALL' or index as string
  const [searchQuery, setSearchQuery] = useState('');
  
  // Display config
  const [groupConsecutive, setGroupConsecutive] = useState(true);

  // Auto-fill timeline index in filters
  useEffect(() => {
    const currentIdx = getDefaultTimelineIdx();
    setTimelineFilter(currentIdx.toString());
  }, []);

  const isAdmin = profile?.roles.includes('Admin');

  useEffect(() => {
    if (isAdmin) {
      fetchRecords();
    }
  }, [isAdmin]);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      // 1. Fetch Profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*');
      if (profilesError) throw profilesError;
      setProfiles(profilesData || []);

      const pMap: Record<string, Profile> = {};
      (profilesData || []).forEach(p => {
        pMap[p.id] = p;
      });

      // 2. Fetch leaves (locked active schedules)
      const { data: leavesData, error: leavesError } = await supabase
        .from('leaves')
        .select('*');
      if (leavesError) throw leavesError;
      setLeaves((leavesData || []).map(l => ({
        ...l,
        user_name: pMap[l.user_id]?.name || l.user_name || 'Staff Member'
      })));

      // 3. Fetch requests (including manual ones)
      const { data: requestsData, error: requestsError } = await supabase
        .from('requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (requestsError) throw requestsError;
      setRequests((requestsData || []).map(r => ({
        ...r,
        user_name: pMap[r.user_id]?.name || r.user_name || 'Staff Member'
      })));

    } catch (error) {
      console.error('Error fetching backend records:', error);
    } finally {
      setLoading(false);
    }
  };

  // Profile Mapping Helper
  const profileMap = useMemo(() => {
    const map: Record<string, Profile> = {};
    profiles.forEach(p => {
      map[p.id] = p;
    });
    return map;
  }, [profiles]);

  // Transform raw database tables into unified records
  const unifiedRecords = useMemo(() => {
    const records: UnifiedRecord[] = [];

    // Category 1, 2, 3: Approved Active Planner Placements (from leaves)
    if (groupConsecutive) {
      // Group leaves by user and type and role to build ranges
      const userGroups: Record<string, LeafRecord[]> = {};
      leaves.forEach(l => {
        const key = `${l.user_id}_${l.type}_${l.locked_for_role}`;
        if (!userGroups[key]) userGroups[key] = [];
        userGroups[key].push(l);
      });

      // Group into contiguous date ranges
      Object.entries(userGroups).forEach(([key, list]) => {
        // Sort chronologically
        list.sort((a, b) => a.date.localeCompare(b.date));

        const ranges: LeafRecord[][] = [];
        let currentRange: LeafRecord[] = [];

        list.forEach((l) => {
          if (currentRange.length === 0) {
            currentRange.push(l);
          } else {
            const lastDate = new Date(currentRange[currentRange.length - 1].date);
            const thisDate = new Date(l.date);
            const diffTime = Math.abs(thisDate.getTime() - lastDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 1) {
              currentRange.push(l);
            } else {
              ranges.push(currentRange);
              currentRange = [l];
            }
          }
        });
        if (currentRange.length > 0) {
          ranges.push(currentRange);
        }

        // Add grouped ranges to unified records
        ranges.forEach((range, idx) => {
          const first = range[0];
          const last = range[range.length - 1];
          const dates = range.map(r => r.date).sort();
          
          let rangeLabel = '';
          if (dates.length === 1) {
            rangeLabel = first.date;
          } else {
            rangeLabel = `${first.date} to ${last.date} (${dates.length} days)`;
          }

          let category: UnifiedRecord['category'] = 'Annual Leave';
          if (first.type === 'LR') category = 'Leave Request';
          else if (first.type === 'SL') category = 'Sick Leave';

          const userProf = profileMap[first.user_id];
          const roles = userProf?.roles || [];

          records.push({
            id: `leaf-range-${first.user_id}-${first.type}-${first.date}-${idx}`,
            userId: first.user_id,
            userName: first.user_name,
            userRoles: roles,
            category: category,
            actionLabel: category,
            roleType: first.locked_for_role,
            dates: dates,
            dateRangeStr: rangeLabel,
            message: 'Active schedule allocation locked on Planner.',
            status: 'Approved',
            createdAt: first.created_at || new Date().toISOString()
          });
        });
      });
    } else {
      // Non-grouped individual dates from leaves
      leaves.forEach(l => {
        let category: UnifiedRecord['category'] = 'Annual Leave';
        if (l.type === 'LR') category = 'Leave Request';
        else if (l.type === 'SL') category = 'Sick Leave';

        const userProf = profileMap[l.user_id];
        const roles = userProf?.roles || [];

        records.push({
          id: `leaf-${l.id}`,
          userId: l.user_id,
          userName: l.user_name,
          userRoles: roles,
          category: category,
          actionLabel: category,
          roleType: l.locked_for_role,
          dates: [l.date],
          dateRangeStr: l.date,
          message: 'Active schedule locked on Planner.',
          status: 'Approved',
          createdAt: l.created_at || new Date().toISOString()
        });
      });
    }

    // Category 4: Manual Requests from requests table (ignoring system sync entries)
    const plannerKeywords = ['planner', 'al_sync', 'lr_sync', 'sl_sync', 'sl sync'];
    const manualDbRequests = requests.filter(r => 
      !plannerKeywords.some(key => r.action.toLowerCase().includes(key)) &&
      !r.action.includes('(Planner)')
    );

    manualDbRequests.forEach(r => {
      const userProf = profileMap[r.user_id];
      const roles = userProf?.roles || [];
      const userPrimaryRole = roles.includes('CCRN') ? 'CCRN' : roles.includes('RN') ? 'RN' : 'N/A';

      // Assemble range string for requests
      let rangeLabel = 'N/A';
      const sortedDates = [...(r.dates || [])].sort();
      if (sortedDates.length === 1) {
        rangeLabel = sortedDates[0];
      } else if (sortedDates.length > 1) {
        rangeLabel = `${sortedDates[0]} to ${sortedDates[sortedDates.length - 1]} (${sortedDates.length} days)`;
      }

      records.push({
        id: `req-${r.id}`,
        userId: r.user_id,
        userName: r.user_name,
        userRoles: roles,
        category: 'Manual Request',
        actionLabel: `Req: ${r.action}`,
        roleType: userPrimaryRole as any,
        dates: sortedDates,
        dateRangeStr: rangeLabel,
        message: r.message,
        status: (r.status.charAt(0).toUpperCase() + r.status.slice(1)) as any,
        createdAt: r.created_at
      });
    });

    // Sort chronologically by creation or dates
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [leaves, requests, profileMap, groupConsecutive]);

  // Filter Logic
  const filteredRecords = useMemo(() => {
    return unifiedRecords.filter(record => {
      // 1. Role Filter
      if (roleFilter !== 'ALL') {
        // Must either match roleType directly or user must have the role
        if (record.roleType !== 'N/A' && record.roleType !== roleFilter) {
          return false;
        }
        if (record.roleType === 'N/A' && !record.userRoles.includes(roleFilter)) {
          return false;
        }
      }

      // 2. Type Filter
      if (typeFilter !== 'ALL') {
        if (typeFilter === 'AL' && record.category !== 'Annual Leave') return false;
        if (typeFilter === 'LR' && record.category !== 'Leave Request') return false;
        if (typeFilter === 'SL' && record.category !== 'Sick Leave') return false;
        if (typeFilter === 'MANUAL' && record.category !== 'Manual Request') return false;
      }

      // 3. Rota Timeline Filter
      if (timelineFilter !== 'ALL') {
        const timelineIdx = parseInt(timelineFilter, 10);
        if (!isNaN(timelineIdx) && ROTA_TIMELINES[timelineIdx]) {
          const t = ROTA_TIMELINES[timelineIdx];
          
          // Row matches if ANY of its requested/allocated dates fall inside this timeline
          if (record.dates.length > 0) {
            const hasDateInTimeline = record.dates.some(dStr => dStr >= t.start && dStr <= t.end);
            if (!hasDateInTimeline) return false;
          } else {
            // If manual request has no dates, falls back to checking its creation date
            const createdDate = record.createdAt.substring(0, 10);
            if (createdDate < t.start || createdDate > t.end) return false;
          }
        }
      }

      // 4. Search Query (Name/Message/Action)
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const nameMatch = record.userName.toLowerCase().includes(query);
        const msgMatch = record.message.toLowerCase().includes(query);
        const actionMatch = record.actionLabel.toLowerCase().includes(query);
        if (!nameMatch && !msgMatch && !actionMatch) return false;
      }

      return true;
    });
  }, [unifiedRecords, roleFilter, typeFilter, timelineFilter, searchQuery]);

  // Export as CSV File
  const handleExportCSV = () => {
    if (filteredRecords.length === 0) return;
    
    const headers = ['Staff Name', 'Category', 'Target/User Role', 'Dates Description', 'Message/Details', 'Status', 'Date Captured'];
    const csvContent = [
      headers.join(','),
      ...filteredRecords.map(r => [
        `"${r.userName.replace(/"/g, '""')}"`,
        `"${r.category}"`,
        `"${r.roleType}"`,
        `"${r.dateRangeStr.replace(/"/g, '""')}"`,
        `"${r.message.replace(/"/g, '""').replace(/\n/g, ' ')}"`,
        `"${r.status}"`,
        `"${r.createdAt.substring(0, 10)}"`
      ].join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `backend_schedule_records_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy to Clipboard as TSV (Tab-Separated Data) for native Google Sheets pasting
  const handleCopyToClipboard = () => {
    if (filteredRecords.length === 0) return;

    const headers = ['Staff Name\tCategory\tTarget/User Role\tDates Description\tDetails/Comments\tStatus\tDate Captured'];
    const rows = filteredRecords.map(r => 
      `${r.userName}\t${r.category}\t${r.roleType}\t${r.dateRangeStr}\t${r.message.replace(/\n/g, ' ')}\t${r.status}\t${r.createdAt.substring(0, 10)}`
    );

    const formattedTSV = [headers[0], ...rows].join('\n');

    navigator.clipboard.writeText(formattedTSV).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy records:', err);
    });
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950 text-white">
        <div className="glass p-8 max-w-md text-center rounded-[2rem] border border-red-500/20">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-black uppercase tracking-widest text-red-400 mb-2">Access Restrained</h2>
          <p className="text-white/40 text-sm leading-relaxed mb-6">
            The Backend Record hub is locked and exclusively allocated for Administrators and Rota Engineers.
          </p>
          <button 
            onClick={onBack}
            className="bg-white/10 hover:bg-white/20 text-white w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-8 md:p-12 relative overflow-hidden bg-slate-950 text-white">
      {/* Dynamic gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-amber-500/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-indigo-500/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto space-y-8 relative z-10">
        
        {/* Header Ribbon */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/5">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="glass p-3 rounded-2xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-all active:scale-95"
              title="Return to Dashboard"
              id="back-to-home-btn"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="inline-flex items-center gap-2 bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest mb-1.5">
                Admin Center
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-none">
                Backend Schedule Records
              </h1>
              <p className="text-white/40 text-[10px] sm:text-xs font-black uppercase tracking-widest mt-1.5">
                Consolidated audit table for lock planners and manual entries
              </p>
            </div>
          </div>

          {/* Action Tools */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={fetchRecords}
              className="glass p-3.5 rounded-xl text-white/50 hover:text-white hover:bg-white/5 border border-white/10 active:scale-95 transition-all"
              title="Refresh database records"
              id="refresh_records_btn"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </button>

            {/* Range grouping toggler */}
            <button
              onClick={() => setGroupConsecutive(!groupConsecutive)}
              className={cn(
                "glass px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 border transition-all",
                groupConsecutive 
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                  : "bg-white/5 text-white/40 border-white/5 hover:text-white"
              )}
              title="Toggle grouping of consecutive calendar days"
              id="toggle_grouping_btn"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {groupConsecutive ? "Grouped Ranges" : "Individual Days"}
            </button>

            {/* Sheets TSV Fast Copy Button */}
            <button
              onClick={handleCopyToClipboard}
              disabled={filteredRecords.length === 0}
              className={cn(
                "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-300 relative shadow-lg active:scale-95 disabled:opacity-30 disabled:pointer-events-none",
                copied 
                  ? "bg-green-600 text-white" 
                  : "bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white shadow-emerald-950/40"
              )}
              title="Copy formatted layout ready to paste with Ctrl+V inside Google Sheets"
              id="copy_tsv_btn"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy for Google Sheet"}
            </button>

            {/* Standard CSV File Download */}
            <button
              onClick={handleExportCSV}
              disabled={filteredRecords.length === 0}
              className="bg-white/10 hover:bg-white/20 active:scale-95 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-white/10 transition-all shadow-lg shadow-black/20 disabled:opacity-30"
              title="Download standard comma-separated Excel files"
              id="download_csv_btn"
            >
              <Download className="w-4 h-4" />
              Download CSV
            </button>
          </div>
        </div>

        {/* Dynamic Filters Console */}
        <div className="glass p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border border-white/5 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 text-white/30 font-black uppercase tracking-wider text-[10px]">
            <Filter className="w-3.5 h-3.5" />
            <span>Search & Extraction Filters</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Search Input */}
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-white/30 pointer-events-none">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search staff name or messages..."
                className="w-full bg-slate-900/60 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 sm:py-3 text-xs sm:text-sm text-white placeholder-white/30 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                id="records_search_input"
              />
            </div>

            {/* Rota Selector */}
            <div className="space-y-1">
              <select
                value={timelineFilter}
                onChange={(e) => setTimelineFilter(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 sm:py-3 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500 transition-all font-semibold"
                id="records_rota_select"
              >
                <option value="ALL">All Rota Periods</option>
                {ROTA_TIMELINES.map((t, idx) => (
                  <option key={t.label} value={idx}>
                    {t.label} ({t.start} to {t.end})
                  </option>
                ))}
              </select>
            </div>

            {/* Clinical Role Filter */}
            <div className="space-y-1">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 sm:py-3 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500 transition-all font-semibold"
                id="records_role_select"
              >
                <option value="ALL">All Roles (CCRN & RN)</option>
                <option value="CCRN">CCRN Only</option>
                <option value="RN">RN Only</option>
              </select>
            </div>

            {/* Record Type Filter */}
            <div className="space-y-1">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 sm:py-3 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500 transition-all font-semibold"
                id="records_type_select"
              >
                <option value="ALL">All Record Layouts</option>
                <option value="AL">Annual Leaves (AL)</option>
                <option value="LR">Leave Requests (LR)</option>
                <option value="SL">Sick Leaves (SL)</option>
                <option value="MANUAL">Manual Requests (Form Presets)</option>
              </select>
            </div>

          </div>

          {/* Prompt Guidelines on copy action */}
          <div className="bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors border border-emerald-500/10 rounded-xl p-3 flex items-start gap-2.5">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[10px] sm:text-xs text-white/50 leading-relaxed font-black uppercase tracking-wider">
              <strong className="text-emerald-400">Google Sheets Tip:</strong> Filtering updates the records on the fly. Click <span className="text-emerald-400">"Copy for Google Sheet"</span>, open any spreadsheet, select a cell, and press <strong className="text-white">Ctrl+V</strong> to paste columns instantly!
            </p>
          </div>
        </div>

        {/* Results Metadata Section */}
        <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-white/30 px-2">
          <div>
            Showing <span className="text-white/60">{filteredRecords.length}</span> records
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              <span>Leaves (AL/LR/SL)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Manual Requests</span>
            </div>
          </div>
        </div>

        {/* Main Audit Grid Table */}
        <div className="glass rounded-[1.5rem] sm:rounded-[2rem] border border-white/5 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.01] text-[10px] font-black uppercase tracking-wider text-white/40">
                  <th className="py-4 px-6">Staff Member</th>
                  <th className="py-4 px-4">Category</th>
                  <th className="py-4 px-4">Allocated/User Role</th>
                  <th className="py-4 px-4">Dates Description / Applied Range</th>
                  <th className="py-4 p-4 min-w-[200px]">Details & Comments</th>
                  <th className="py-4 px-4 text-center">Status</th>
                  <th className="py-4 px-6 text-right">Captured</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-24 text-center">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
                          <span className="text-xs font-black uppercase tracking-widest text-white/40">Querying DB Store...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-24 text-center text-white/30">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <AlertCircle className="w-10 h-10 text-white/20" />
                          <span className="text-xs font-black uppercase tracking-widest">No matching records found.</span>
                          <span className="text-[10px] leading-none text-white/20 tracking-tighter uppercase font-medium">Verify your selection filters or search inputs</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((r) => {
                      const isManual = r.category === 'Manual Request';
                      
                      return (
                        <motion.tr
                          key={r.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                        >
                          {/* Staff Member */}
                          <td className="py-4 px-6 font-semibold">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-blue-400 font-black text-xs">
                                {r.userName.charAt(0)}
                              </div>
                              <div>
                                <div className="text-white/90 truncate max-w-[150px] sm:max-w-none">{r.userName}</div>
                                <div className="text-[9px] text-white/30 font-mono tracking-wider truncate max-w-[150px]">ID: {r.userId.slice(0, 8)}...</div>
                              </div>
                            </div>
                          </td>

                          {/* Category */}
                          <td className="py-4 px-4 font-black text-[10px] sm:text-xs">
                            <span className={cn(
                              "px-2.5 py-1 rounded-md uppercase tracking-wider text-[9px] font-black inline-flex items-center gap-1.5",
                              r.category === 'Annual Leave' && "bg-blue-500/10 text-blue-400 border border-blue-500/25",
                              r.category === 'Leave Request' && "bg-orange-500/10 text-orange-400 border border-orange-500/25",
                              r.category === 'Sick Leave' && "bg-red-500/10 text-red-500 border border-red-500/25",
                              r.category === 'Manual Request' && "bg-amber-500/10 text-amber-400 border border-amber-500/25"
                            )}>
                              {isManual ? <Briefcase className="w-2.5 h-2.5" /> : <Calendar className="w-2.5 h-2.5" />}
                              {r.category}
                            </span>
                          </td>

                          {/* Allocated / User Role */}
                          <td className="py-4 px-4 font-mono text-[10px] sm:text-xs">
                            <span className={cn(
                              "px-2 py-0.5 rounded font-black",
                              r.roleType === 'CCRN' && "bg-purple-500/10 text-purple-400",
                              r.roleType === 'RN' && "bg-teal-500/10 text-teal-400",
                              r.roleType === 'N/A' && "bg-white/5 text-white/20"
                            )}>
                              {r.roleType === 'N/A' ? 'None' : r.roleType}
                            </span>
                          </td>

                          {/* Dates Description */}
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-white/30 shrink-0" />
                              <div className="font-mono text-[11px] text-white/80 shrink-0">
                                {r.dateRangeStr}
                              </div>
                            </div>
                          </td>

                          {/* Message / Details */}
                          <td className="py-4 p-4 text-white/50 text-[11px] leading-relaxed max-w-xs sm:max-w-md">
                            {isManual && (
                              <div className="font-black text-amber-400/80 uppercase text-[9px] tracking-wider mb-0.5 inline-block">
                                Action: {r.actionLabel.replace('Req: ', '')}
                              </div>
                            )}
                            <div className="line-clamp-2 truncate" title={r.message}>
                              {r.message}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-4 px-4 text-center">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0",
                              r.status === 'Approved' && "bg-green-500/10 text-green-400 border border-green-500/20",
                              r.status === 'Pending' && "bg-amber-500/10 text-amber-400 border border-amber-500/20",
                              r.status === 'Rejected' && "bg-red-500/10 text-red-500 border border-red-500/20",
                              r.status === 'N/A' && "bg-white/5 text-white/20"
                            )}>
                              {r.status === 'N/A' ? 'Approved' : r.status}
                            </span>
                          </td>

                          {/* Created date representation */}
                          <td className="py-4 px-6 text-right font-mono text-[10px] text-white/30 whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <Clock className="w-3 h-3" />
                              <span>{r.createdAt.slice(0, 10)} {r.createdAt.slice(11, 16)}</span>
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
