import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, ChevronLeft, Search, Plus, Edit2, Save, X, Trash2, Shield, User as UserIcon, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Profile, UserRole } from '../types';
import { cn } from '../lib/utils';

interface StaffManagerProps {
  onBack: () => void;
}

const ROLES: UserRole[] = ['CCRN', 'RN', 'Admin', 'Doctor'];

export default function StaffManager({ onBack }: StaffManagerProps) {
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<UserRole | 'All'>('All');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Profile>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchStaff();
    
    // Subscribe to changes
    const channelName = `profiles-admin_${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchStaff();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchStaff = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('name');

      if (error) throw error;
      setStaff(data || []);
    } catch (err) {
      console.error('Error fetching staff:', err);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (member: Profile) => {
    setEditingId(member.id);
    setEditForm(member);
    setIsAdding(false);
  };

  const startAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setEditForm({
      name: '',
      email: '',
      emp_id: '',
      roles: ['RN']
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
    setIsAdding(false);
    setIsSaving(false);
  };

  const handleSave = async () => {
    if (!editForm.name || !editForm.email) {
      alert('Please provide at least a Name and Email.');
      return;
    }

    setIsSaving(true);
    try {
      if (isAdding) {
        if (!editForm.name || !editForm.email) {
          alert('Full Name and Email are strictly required.');
          setIsSaving(false);
          return;
        }

        // Use manual ID if provided, otherwise generate one
        const finalId = (editForm.id && editForm.id.trim().length > 10)
          ? editForm.id.trim()
          : (typeof crypto !== 'undefined' && crypto.randomUUID) 
            ? crypto.randomUUID() 
            : 'u_' + Math.random().toString(36).substring(2, 11);
          
        const newRecord = {
          id: finalId,
          name: editForm.name,
          email: editForm.email,
          emp_id: editForm.emp_id || 'N/A',
          roles: editForm.roles || ['RN']
        };

        const { error, data } = await supabase
          .from('profiles')
          .insert([newRecord])
          .select();
        
        if (error) {
          console.error('Supabase raw error:', error);
          throw new Error(`DB Error: ${error.message || error.details || 'Unknown code'} (${error.code})`);
        }
        
        alert('Staff record created successfully!');
      } else if (editingId) {
        const updateRecord = {
          name: editForm.name,
          email: editForm.email,
          emp_id: editForm.emp_id || '',
          roles: editForm.roles || ['RN']
        };

        const { error } = await supabase
          .from('profiles')
          .update(updateRecord)
          .eq('id', editingId);
        
        if (error) throw error;
        alert('Updates applied successfully!');
      }
      
      cancelEdit();
      await fetchStaff();
    } catch (err: any) {
        console.error('StaffManager Save Error:', err);
        alert('ACTION FAILED: ' + (err.message || 'Check console for errors'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this staff member? This will not delete their login account, only their professional profile.')) return;
    
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      fetchStaff();
    } catch (err: any) {
      alert('Error deleting: ' + err.message);
    }
  };

  const toggleRole = (role: UserRole) => {
    const currentRoles = editForm.roles || [];
    if (currentRoles.includes(role)) {
      setEditForm({ ...editForm, roles: currentRoles.filter(r => r !== role) });
    } else {
      setEditForm({ ...editForm, roles: [...currentRoles, role] });
    }
  };

  const filteredStaff = staff.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.emp_id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = selectedRoleFilter === 'All' || s.roles.includes(selectedRoleFilter as UserRole);
    
    return matchesSearch && matchesRole;
  });

  return (
    <div className="min-h-screen p-4 md:p-8 relative overflow-hidden">
        {/* Header */}
        <div className="max-w-6xl mx-auto mb-5 sm:mb-8 flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 z-10 relative">
            <div className="flex items-center gap-3 sm:gap-4">
                <button 
                  onClick={onBack}
                  className="glass p-2.5 sm:p-3 rounded-xl sm:rounded-2xl text-white/60 hover:text-white transition-colors shrink-0"
                >
                    <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
                <div>
                    <h1 className="text-xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-2 sm:gap-3">
                        <Users className="w-5 h-5 sm:w-8 sm:h-8 text-blue-400" />
                        Staff Management
                    </h1>
                    <p className="text-white/40 text-[9px] sm:text-sm uppercase tracking-widest font-black opacity-60">Database Hub</p>
                </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1 sm:flex-none">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                    <input 
                      type="text"
                      placeholder="Search staff..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="glass bg-white/5 border-white/10 rounded-xl sm:rounded-2xl pl-12 pr-4 py-3 sm:py-3.5 text-sm text-white focus:outline-none focus:border-blue-500/50 w-full lg:w-64"
                    />
                </div>
                <button 
                  onClick={startAdd}
                  className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl sm:rounded-2xl px-6 py-3 sm:py-3.5 font-bold uppercase tracking-widest text-[10px] sm:text-xs flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
                >
                    <Plus className="w-5 h-5" />
                    Add Staff
                </button>
            </div>
        </div>

        {/* Filters Bar */}
        <div className="max-w-6xl mx-auto mb-8 flex flex-wrap items-center gap-2 z-10 relative">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-white/30 mr-2">Filter by Role:</span>
            <button
                onClick={() => setSelectedRoleFilter('All')}
                className={cn(
                    "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                    selectedRoleFilter === 'All' 
                        ? "bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20" 
                        : "bg-white/5 text-white/40 border-white/5 hover:bg-white/10"
                )}
            >
                All
            </button>
            {ROLES.map(role => (
                <button
                    key={role}
                    onClick={() => setSelectedRoleFilter(role)}
                    className={cn(
                        "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                        selectedRoleFilter === role 
                            ? "bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20" 
                            : "bg-white/5 text-white/40 border-white/5 hover:bg-white/10"
                    )}
                >
                    {role}
                </button>
            ))}
        </div>

        <div className="max-w-6xl mx-auto z-10 relative">
            <div className="grid grid-cols-1 gap-4">
                <AnimatePresence mode="popLayout">
                    {(isAdding || editingId) && (
                        <motion.div 
                          initial={{ opacity: 0, y: -20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="glass p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] border-2 border-blue-500/20 mb-8"
                        >
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                                <div className="space-y-1.5 sm:space-y-2">
                                    <label className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/40 ml-1 sm:ml-2">Full Name</label>
                                    <input 
                                      value={editForm.name}
                                      onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm sm:text-base text-white focus:outline-none focus:border-blue-500"
                                      placeholder="Ex: John Doe"
                                    />
                                </div>
                                <div className="space-y-1.5 sm:space-y-2">
                                    <label className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/40 ml-1 sm:ml-2">Email</label>
                                    <input 
                                      value={editForm.email}
                                      onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm sm:text-base text-white focus:outline-none focus:border-blue-500"
                                      placeholder="Ex: john@cloudphysician.net"
                                    />
                                </div>
                                <div className="space-y-1.5 sm:space-y-2">
                                    <label className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/40 ml-1 sm:ml-2">Employee ID</label>
                                    <input 
                                      value={editForm.emp_id}
                                      onChange={(e) => setEditForm({...editForm, emp_id: e.target.value})}
                                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm sm:text-base text-white focus:outline-none focus:border-blue-500"
                                      placeholder="Ex: E-1234"
                                    />
                                </div>
                                <div className="space-y-1.5 sm:space-y-2">
                                    <label className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/40 ml-1 sm:ml-2">Auth ID (Optional)</label>
                                    <input 
                                      value={editForm.id || ''}
                                      onChange={(e) => setEditForm({...editForm, id: e.target.value})}
                                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-blue-500"
                                      placeholder="Supabase Auth UID"
                                    />
                                </div>
                                <div className="space-y-1.5 sm:space-y-2">
                                    <label className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/40 ml-1 sm:ml-2">Designations</label>
                                    <div className="flex flex-wrap gap-2 py-1">
                                        {ROLES.map(role => (
                                            <button
                                              key={role}
                                              type="button"
                                              onClick={() => toggleRole(role)}
                                              className={cn(
                                                  "px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all",
                                                  editForm.roles?.includes(role) 
                                                    ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20" 
                                                    : "bg-white/5 text-white/40 hover:bg-white/10"
                                              )}
                                            >
                                                {role}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 mt-6 sm:mt-8 pt-6 border-t border-white/5">
                                <button 
                                  type="button"
                                  onClick={cancelEdit} 
                                  disabled={isSaving}
                                  className="w-full sm:w-auto px-6 py-3 rounded-xl text-white/40 hover:text-white transition-colors disabled:opacity-50 text-sm font-bold order-2 sm:order-1"
                                >
                                  Cancel
                                </button>
                                <button 
                                  type="button"
                                  onClick={(e) => {
                                      e.preventDefault();
                                      handleSave();
                                  }} 
                                  disabled={isSaving}
                                  className="w-full sm:w-auto group relative bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-bold transition-all active:scale-95 disabled:bg-white/5 disabled:text-white/20 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(37,99,235,0.2)] flex items-center justify-center gap-2 order-1 sm:order-2"
                                >
                                    {isSaving ? (
                                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                                    ) : (
                                      <>
                                        <Save className="w-4 h-4" />
                                        {isAdding ? 'Create Staff Record' : 'Save Changes'}
                                      </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center p-20">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                        </div>
                    ) : filteredStaff.map((member, idx) => (
                        <motion.div
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          key={member.id}
                          className="glass p-3 sm:p-6 rounded-xl sm:rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 hover:bg-white/5 transition-all group border border-white/5"
                        >
                            <div className="flex items-start sm:items-center gap-3 sm:gap-5">
                                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-white/10 to-transparent flex items-center justify-center border border-white/10 group-hover:border-blue-500/30 transition-colors shrink-0">
                                    <UserIcon className="w-5 h-5 sm:w-7 sm:h-7 text-white/20 group-hover:text-blue-400" />
                                </div>
                                <div className="space-y-1.5 sm:space-y-1 min-w-0 flex-1">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                                        <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate shrink-0">{member.name}</h3>
                                        <div className="flex flex-wrap gap-1">
                                            {member.roles.map(role => (
                                                <span key={role} className="flex items-center gap-1 bg-blue-500/10 text-blue-400 text-[8px] sm:text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-blue-500/20 whitespace-nowrap">
                                                    {role === 'Admin' && <Shield className="w-2.5 h-2.5" />}
                                                    {role}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-x-6 gap-y-1 text-xs">
                                        <span className="text-white/40 flex items-center gap-1.5 font-mono uppercase tracking-tighter overflow-hidden">
                                            <span className="w-1 h-1 rounded-full bg-white/20 shrink-0" />
                                            <span className="truncate">{member.emp_id || 'NO ID'}</span>
                                        </span>
                                        <span className="text-white/20 flex items-center gap-1.5 italic overflow-hidden">
                                            <span className="w-1 h-1 rounded-full bg-white/20 shrink-0" />
                                            <span className="truncate text-[10px] sm:text-xs">{member.email}</span>
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                          <div className="grid grid-cols-2 md:flex items-center gap-2 sm:gap-3 mt-1 sm:mt-4 md:mt-0 opacity-100 transition-opacity">
                                <button 
                                  onClick={() => startEdit(member)}
                                  className="p-2.5 sm:p-3 rounded-xl bg-white/5 hover:bg-blue-500/20 text-white/60 hover:text-blue-400 transition-all border border-white/5 hover:border-blue-500/30 flex items-center justify-center gap-2 group/btn"
                                >
                                    <Edit2 className="w-4 h-4" />
                                    <span className="text-[10px] font-black uppercase tracking-widest md:hidden">Edit</span>
                                </button>
                                <button 
                                  onClick={() => handleDelete(member.id)}
                                  className="p-2.5 sm:p-3 rounded-xl bg-white/5 hover:bg-red-500/20 text-white/60 hover:text-red-400 transition-all border border-white/5 hover:border-red-500/30 flex items-center justify-center gap-2 group/btn"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    <span className="text-[10px] font-black uppercase tracking-widest md:hidden">Delete</span>
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>

        {/* Info card */}
        <div className="max-w-6xl mx-auto mt-12 p-8 glass rounded-[2.5rem] bg-blue-500/5 border border-white/5">
            <h4 className="text-white font-bold mb-2 flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-400" />
                Staff Access Note
            </h4>
            <p className="text-white/60 text-sm leading-relaxed max-w-2xl">
                Staff management here updates the professional details (Names, Designations, Emp ID) that appear on the calendar. To allow a new staff member to sign in, ensure you have also created a login account in your Supabase Auth dashboard using the same email address.
            </p>
        </div>
    </div>
  );
}
