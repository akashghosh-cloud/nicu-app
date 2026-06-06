import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, 
  X, 
  Check, 
  Info, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle,
  ExternalLink,
  Trash2,
  BellOff
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { Notification } from '../types';

export default function Notifications() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    if (!user) return;

    fetchNotifications();

    // Subscribe to new notifications
    const channelName = `notifications_${user.id}_${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications', 
        filter: `user_id=eq.${user.id}` 
      }, (payload) => {
        setNotifications(prev => [payload.new as Notification, ...prev]);
      })
      .subscribe();

    // Click outside listener
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [user]);

  const fetchNotifications = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications(data || []);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);

      if (error) throw error;
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'danger': return <AlertCircle className="w-4 h-4 text-red-400" />;
      default: return <Info className="w-4 h-4 text-blue-400" />;
    }
  };

  const getTypeStyles = (type: string, isRead: boolean) => {
    if (isRead) return "bg-white/5 border-white/10 opacity-60";
    switch (type) {
      case 'success': return "bg-emerald-500/10 border-emerald-500/20";
      case 'warning': return "bg-amber-500/10 border-amber-500/20";
      case 'danger': return "bg-red-500/10 border-red-500/20";
      default: return "bg-blue-500/10 border-blue-500/20";
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative p-2 rounded-xl transition-all group",
          isOpen ? "bg-white/10 text-white" : "text-white/40 hover:text-white hover:bg-white/5"
        )}
      >
        <Bell className={cn("w-5 h-5 transition-transform duration-300", isOpen && "scale-110")} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-[#0f172a] animate-in zoom-in duration-300">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl z-[150] overflow-hidden"
          >
            <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest leading-none">Notifications</h3>
                <p className="text-[10px] text-white/30 font-bold uppercase mt-1">Status updates & alerts</p>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button 
                    onClick={markAllAsRead}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-emerald-400/60 hover:text-emerald-400 transition-colors flex items-center gap-1"
                    title="Mark all as read"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                )}
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 hover:bg-white/10 rounded-lg text-white/20 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-3 space-y-2 scrollbar-hide">
              {loading && notifications.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
                  <span className="text-[10px] font-black uppercase text-white/20 tracking-widest">Updating...</span>
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center gap-4 text-white/20 grayscale scale-90 opacity-50">
                  <BellOff className="w-12 h-12" />
                  <div className="text-center">
                    <p className="text-xs font-black uppercase tracking-widest">All caught up!</p>
                    <p className="text-[9px] font-bold mt-1">New notifications will appear here</p>
                  </div>
                </div>
              ) : (
                notifications.map((n) => (
                  <motion.div
                    layout
                    key={n.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      "group relative p-3 rounded-xl sm:rounded-2xl border transition-all duration-300",
                      getTypeStyles(n.type, n.is_read)
                    )}
                  >
                    <div className="flex gap-3">
                      <div className="mt-0.5">
                        {getIcon(n.type)}
                      </div>
                      <div className="flex-1 min-w-0 pr-6">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <h4 className={cn(
                            "text-xs font-bold truncate",
                            n.is_read ? "text-white/40" : "text-white"
                          )}>
                            {n.title}
                          </h4>
                          <span className="text-[8px] sm:text-[9px] font-black uppercase text-white/20 whitespace-nowrap">
                            {format(new Date(n.created_at), 'MMM d, p')}
                          </span>
                        </div>
                        <p className={cn(
                          "text-[11px] sm:text-xs font-medium leading-relaxed",
                          n.is_read ? "text-white/30" : "text-white/70"
                        )}>
                          {n.message}
                        </p>
                      </div>
                    </div>

                    {!n.is_read && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(n.id);
                        }}
                        className="absolute top-3 right-3 p-1 rounded-md bg-emerald-500/20 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Mark as read"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(n.id);
                      }}
                      className="absolute bottom-3 right-3 p-1 rounded-md bg-white/5 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete notification"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </motion.div>
                ))
              )}
            </div>

            {notifications.length > 0 && (
              <div className="p-3 border-t border-white/5 bg-white/5">
                <button
                  onClick={fetchNotifications}
                  className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all flex items-center justify-center gap-2"
                >
                  Refresh List
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
