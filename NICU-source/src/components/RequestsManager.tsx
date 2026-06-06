import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  Send, 
  Clock, 
  CheckCircle2, 
  UserPlus, 
  Calendar as CalendarIcon,
  Download,
  Search,
  Check,
  AlertCircle,
  Loader2,
  X,
  RotateCcw,
  FileText,
  ExternalLink,
  Link as LinkIcon
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { ROTA_TIMELINES } from '../constants';

interface Profile {
  id: string;
  name: string;
  email: string;
  roles: string[];
}

interface RequestItem {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  dates: string[];
  message: string;
  tagged_user_id: string | null;
  tagged_user_name: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at?: string;
}

interface RequestsManagerProps {
  onBack: () => void;
}

export default function RequestsManager({ onBack }: RequestsManagerProps) {
  const { user, profile } = useAuth();
  
  // More robust admin check
  const isAdmin = profile?.roles?.some(r => r.toLowerCase() === 'admin');
  
  const [activeTab, setActiveTab] = useState<'create' | 'manual' | 'al-sync' | 'lr-sync' | 'sl-sync'>('al-sync');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [manualRequests, setManualRequests] = useState<RequestItem[]>([]);
  const [plannerRequests, setPlannerRequests] = useState<RequestItem[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [expandedTimelines, setExpandedTimelines] = useState<Record<string, boolean>>({});
  const [alRoleFilter, setAlRoleFilter] = useState<'All' | 'CCRN' | 'RN'>('All');
  const [manualRoleFilter, setManualRoleFilter] = useState<'All' | 'CCRN' | 'RN'>('All');
  const [lrRoleFilter, setLrRoleFilter] = useState<'All' | 'CCRN' | 'RN'>('All');
  const [slRoleFilter, setSlRoleFilter] = useState<'All' | 'CCRN' | 'RN'>('All');

  const alPlannerRequests = plannerRequests.filter(r => 
    r.action.toLowerCase().includes('annual leave') || r.action.toLowerCase().includes('al')
  );
  
  const filteredAlPlannerRequests = alPlannerRequests.filter(r => {
    if (alRoleFilter === 'All') return true;
    const userProfile = staff.find(s => s.id === r.user_id);
    return userProfile?.roles?.some(role => role.toUpperCase() === alRoleFilter.toUpperCase());
  });

  const slPlannerRequests = plannerRequests.filter(r => 
    r.action.toLowerCase().includes('sick leave') || r.action.toLowerCase().includes('sl')
  ).filter(r => !r.action.toLowerCase().includes('annual leave') && !r.action.toLowerCase().includes('al'));

  const filteredSlPlannerRequests = slPlannerRequests.filter(r => {
    if (slRoleFilter === 'All') return true;
    const userProfile = staff.find(s => s.id === r.user_id);
    return userProfile?.roles?.some(role => role.toUpperCase() === slRoleFilter.toUpperCase());
  });

  const filteredManualRequests = manualRequests.filter(r => {
    if (manualRoleFilter === 'All') return true;
    const userProfile = staff.find(s => s.id === r.user_id);
    return userProfile?.roles?.some(role => role.toUpperCase() === manualRoleFilter.toUpperCase());
  });

  const lrPlannerRequests = plannerRequests.filter(r => 
    (r.action.toLowerCase().includes('leave request') || r.action.toLowerCase().includes('lr')) &&
    !r.action.toLowerCase().includes('sick leave') &&
    !r.action.toLowerCase().includes('sl')
  );

  const filteredLrPlannerRequests = lrPlannerRequests.filter(r => {
    if (lrRoleFilter === 'All') return true;
    const userProfile = staff.find(s => s.id === r.user_id);
    return userProfile?.roles?.some(role => role.toUpperCase() === lrRoleFilter.toUpperCase());
  });

  const getTimelineLabel = (dates: string[]) => {
    if (!dates || dates.length === 0) return 'No Dates';
    const firstDate = dates[0];
    const timeline = ROTA_TIMELINES.find(t => firstDate >= t.start && firstDate <= t.end);
    return timeline ? timeline.label : 'Outside Timeline';
  };

  const lrGroups = filteredLrPlannerRequests.reduce((acc, req) => {
    const label = getTimelineLabel(req.dates);
    if (!acc[label]) acc[label] = [];
    acc[label].push(req);
    return acc;
  }, {} as Record<string, RequestItem[]>);
  
  const toggleTimeline = (label: string) => {
    setExpandedTimelines(prev => ({
      ...prev,
      [label]: !prev[label]
    }));
  };
  
  // Form State
  const [selectedPreset, setSelectedPreset] = useState('Exchange Request');
  const [customAction, setCustomAction] = useState('');
  const [action, setAction] = useState('Exchange Request');
  const [message, setMessage] = useState('');

  // Keep `action` in sync with the selected preset and custom text input
  useEffect(() => {
    if (selectedPreset === 'Others') {
      setAction(customAction);
    } else {
      setAction(selectedPreset);
    }
  }, [selectedPreset, customAction]);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [taggedUsers, setTaggedUsers] = useState<{id: string, name: string}[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isTagging, setIsTagging] = useState(false);
  const tagRef = React.useRef<HTMLDivElement>(null);
  
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  
  const [successMsg, setSuccessMsg] = useState(false);

  useEffect(() => {
    if (user) {
      fetchData();
    }
    
    // Click away listener
    const handleClickOutside = (event: MouseEvent) => {
      if (tagRef.current && !tagRef.current.contains(event.target as Node)) {
        setIsTagging(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch Requests
      const { data: requestsData, error: requestsError } = await supabase
        .from('requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (requestsError) {
        if (requestsError.code !== 'PGRST116' && !requestsError.message.includes('not found')) {
            throw requestsError;
        }
      } 
      
      const realRequests = requestsData || [];
      
      // Partition requests
      // Manual: Requests without (Planner), Annual Leave, or Leave Request in action
      // Planner: Requests with (Planner), Annual Leave, or Leave Request in action OR pseudo-requests from 'leaves'
      const plannerKeywords = ['planner', 'annual leave', 'leave request', 'sick leave', 'sl_sync', 'sl sync'];
      const dbPlannerItems = realRequests.filter(r => 
        plannerKeywords.some(key => r.action.toLowerCase().includes(key))
      );
      const manualItems = realRequests.filter(r => 
        !plannerKeywords.some(key => r.action.toLowerCase().includes(key))
      );
      
      setManualRequests(manualItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      
      // Fetch Leaves (AL/LR) to show as planner requests
      const { data: leavesData, error: leavesError } = await supabase
        .from('leaves')
        .select('*')
        .order('created_at', { ascending: false });

      let plannerItems: RequestItem[] = [...dbPlannerItems];

      if (!leavesError && leavesData) {
        const userTypeGroups: Record<string, {
          user_id: string,
          user_name: string,
          type: string,
          dates: string[],
          created_at: string
        }> = {};

        leavesData.forEach(l => {
          const type = l.type || (l.action?.includes('AL') ? 'AL' : l.action?.includes('SL') ? 'SL' : 'LR');
          const key = `${l.user_id}_${type}`;
          if (!userTypeGroups[key]) {
            userTypeGroups[key] = {
              user_id: l.user_id,
              user_name: l.user_name || 'Staff Member',
              type: type,
              dates: [],
              created_at: l.created_at || new Date().toISOString()
            };
          }
          userTypeGroups[key].dates.push(l.date);
        });

      Object.values(userTypeGroups).forEach(group => {
            let displayType = 'Leave Request';
            if (group.type === 'AL') {
              displayType = 'Annual Leave';
            } else if (group.type === 'SL') {
              displayType = 'Sick Leave';
            }
            const actionLabel = `${displayType} (Planner)`;
            
            // Collect all dates that are already in a PENDING or APPROVED request for this user and action
            const datesInDbRequests = new Set(
              dbPlannerItems
                .filter(r => 
                  r.user_id === group.user_id && 
                  (r.status === 'pending' || r.status === 'approved') &&
                  r.action.toLowerCase().includes(displayType.toLowerCase())
                )
                .flatMap(r => r.dates || [])
            );

            // Filter the leaves dates to find those NOT yet in a request
            const missingDates = group.dates.filter(d => !datesInDbRequests.has(d));

            if (missingDates.length > 0) {
                plannerItems.push({
                  id: `leave-ref-${group.user_id}-${group.type}`,
                  user_id: group.user_id,
                  user_name: group.user_name,
                  action: actionLabel,
                  dates: missingDates.sort(),
                  message: `New sync needed for ${missingDates.length} date(s)`,
                  status: 'pending',
                  tagged_user_id: null,
                  tagged_user_name: null,
                  created_at: group.created_at
                });
            }
        });
      }

      setPlannerRequests(plannerItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));

      // Fetch Staff for tagging
      // We try to fetch all profiles. If RLS blocks it, we will only see the current user or nothing.
      const { data: staffData, error: staffError } = await supabase
        .from('profiles')
        .select('id, name, email, roles')
        .order('name');
      
      if (!staffError) {
        setStaff(staffData || []);
      } else {
        console.error('Error fetching staff for tagging:', staffError);
        // Fallback to current user if we can't fetch others
        if (profile) setStaff([profile as Profile]);
      }

    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!action.trim() || !message.trim()) {
      alert("Please fill in both Action and Message.");
      return;
    }
    if (!user) {
      alert("You must be logged in to submit a request.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: newRequest, error } = await supabase
        .from('requests')
        .insert([{
          user_id: user.id,
          user_name: profile?.name || 'Staff Member',
          action: action.trim(),
          dates: selectedDates.map(d => format(d, 'yyyy-MM-dd')),
          message: message.trim(),
          tagged_user_id: taggedUsers.length > 0 ? taggedUsers.map(u => u.id).join(',') : null,
          tagged_user_name: taggedUsers.length > 0 ? taggedUsers.map(u => u.name).join(',') : null,
          status: 'pending',
          created_at: new Date().toISOString()
        }])
        .select();

      if (error) throw error;

      // Send notifications to admins
      const admins = staff.filter(s => s.roles?.some(r => r.toLowerCase() === 'admin'));
      const notifications: any[] = admins.map(admin => ({
        user_id: admin.id,
        title: 'New Request',
        message: `${profile?.name || 'Staff'} submitted: ${action.trim()}`,
        type: 'info',
        is_read: false,
        created_at: new Date().toISOString()
      }));

      // Send to tagged users
      taggedUsers.forEach(tu => {
        if (!admins.some(a => a.id === tu.id)) {
          notifications.push({
            user_id: tu.id,
            title: 'You were tagged',
            message: `${profile?.name || 'Staff'} tagged you in a request: ${action.trim()}`,
            type: 'info',
            is_read: false,
            created_at: new Date().toISOString()
          });
        }
      });

      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications);
      }

      setSuccessMsg(true);
      setSelectedPreset('Exchange Request');
      setCustomAction('');
      setMessage('');
      setSelectedDates([]);
      setTaggedUsers([]);
      
      // Force refresh data
      await fetchData();
      
      setTimeout(() => setSuccessMsg(false), 5000);
    } catch (err: any) {
      console.error('Submit error:', err);
      alert(`Submission failed: ${err.message || 'Check your Supabase "requests" table and RLS policies.'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (!isAdmin) {
      alert("Permission Denied: Only Admins can approve requests.");
      return;
    }
    
    setActionLoading(id);
    try {
      const targetReq = [...manualRequests, ...plannerRequests].find(r => r.id === id);
      if (!targetReq) throw new Error(`Request data (ID: ${id}) not found in current list.`);

      if (id.startsWith('leave-ref-')) {
        // Try insert WITHOUT updated_at first as fallback
        const { error } = await supabase
          .from('requests')
          .insert([{
            user_id: targetReq.user_id,
            user_name: targetReq.user_name,
            action: targetReq.action,
            dates: targetReq.dates,
            message: targetReq.message,
            status: 'approved',
            created_at: new Date().toISOString()
          }]);
        
        if (error) {
           console.warn('Initial insert failed, retrying with updated_at...');
           const { error: retryError } = await supabase
             .from('requests')
             .insert([{
               user_id: targetReq.user_id,
               user_name: targetReq.user_name,
               action: targetReq.action,
               dates: targetReq.dates,
               message: targetReq.message,
               status: 'approved',
               created_at: new Date().toISOString(),
               updated_at: new Date().toISOString()
             }]);
           if (retryError) throw retryError;
        }
      } else {
        // Try update WITH updated_at
        const { error } = await supabase
          .from('requests')
          .update({ 
            status: 'approved',
            updated_at: new Date().toISOString()
          })
          .eq('id', id);
        
        if (error) {
          // Fallback update
          const { error: retryError } = await supabase
            .from('requests')
            .update({ status: 'approved' })
            .eq('id', id);
          if (retryError) throw retryError;
        }
      }
      
      // Notify requester
      const recipientId = targetReq.user_id;
      const notifications: any[] = [{
        user_id: recipientId,
        title: 'Request Approved',
        message: `Your request "${targetReq.action}" has been approved.`,
        type: 'success',
        is_read: false,
        created_at: new Date().toISOString()
      }];

      // Notify tagged users if any
      const taggedIds = targetReq.tagged_user_id ? targetReq.tagged_user_id.split(',') : [];
      taggedIds.forEach(id => {
        if (id !== recipientId) {
          notifications.push({
            user_id: id,
            title: 'Tagged Request Update',
            message: `A request by ${targetReq.user_name} where you were tagged has been approved.`,
            type: 'info' as const,
            is_read: false,
            created_at: new Date().toISOString()
          });
        }
      });

      await supabase.from('notifications').insert(notifications);
      
      await fetchData();
    } catch (err: any) {
      console.error('Approve error:', err);
      alert(`Approval Failed: ${err.message || 'Unknown error'}. Check that Admins have INSERT/UPDATE permissions on 'requests' table.`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!isAdmin) {
      alert("Permission Denied: Only Admins can reject requests.");
      return;
    }

    setActionLoading(id);
    try {
      const targetReq = [...manualRequests, ...plannerRequests].find(r => r.id === id);
      if (!targetReq) throw new Error(`Request data (ID: ${id}) not found in current list.`);

      if (id.startsWith('leave-ref-')) {
        // Try insert WITHOUT updated_at first
        const { error } = await supabase
          .from('requests')
          .insert([{
            user_id: targetReq.user_id,
            user_name: targetReq.user_name,
            action: targetReq.action,
            dates: targetReq.dates,
            message: targetReq.message,
            status: 'rejected',
            created_at: new Date().toISOString()
          }]);
        
        if (error) {
           console.warn('Initial reject insert failed, retrying with updated_at...');
           const { error: retryError } = await supabase
             .from('requests')
             .insert([{
               user_id: targetReq.user_id,
               user_name: targetReq.user_name,
               action: targetReq.action,
               dates: targetReq.dates,
               message: targetReq.message,
               status: 'rejected',
               created_at: new Date().toISOString(),
               updated_at: new Date().toISOString()
             }]);
           if (retryError) throw retryError;
        }
      } else {
        const { error } = await supabase
          .from('requests')
          .update({ 
            status: 'rejected',
            updated_at: new Date().toISOString()
          })
          .eq('id', id);
        
        if (error) {
          const { error: retryError } = await supabase
            .from('requests')
            .update({ status: 'rejected' })
            .eq('id', id);
          if (retryError) throw retryError;
        }
      }
      
      // Notify requester
      const recipientId = targetReq.user_id;
      const notifications: any[] = [{
        user_id: recipientId,
        title: 'Request Rejected',
        message: `Your request "${targetReq.action}" has been rejected.`,
        type: 'danger',
        is_read: false,
        created_at: new Date().toISOString()
      }];

      // Notify tagged users if any
      const taggedIds = targetReq.tagged_user_id ? targetReq.tagged_user_id.split(',') : [];
      taggedIds.forEach(id => {
        if (id !== recipientId) {
          notifications.push({
            user_id: id,
            title: 'Tagged Request Update',
            message: `A request by ${targetReq.user_name} where you were tagged has been rejected.`,
            type: 'info' as const,
            is_read: false,
            created_at: new Date().toISOString()
          });
        }
      });

      await supabase.from('notifications').insert(notifications);
      
      // ALWAYS unlock dates if it's a Planner request
      const isPlannerAction = (
        targetReq.action.toLowerCase().includes('planner') || 
        targetReq.action.toLowerCase().includes('annual leave') || 
        targetReq.action.toLowerCase().includes('leave request') ||
        targetReq.action.toLowerCase().includes('sick leave') ||
        targetReq.action.toLowerCase().includes('sl')
      );

      if (isPlannerAction && targetReq.dates && targetReq.dates.length > 0) {
        console.log('Unlocking dates for planner request rejection:', targetReq.dates);
        const { error: deleteError } = await supabase
          .from('leaves')
          .delete()
          .eq('user_id', targetReq.user_id)
          .in('date', targetReq.dates);
        
        if (deleteError) {
          console.warn('Unlock failed:', deleteError);
          alert("Request rejected, but unlocking calendar dates failed. Ensure Admins have DELETE permission on 'leaves' table.");
        }
      }
      
      await fetchData();
    } catch (err: any) {
      console.error('Reject error:', err);
      alert(`Rejection Failed: ${err.message || 'Unknown error'}. Check that Admins have INSERT/UPDATE permissions on 'requests' and DELETE on 'leaves'.`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevert = async (id: string) => {
    if (!isAdmin) {
      alert("Permission Denied: Only Admins can revert requests.");
      return;
    }

    setActionLoading(id);
    try {
      const targetReq = [...manualRequests, ...plannerRequests].find(r => r.id === id);
      if (!targetReq) throw new Error(`Request data (ID: ${id}) not found.`);

      const previousStatus = targetReq.status;

      // 1. Update status to pending
      const { error } = await supabase
        .from('requests')
        .update({ 
          status: 'pending',
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
      
      if (error) {
        console.warn('Revert update with updated_at failed, retrying without it...');
        const { error: retryError } = await supabase
          .from('requests')
          .update({ status: 'pending' })
          .eq('id', id);
        if (retryError) throw retryError;
      }

      // 2. If it was REJECTED and was a planner request, we need to RE-INSERT into leaves
      // because handleReject deleted them.
      if (previousStatus === 'rejected') {
        const isPlannerAction = (
          targetReq.action.toLowerCase().includes('planner') || 
          targetReq.action.toLowerCase().includes('annual leave') || 
          targetReq.action.toLowerCase().includes('leave request') ||
          targetReq.action.toLowerCase().includes('sick leave') ||
          targetReq.action.toLowerCase().includes('al') ||
          targetReq.action.toLowerCase().includes('lr') ||
          targetReq.action.toLowerCase().includes('sl')
        );

        if (isPlannerAction && targetReq.dates && targetReq.dates.length > 0) {
          // Determine type based on action text
          let type = 'AL';
          if (targetReq.action.toLowerCase().includes('leave request') || targetReq.action.toLowerCase().includes('lr')) {
            type = 'LR';
          } else if (targetReq.action.toLowerCase().includes('sick leave') || targetReq.action.toLowerCase().includes('sl')) {
            type = 'SL';
          }
          
          const leafEntries = targetReq.dates.map(date => ({
            user_id: targetReq.user_id,
            user_name: targetReq.user_name,
            date: date,
            type: type
          }));
          
          const { error: insertError } = await supabase.from('leaves').insert(leafEntries);
          if (insertError) console.warn('Failed to re-insert leaves on revert:', insertError);
        }
      }
      
      // Notify requester
      await supabase.from('notifications').insert([{
        user_id: targetReq.user_id,
        title: 'Request Reverted',
        message: `Your request "${targetReq.action}" has been moved back to pending.`,
        type: 'warning' as const,
        is_read: false,
        created_at: new Date().toISOString()
      }]);
      
      await fetchData();
    } catch (err: any) {
      console.error('Revert error:', err);
      alert(`Revert Failed: ${err.message || 'Unknown error'}`);
    } finally {
      setActionLoading(null);
    }
  };

  const renderRequestItem = (req: RequestItem) => {
    const taggedIds = req.tagged_user_id ? req.tagged_user_id.split(',') : [];
    const taggedNames = req.tagged_user_name ? req.tagged_user_name.split(',') : [];
    const isTagged = taggedIds.includes(user?.id || '');
    
    return (
      <motion.div
        layout
        key={req.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
           "relative p-3 sm:p-6 rounded-2xl sm:rounded-3xl border transition-all duration-500 group",
           req.status === 'pending' ? "bg-amber-500/[0.03] border-white/5" : "bg-green-500/[0.03] border-white/5",
           isTagged && "ring-2 ring-amber-500/50 shadow-xl bg-amber-500/5 border-amber-500/20"
        )}
      >
        {isTagged && (
           <div className="absolute -top-2.5 left-4 sm:left-6 px-3 py-0.5 bg-amber-500 text-black text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg z-10">
              You are tagged
           </div>
        )}

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 sm:gap-6">
          <div className="flex-1 space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] sm:text-xs font-black text-white/30 shrink-0">
                 {req.user_name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs sm:text-sm font-bold text-white group-hover:text-amber-400 transition-colors uppercase tracking-tight truncate">{req.user_name}</div>
                <div className="text-[9px] sm:text-[10px] text-white/30 font-black uppercase tracking-widest truncate">{format(new Date(req.created_at), 'MMM d, h:mm a')}</div>
              </div>
              <div className={cn(
                 "ml-auto sm:ml-2 px-2.5 py-1 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 shrink-0",
                 req.status === 'pending' ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" : 
                 req.status === 'approved' ? "bg-green-500 text-black shadow-lg" :
                 "bg-red-500/10 text-red-500 border border-red-500/20"
              )}>
                {req.status === 'approved' && <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                {req.status === 'rejected' && <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                {req.status}
              </div>
              {isAdmin && req.status !== 'pending' && (
                <button
                  onClick={() => handleRevert(req.id)}
                  disabled={!!actionLoading}
                  title="Revert to Pending"
                  className={cn(
                    "p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all",
                    actionLoading && actionLoading !== req.id && "opacity-30 pointer-events-none"
                  )}
                >
                  <RotateCcw className={cn("w-3 h-3 sm:w-3.5 sm:h-3.5", actionLoading === req.id && "animate-spin")} />
                </button>
              )}
            </div>
            {req.status !== 'pending' && (
              <div className="text-[9px] text-white/20 italic mt-0.5 ml-10 sm:ml-[52px] flex items-center gap-1 font-black uppercase tracking-tight">
                Done {format(new Date(req.updated_at && req.updated_at !== '' ? req.updated_at : req.created_at), 'MMM d, p')}
              </div>
            )}

            <div>
              {(() => {
                const isSickLeave = req.action.toLowerCase().includes('sick leave') || req.action.toLowerCase().includes('sl') || req.message.includes('[SICK LEAVE REQUEST]');
                let prescriptionUrl = '';
                let comment = req.message;

                if (isSickLeave) {
                  const msgLines = req.message.split('\n');
                  const prescriptionLine = msgLines.find(l => l.startsWith('Prescription:'));
                  const commentLine = msgLines.find(l => l.startsWith('Comment:'));
                  
                  if (prescriptionLine) {
                    prescriptionUrl = prescriptionLine.replace('Prescription:', '').trim();
                  }
                  if (commentLine) {
                    comment = commentLine.replace('Comment:', '').trim();
                  }
                }

                return (
                  <div className="space-y-3">
                    <div className={cn(
                      "text-[10px] sm:text-xs font-black uppercase tracking-widest leading-none mb-1",
                      isSickLeave ? "text-red-400" : "text-[#60efff]"
                    )}>
                      Action: {req.action}
                    </div>

                    {isSickLeave ? (
                      <div className="space-y-4">
                        <div className="p-4 bg-red-500/[0.01] border border-red-500/10 rounded-2xl">
                          <span className="text-[8px] font-black text-red-400 block uppercase tracking-widest mb-1">Absence Reason Comment</span>
                          <p className="text-white/80 text-xs sm:text-sm leading-relaxed font-semibold">{comment || "No comment added."}</p>
                        </div>

                        {prescriptionUrl && prescriptionUrl !== 'None Attached' ? (
                          <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-3">
                            <span className="text-[8px] font-black text-white/30 block uppercase tracking-widest">Medical Prescription (Attached Document)</span>
                            
                            {prescriptionUrl.startsWith('data:image/') ? (
                              <div className="space-y-2.5">
                                <img 
                                  src={prescriptionUrl} 
                                  alt="Prescription File" 
                                  className="max-h-56 rounded-xl object-contain border border-white/10"
                                  referrerPolicy="no-referrer"
                                />
                                <a 
                                  href={prescriptionUrl}
                                  download={`prescription_${req.user_name}.png`}
                                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-[9px] font-black text-red-400 rounded-lg inline-flex items-center gap-1.5 uppercase tracking-widest transition-all"
                                >
                                  <Download className="w-3 h-3" /> Download Attachment Image
                                </a>
                              </div>
                            ) : prescriptionUrl.startsWith('data:application/pdf') ? (
                              <div className="flex items-center justify-between p-3 bg-red-400/[0.02] border border-red-500/10 rounded-xl">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                                    <FileText className="w-4 h-4 text-red-400" />
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-black uppercase text-white/80">Prescription Document</div>
                                    <span className="text-[8px] font-bold uppercase text-white/30 tracking-widest">Official PDF File Uploaded</span>
                                  </div>
                                </div>
                                <a 
                                  href={prescriptionUrl} 
                                  download={`prescription_${req.user_name}.pdf`} 
                                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-[9px] font-black text-red-500 rounded-lg uppercase tracking-widest"
                                >
                                  Download PDF
                                </a>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between p-3 bg-[#60efff]/[0.02] border border-[#60efff]/10 rounded-xl">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-lg bg-[#60efff]/10 flex items-center justify-center shrink-0">
                                    <LinkIcon className="w-4 h-4 text-[#60efff]" />
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-black uppercase text-white/80">Google Drive Linked File</div>
                                    <span className="text-[8px] font-bold uppercase text-white/30 tracking-widest">Linked medical document resource</span>
                                  </div>
                                </div>
                                <a 
                                  href={prescriptionUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="px-3 py-1.5 bg-[#60efff]/10 hover:bg-[#60efff]/20 text-[9px] font-black text-[#60efff] rounded-lg uppercase tracking-widest flex items-center gap-1 leading-none"
                                >
                                  Open Drive <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center gap-2 text-white/35">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span className="text-[9px] font-black uppercase tracking-widest">No medical prescription attached</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-white/60 text-[13px] sm:text-sm leading-relaxed font-medium">{req.message}</p>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-4 sm:items-center pt-1 sm:pt-0">
              {req.dates && req.dates.length > 0 && (
                <div className="flex items-start sm:items-center gap-2">
                   <CalendarIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#60efff]/40 shrink-0 mt-0.5 sm:mt-0" />
                   <div className="flex flex-wrap gap-1">
                      {req.dates.map(date => (
                        <span key={date} className="bg-[#60efff]/10 text-[#60efff] text-[9px] sm:text-[10px] font-black px-1.5 sm:px-2 py-0.5 rounded border border-[#60efff]/10 uppercase">
                          {format(new Date(date), 'MMM d')}
                        </span>
                      ))}
                   </div>
                </div>
              )}
              {taggedNames.length > 0 && (
                 <div className="flex flex-wrap gap-1.5 items-center">
                    <UserPlus className="w-3 h-3 text-amber-500/40 shrink-0" />
                    {taggedNames.map((name, idx) => (
                      <span key={idx} className="text-[9px] sm:text-[10px] font-black text-amber-500 bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10">
                        @{name.split(' ')[0]}
                      </span>
                    ))}
                 </div>
              )}
            </div>
          </div>

           {isAdmin && req.status === 'pending' && (
             <div className="flex flex-col gap-2 w-full md:w-auto self-stretch md:self-start pt-2 sm:pt-0">
               <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 w-full">
                 <button
                   onClick={() => handleApprove(req.id)}
                   disabled={!!actionLoading}
                   className={cn(
                     "bg-green-600 hover:bg-green-500 text-white px-4 sm:px-6 py-3 sm:py-2.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg w-full sm:w-auto",
                     actionLoading === req.id && "bg-green-800",
                     actionLoading && actionLoading !== req.id && "opacity-50 grayscale pointer-events-none"
                   )}
                 >
                   {actionLoading === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                   Approve
                 </button>
                 <button
                   onClick={() => handleReject(req.id)}
                   disabled={!!actionLoading}
                   className={cn(
                     "bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-4 sm:px-6 py-3 sm:py-2.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 active:scale-95 w-full sm:w-auto",
                     actionLoading === req.id && "opacity-50",
                     actionLoading && actionLoading !== req.id && "opacity-30 grayscale pointer-events-none"
                   )}
                 >
                   {actionLoading === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                   Reject
                 </button>
               </div>
               {req.id.startsWith('leave-ref-') && (
                 <p className="text-[7px] text-white/20 uppercase font-black text-center tracking-tighter sm:tracking-widest py-1">Planner Sync Required</p>
               )}
             </div>
          )}
        </div>

        {/* Decorative subtle pulse for pending tagged items */}
        {isTagged && req.status === 'pending' && (
           <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent animate-pulse pointer-events-none rounded-b-3xl" />
        )}
      </motion.div>
    );
  };

  const downloadCSV = () => {
    const headers = ['User', 'Action', 'Dates', 'Message', 'Tagged Person', 'Status', 'Date Created'];
    
    const exportFile = (items: RequestItem[], filename: string) => {
      const rows = items.map(r => [
        r.user_name,
        r.action,
        r.dates.join(', '),
        r.message.replace(/,/g, ';'), // Prevent CSV breakage
        r.tagged_user_name || 'None',
        r.status,
        format(new Date(r.created_at), 'yyyy-MM-dd HH:mm')
      ]);

      const csvData = [headers.join(','), ...rows.map(e => e.join(','))].join("\n");
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    // Export Manual Requests
    if (filteredManualRequests.length > 0) {
      exportFile(filteredManualRequests, 'manual_requests');
    }

    // Export AL Sync Requests
    if (filteredAlPlannerRequests.length > 0) {
      exportFile(filteredAlPlannerRequests, 'al_sync_requests');
    }

    // Export LR Sync Requests
    if (filteredLrPlannerRequests.length > 0) {
      exportFile(filteredLrPlannerRequests, 'lr_sync_requests');
    }
  };

  const toggleDate = (date: Date) => {
    const exists = selectedDates.find(d => format(d, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd'));
    if (exists) {
      setSelectedDates(selectedDates.filter(d => format(d, 'yyyy-MM-dd') !== format(date, 'yyyy-MM-dd')));
    } else {
      setSelectedDates([...selectedDates, date]);
    }
  };

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const getDays = (month: number, year: number) => Array.from({ length: daysInMonth(month, year) }, (_, i) => new Date(year, month, i + 1));
  const days = getDays(viewMonth, viewYear);

  const toggleTag = (staffMember: Profile) => {
    const isAlreadyTagged = taggedUsers.find(u => u.id === staffMember.id);
    if (isAlreadyTagged) {
      setTaggedUsers(taggedUsers.filter(u => u.id !== staffMember.id));
    } else {
      setTaggedUsers([...taggedUsers, { id: staffMember.id, name: staffMember.name }]);
    }
  };

  const filteredStaff = staff.filter(s => 
    (s.name?.toLowerCase().includes(searchTerm.toLowerCase())) || 
    (s.roles && Array.isArray(s.roles) && s.roles.some(r => r.toLowerCase().includes(searchTerm.toLowerCase())))
  );

  return (
    <div className="min-h-screen p-2 sm:p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-white/40 hover:text-white transition-colors mb-4 sm:mb-8 group"
        >
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-[#60efff]">Back</span>
        </button>

        <div className="glass rounded-[1.25rem] sm:rounded-[2rem] p-3 sm:p-6 md:p-8 shadow-2xl relative">
          {/* Tabs - Scrollable on mobile */}
          <div className="flex overflow-x-auto no-scrollbar gap-1 sm:gap-2 mb-4 sm:mb-8 bg-black/20 p-1 rounded-xl sm:rounded-2xl w-full sm:w-fit relative z-10">
            <button 
              onClick={() => setActiveTab('create')}
              className={cn(
                "px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[10px] sm:text-sm font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0",
                activeTab === 'create' ? "bg-amber-500 text-black shadow-lg" : "text-white/30 hover:text-white"
              )}
            >
              Post Request
            </button>
            <button 
              onClick={() => setActiveTab('manual')}
              className={cn(
                "px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[10px] sm:text-sm font-black uppercase tracking-widest transition-all relative whitespace-nowrap shrink-0",
                activeTab === 'manual' ? "bg-amber-500 text-black shadow-lg" : "text-white/30 hover:text-white"
              )}
            >
              Manual
              {manualRequests.filter(r => r.status === 'pending').length > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-amber-500 text-[7px] sm:text-[8px] text-black flex items-center justify-center rounded-full border border-black font-black">
                  {manualRequests.filter(r => r.status === 'pending').length}
                </span>
              )}
            </button>
            <button 
              onClick={() => setActiveTab('al-sync')}
              className={cn(
                "px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[10px] sm:text-sm font-black uppercase tracking-widest transition-all relative whitespace-nowrap shrink-0",
                activeTab === 'al-sync' ? "bg-emerald-500 text-white shadow-lg" : "text-white/30 hover:text-white"
              )}
            >
              AL Sync
              {alPlannerRequests.filter(r => r.status === 'pending').length > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-red-500 text-[7px] sm:text-[8px] text-white flex items-center justify-center rounded-full border border-black font-black text-center leading-none">
                  {alPlannerRequests.filter(r => r.status === 'pending').length}
                </span>
              )}
            </button>
            <button 
              onClick={() => setActiveTab('lr-sync')}
              className={cn(
                "px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[10px] sm:text-sm font-black uppercase tracking-widest transition-all relative whitespace-nowrap shrink-0",
                activeTab === 'lr-sync' ? "bg-[#60efff] text-black shadow-lg" : "text-white/30 hover:text-white"
              )}
            >
              LR Sync
              {lrPlannerRequests.filter(r => r.status === 'pending').length > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-red-500 text-[7px] sm:text-[8px] text-white flex items-center justify-center rounded-full border border-black font-black text-center leading-none">
                  {lrPlannerRequests.filter(r => r.status === 'pending').length}
                </span>
              )}
            </button>
            <button 
              onClick={() => setActiveTab('sl-sync')}
              className={cn(
                "px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[10px] sm:text-sm font-black uppercase tracking-widest transition-all relative whitespace-nowrap shrink-0",
                activeTab === 'sl-sync' ? "bg-red-500 text-white shadow-lg shadow-red-500/15" : "text-white/30 hover:text-white"
              )}
            >
              SL Sync
              {slPlannerRequests.filter(r => r.status === 'pending').length > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-red-500 text-[7px] sm:text-[8px] text-white flex items-center justify-center rounded-full border border-black font-black text-center leading-none animate-pulse">
                  {slPlannerRequests.filter(r => r.status === 'pending').length}
                </span>
              )}
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'create' ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-3 mb-4 sm:mb-6">
                  <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <Send className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Create New Request</h2>
                    <p className="text-white/40 text-[9px] sm:text-xs tracking-wider uppercase font-black">Post your updates or needs</p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    <div className="space-y-3 sm:space-y-4">
                      {/* Action Preset */}
                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-white/30 ml-1">Request Action Preset</label>
                        <select
                          value={selectedPreset}
                          onChange={(e) => setSelectedPreset(e.target.value)}
                          className="w-full bg-slate-900 border border-white/10 rounded-lg sm:rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-white focus:outline-none focus:border-amber-500 text-xs sm:text-sm transition-all duration-200"
                        >
                          <option value="Exchange Request" className="bg-slate-950 text-white">Exchange Request</option>
                          <option value="Schedule Change" className="bg-slate-950 text-white">Schedule Change</option>
                          <option value="Resource Need" className="bg-slate-950 text-white">Resource Need</option>
                          <option value="Duty Cover" className="bg-slate-950 text-white">Duty Cover</option>
                          <option value="Others" className="bg-slate-950 text-white">Others</option>
                        </select>
                      </div>

                      {/* Custom Action (shown only if 'Others' is selected) */}
                      {selectedPreset === 'Others' && (
                        <div className="space-y-1.5 sm:space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                          <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 ml-1">Describe Custom Action</label>
                          <input 
                            value={customAction}
                            onChange={(e) => setCustomAction(e.target.value)}
                            className="w-full bg-white/5 border border-amber-500/20 rounded-lg sm:rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-white focus:outline-none focus:border-amber-500 text-xs sm:text-sm"
                            placeholder="e.g. Training Request, Special Request"
                            required
                          />
                        </div>
                      )}

                      {/* Message */}
                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-white/30 ml-1">Message</label>
                        <textarea 
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg sm:rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-white focus:outline-none focus:border-amber-500 text-xs sm:text-sm h-28 sm:h-32 resize-none"
                          placeholder="Type your message here..."
                          required
                        />
                      </div>

                      {/* Tag Member */}
                      <div className="space-y-1.5 sm:space-y-2 relative" ref={tagRef}>
                        <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-white/30 ml-1">Tag Member (Optional)</label>
                        <div 
                          onClick={() => setIsTagging(!isTagging)}
                          className="w-full min-h-[44px] sm:min-h-[50px] bg-white/5 border border-white/10 rounded-lg sm:rounded-xl px-3 sm:px-4 py-2 text-white flex items-center justify-between cursor-pointer group hover:border-amber-500/30 transition-all font-bold"
                        >
                          <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center flex-1">
                            <UserPlus className="w-3.5 h-3.5 text-white/30 group-hover:text-amber-500 shrink-0" />
                            {taggedUsers.length === 0 ? (
                              <span className="text-[11px] sm:text-sm text-white/20">Select staff</span>
                            ) : (
                              taggedUsers.map(u => (
                                <span 
                                  key={u.id} 
                                  className="bg-amber-500 text-black text-[9px] sm:text-[10px] font-black px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border border-black/10 flex items-center gap-1 animate-in fade-in zoom-in duration-200"
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
                            className="absolute z-[110] top-full left-0 right-0 mt-2 bg-slate-800 border border-white/10 rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-64 flex flex-col backdrop-blur-xl"
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
                                  placeholder="Search staff..."
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
                                      isSelected && "bg-amber-500/10"
                                    )}
                                  >
                                    <div>
                                      <div className={cn(
                                        "text-xs sm:text-sm font-bold transition-colors",
                                        isSelected ? "text-amber-400" : "text-white group-hover:text-amber-400"
                                      )}>
                                        {s.name}
                                      </div>
                                      <div className="text-[9px] text-white/30 uppercase tracking-widest font-black">
                                        {s.roles && Array.isArray(s.roles) ? s.roles.join(', ') : 'No Role'}
                                      </div>
                                    </div>
                                    {isSelected && <Check className="w-3.5 h-3.5 text-amber-500" />}
                                  </button>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </div>
                    </div>

                    {/* Calendar Selection */}
                    <div className="space-y-1.5 sm:space-y-2">
                      <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-white/30 ml-1">Select Dates (Optional)</label>
                      <div className="bg-white/5 border border-white/10 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                        <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
                            <select 
                              value={viewMonth}
                              onChange={(e) => setViewMonth(parseInt(e.target.value))}
                              className="bg-black/50 border border-white/10 rounded-md text-[9px] sm:text-[10px] font-black uppercase text-white px-2 py-1 outline-none"
                            >
                              {months.map((m, i) => (
                                <option key={m} value={i}>{m.toUpperCase()}</option>
                              ))}
                            </select>
                            <select 
                              value={viewYear}
                              onChange={(e) => setViewYear(parseInt(e.target.value))}
                              className="bg-black/50 border border-white/10 rounded-md text-[9px] sm:text-[10px] font-black uppercase text-white px-2 py-1 outline-none"
                            >
                              {[2024, 2025, 2026, 2027].map(y => (
                                <option key={y} value={y}>{y}</option>
                              ))}
                            </select>
                        </div>
                        <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                          {['S','M','T','W','T','F','S'].map((d, i) => (
                            <div key={`${d}-${i}`} className="text-center text-[8px] sm:text-[10px] font-black text-white/20 pb-1 sm:pb-2 tracking-tighter sm:tracking-normal">{d}</div>
                          ))}
                          {Array.from({ length: days[0].getDay() }).map((_, i) => (
                            <div key={`empty-${i}`} />
                          ))}
                          {days.map(d => {
                             const isSelected = selectedDates.find(sd => format(sd, 'yyyy-MM-dd') === format(d, 'yyyy-MM-dd'));
                             const isToday = format(new Date(), 'yyyy-MM-dd') === format(d, 'yyyy-MM-dd');
                             return (
                               <button
                                 key={d.toISOString()}
                                 type="button"
                                 onClick={() => toggleDate(d)}
                                 className={cn(
                                   "aspect-square rounded sm:rounded-lg text-[9px] sm:text-[10px] font-black transition-all flex items-center justify-center relative",
                                   isSelected ? "bg-amber-500 text-black shadow-lg" : "text-white/40 hover:bg-white/5",
                                   isToday && !isSelected && "ring-1 ring-white/20"
                                 )}
                               >
                                 {format(d, 'd')}
                                 {isToday && !isSelected && (
                                   <div className="absolute bottom-0.5 w-0.5 h-0.5 rounded-full bg-amber-500" />
                                 )}
                               </button>
                             );
                          })}
                        </div>
                        <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-white/5">
                            <div className="text-[9px] sm:text-[10px] text-white/30 font-black uppercase tracking-widest">Selected:</div>
                            <div className="flex flex-wrap gap-1 mt-1.5 sm:mt-2">
                                {selectedDates.length === 0 ? (
                                    <span className="text-[9px] sm:text-[10px] text-white/10 italic font-medium">None</span>
                                ) : (
                                    selectedDates.sort((a,b) => a.getTime() - b.getTime()).map(d => (
                                        <span key={d.toISOString()} className="bg-amber-500/10 text-amber-500 text-[8px] sm:text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-500/20 uppercase">
                                            {format(d, 'MMM d')}
                                        </span>
                                    ))
                                )}
                            </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 sm:pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <AnimatePresence>
                      {successMsg && (
                        <motion.div 
                          initial={{ opacity: 0, filter: 'blur(10px)' }}
                          animate={{ opacity: 1, filter: 'blur(0px)' }}
                          exit={{ opacity: 0 }}
                          className="w-full sm:w-auto flex items-center justify-center gap-2 text-green-400 font-black text-[10px] sm:text-sm bg-green-500/10 px-4 py-2.5 rounded-full border border-green-500/20 uppercase tracking-widest"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          SYNCCED!
                        </motion.div>
                      )}
                    </AnimatePresence>
                    
                    <button
                      type="submit"
                      disabled={submitting || !action.trim() || !message.trim()}
                      className={cn(
                        "w-full sm:w-auto ml-auto bg-amber-500 hover:bg-amber-400 text-black px-8 sm:px-10 py-3.5 sm:py-4 rounded-xl font-black text-xs sm:text-sm uppercase tracking-widest transition-all shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-95",
                        (submitting || !action.trim() || !message.trim()) && "opacity-50 pointer-events-none"
                      )}
                    >
                      {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                        <>
                          <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                          Confirm
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 sm:mb-8 gap-4 sm:gap-0">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 sm:p-3 rounded-lg sm:rounded-xl border",
                      activeTab === 'manual' ? "bg-amber-500/10 border-amber-500/20" : 
                      activeTab === 'al-sync' ? "bg-emerald-500/10 border-emerald-500/20" :
                      activeTab === 'sl-sync' ? "bg-red-500/10 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]" :
                      "bg-[#60efff]/10 border-[#60efff]/20"
                    )}>
                      <Clock className={cn(
                        "w-4 h-4 sm:w-5 sm:h-5",
                        activeTab === 'manual' ? "text-amber-500" : 
                        activeTab === 'al-sync' ? "text-emerald-500" :
                        activeTab === 'sl-sync' ? "text-red-500 animate-pulse" :
                        "text-[#60efff]"
                      )} />
                    </div>
                    <div>
                      <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                        {activeTab === 'manual' ? 'Manual History' : 
                         activeTab === 'al-sync' ? 'Annual Leave Sync' : 
                         activeTab === 'sl-sync' ? 'Sick Leave Sync' : 'Leave Request Sync'}
                      </h2>
                      <p className="text-white/40 text-[9px] sm:text-xs tracking-wider uppercase font-black">
                        {activeTab === 'manual' ? 'Record keeping & approvals' : 
                         activeTab === 'al-sync' ? 'AL Planner Entries' : 
                         activeTab === 'sl-sync' ? 'SL Planner Entries' : 'LR Planner Entries'}
                      </p>
                    </div>
                  </div>
                  {isAdmin && (
                    <button 
                      onClick={downloadCSV}
                      className="self-end sm:self-auto flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-white/5 transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export
                    </button>
                  )}
                </div>

                {activeTab === 'al-sync' && (
                  <div className="flex flex-wrap items-center gap-2 bg-white/5 border border-white/10 rounded-2xl p-2.5 sm:p-3 mb-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-[#60efff]/60 mr-2 ml-1">Filter by Role:</span>
                    <div className="flex gap-1.5">
                      {(['All', 'CCRN', 'RN'] as const).map(role => (
                        <button
                          key={role}
                          onClick={() => setAlRoleFilter(role)}
                          className={cn(
                            "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                            alRoleFilter === role 
                              ? "bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-500/20" 
                              : "bg-white/5 text-white/40 border-white/5 hover:bg-white/10"
                          )}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'lr-sync' && (
                  <div className="flex flex-wrap items-center gap-2 bg-white/5 border border-white/10 rounded-2xl p-2.5 sm:p-3 mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-[#60efff]/60 mr-2 ml-1">Filter by Role:</span>
                    <div className="flex gap-1.5">
                      {(['All', 'CCRN', 'RN'] as const).map(role => (
                        <button
                          key={role}
                          onClick={() => setLrRoleFilter(role)}
                          className={cn(
                            "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                            lrRoleFilter === role 
                              ? "bg-[#60efff] text-black border-[#60efff] shadow-lg shadow-[#60efff]/20" 
                              : "bg-white/5 text-white/40 border-white/5 hover:bg-white/10"
                          )}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'manual' && (
                  <div className="flex flex-wrap items-center gap-2 bg-white/5 border border-white/10 rounded-2xl p-2.5 sm:p-3 mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-white/40 mr-2 ml-1">Filter by Role:</span>
                    <div className="flex gap-1.5">
                      {(['All', 'CCRN', 'RN'] as const).map(role => (
                        <button
                          key={role}
                          onClick={() => setManualRoleFilter(role)}
                          className={cn(
                            "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                            manualRoleFilter === role 
                              ? "bg-amber-500 text-black border-amber-400 shadow-lg shadow-amber-500/20" 
                              : "bg-white/5 text-white/40 border-white/5 hover:bg-white/10"
                          )}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'sl-sync' && (
                  <div className="flex flex-wrap items-center gap-2 bg-white/5 border border-white/10 rounded-2xl p-2.5 sm:p-3 mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-red-400 mr-2 ml-1">Filter by Role:</span>
                    <div className="flex gap-1.5">
                      {(['All', 'CCRN', 'RN'] as const).map(role => (
                        <button
                          key={role}
                          onClick={() => setSlRoleFilter(role)}
                          className={cn(
                            "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                            slRoleFilter === role 
                              ? "bg-red-600 text-white border-red-500 shadow-lg shadow-red-500/20" 
                              : "bg-white/5 text-white/40 border-white/5 hover:bg-white/10"
                          )}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {loading ? (
                    <div className="py-20 flex flex-col items-center justify-center gap-4 text-white/20">
                       <Loader2 className="w-10 h-10 animate-spin" />
                       <span className="font-bold tracking-widest uppercase text-xs">Loading requests...</span>
                    </div>
                  ) : activeTab === 'lr-sync' ? (
                    Object.keys(lrGroups).length === 0 ? (
                      <div className="py-20 flex flex-col items-center justify-center gap-4 text-white/20 bg-white/5 rounded-3xl border border-dashed border-white/10">
                        <AlertCircle className="w-12 h-12" />
                        <span className="font-bold tracking-widest uppercase text-xs">No LR entries found</span>
                      </div>
                    ) : (
                      ROTA_TIMELINES.filter(t => lrGroups[t.label]).reverse().map(t => {
                        const isExpanded = expandedTimelines[t.label] ?? false;
                        const pendingCount = lrGroups[t.label].filter(r => r.status === 'pending').length;

                        return (
                        <div key={t.label} className="space-y-4 mb-3 sm:mb-4">
                          <button 
                            onClick={() => toggleTimeline(t.label)}
                            className="w-full flex items-center gap-3 group/header overflow-hidden"
                          >
                            <div className="h-[1px] flex-1 bg-white/10 group-hover/header:bg-white/20 transition-colors" />
                            <div className={cn(
                              "px-3 sm:px-4 py-1.5 rounded-full border transition-all flex items-center gap-2",
                              isExpanded ? "bg-white/10 border-white/20 shadow-lg" : "bg-white/5 border-white/10 opacity-70"
                            )}>
                              <div className={cn(
                                "w-1.5 h-1.5 rounded-full group-hover/header:scale-125 transition-transform",
                                pendingCount > 0 ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
                              )} />
                              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-[#60efff]">
                                {t.label}
                              </span>
                              {pendingCount > 0 && (
                                <span className="text-[8px] font-black bg-red-500/20 text-red-400 px-1.5 rounded-full">
                                  {pendingCount} PENDING
                                </span>
                              )}
                              <motion.div
                                animate={{ rotate: isExpanded ? 0 : -90 }}
                                transition={{ duration: 0.2 }}
                                className="ml-1"
                              >
                                <ChevronLeft className="w-3 h-3 rotate-[-90deg]" />
                              </motion.div>
                            </div>
                            <div className="h-[1px] flex-1 bg-white/10 group-hover/header:bg-white/20 transition-colors" />
                          </button>
                          
                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                className="overflow-hidden space-y-4"
                              >
                                {lrGroups[t.label].map(renderRequestItem)}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                        );
                      }).concat(
                        (lrGroups['Outside Timeline'] || lrGroups['No Dates']) ? [
                          <div key="misc" className="space-y-4 mb-10">
                             <button 
                               onClick={() => toggleTimeline('Miscellaneous')}
                               className="w-full flex items-center gap-3 group/header"
                             >
                              <div className="h-[1px] flex-1 bg-white/10" />
                              <div className="px-4 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/30 flex items-center gap-2">
                                Miscellaneous (No Match)
                                <motion.div
                                  animate={{ rotate: (expandedTimelines['Miscellaneous'] ?? false) ? 0 : -90 }}
                                  className="ml-1"
                                >
                                  <ChevronLeft className="w-3 h-3 rotate-[-90deg]" />
                                </motion.div>
                              </div>
                              <div className="h-[1px] flex-1 bg-white/10" />
                            </button>
                            
                            <AnimatePresence>
                              {(expandedTimelines['Miscellaneous'] ?? false) && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden space-y-4"
                                >
                                  {[...(lrGroups['Outside Timeline'] || []), ...(lrGroups['No Dates'] || [])].map(renderRequestItem)}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ] : []
                      )
                    )
                  ) : (
                    activeTab === 'manual' ? filteredManualRequests : 
                    activeTab === 'al-sync' ? filteredAlPlannerRequests : filteredSlPlannerRequests
                  ).length === 0 ? (
                    <div className="py-20 flex flex-col items-center justify-center gap-4 text-white/20 bg-white/5 rounded-3xl border border-dashed border-white/10">
                       <AlertCircle className="w-12 h-12" />
                       <span className="font-bold tracking-widest uppercase text-xs">No entries found</span>
                    </div>
                  ) : (
                    (
                      activeTab === 'manual' ? filteredManualRequests : 
                      activeTab === 'al-sync' ? filteredAlPlannerRequests : filteredSlPlannerRequests
                    ).map(renderRequestItem)
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Background FX */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
