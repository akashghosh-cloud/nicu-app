import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, FileText, PieChart, Clock, LogOut, Settings as SettingsIcon, Users, FileSpreadsheet, Sun, Moon, MoreVertical, Info, Flag, X, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/utils';
import Notifications from './Notifications';

// ── About Modal ─────────────────────────────────────────────────────────────
function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        key="about-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 30 }}
          transition={{ type: 'spring', damping: 20 }}
          onClick={e => e.stopPropagation()}
          className="relative w-full max-w-sm bg-[#0f1e36] border border-white/10 rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-5"
        >
          <button onClick={onClose} className="absolute top-4 right-4 text-white/30 hover:text-white/80 transition-colors">
            <X className="w-5 h-5" />
          </button>

          {/* Icon */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Info className="w-8 h-8 text-white" />
          </div>

          <div className="text-center flex flex-col gap-2">
            <h2 className="text-2xl font-bold text-white tracking-tight">NICU App</h2>
            <p className="text-white/50 text-sm">AL & Leave Request Management</p>
          </div>

          <div className="w-full border-t border-white/10" />

          <div className="text-center flex flex-col gap-1">
            <p className="text-white/40 text-xs uppercase tracking-widest font-semibold">Built &amp; Developed by</p>
            <p className="text-white text-lg font-bold tracking-wide">Akash Ghosh</p>
          </div>

          <div className="w-full border-t border-white/10" />

          <p className="text-white/25 text-xs text-center">© {new Date().getFullYear()} Cloudphysician · All rights reserved</p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Report Modal ─────────────────────────────────────────────────────────────
function ReportModal({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const handleSend = () => {
    const subject = encodeURIComponent('NICU App – Bug Report / Feedback');
    const body = encodeURIComponent(message || 'Please describe your issue or feedback here.');
    window.location.href = `mailto:akash.ghosh@cloudphysician.net?subject=${subject}&body=${body}`;
    setSent(true);
    setTimeout(onClose, 1500);
  };

  return (
    <AnimatePresence>
      <motion.div
        key="report-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 30 }}
          transition={{ type: 'spring', damping: 20 }}
          onClick={e => e.stopPropagation()}
          className="relative w-full max-w-sm bg-[#0f1e36] border border-white/10 rounded-3xl p-8 shadow-2xl flex flex-col gap-5"
        >
          <button onClick={onClose} className="absolute top-4 right-4 text-white/30 hover:text-white/80 transition-colors">
            <X className="w-5 h-5" />
          </button>

          {/* Icon */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg shadow-red-500/30 shrink-0">
              <Flag className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Report an Issue</h2>
              <p className="text-white/40 text-xs">Send feedback to the developer</p>
            </div>
          </div>

          <div className="w-full border-t border-white/10" />

          {sent ? (
            <div className="text-center py-4">
              <p className="text-emerald-400 font-semibold text-lg">Opening mail client…</p>
              <p className="text-white/40 text-xs mt-1">Thank you for your feedback!</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-white/50 text-xs uppercase tracking-widest font-semibold">Your message</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Describe the issue or share your feedback…"
                  rows={5}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/80 text-sm placeholder:text-white/20 focus:outline-none focus:border-blue-500/50 resize-none"
                />
              </div>

              <p className="text-white/25 text-[11px]">
                This will open your mail app pre-filled to <span className="text-blue-400">akash.ghosh@cloudphysician.net</span>
              </p>

              <button
                onClick={handleSend}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-blue-500/20"
              >
                <Send className="w-4 h-4" />
                Send Report
              </button>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Three-dot Menu ────────────────────────────────────────────────────────────
function AppMenu({ onAbout, onReport }: { onAbout: () => void; onReport: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="glass-dark w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl sm:rounded-2xl text-white/40 hover:text-white/80 hover:bg-white/10 transition-all active:scale-95 border border-white/5"
        title="Menu"
      >
        <MoreVertical className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-44 bg-[#0f1e36] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[150]"
          >
            <button
              onClick={() => { setOpen(false); onAbout(); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-white/70 hover:text-white hover:bg-white/8 transition-colors text-sm font-medium"
            >
              <Info className="w-4 h-4 text-blue-400 shrink-0" />
              About
            </button>
            <div className="mx-4 h-px bg-white/5" />
            <button
              onClick={() => { setOpen(false); onReport(); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-white/70 hover:text-white hover:bg-white/8 transition-colors text-sm font-medium"
            >
              <Flag className="w-4 h-4 text-red-400 shrink-0" />
              Report
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface NavButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  comingSoon?: boolean;
  color: string;
}

const NavButton = ({ icon, label, onClick, comingSoon, color }: NavButtonProps) => (
  <motion.button
    whileHover={{ y: -5, scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={comingSoon ? undefined : onClick}
    className={cn(
      "glass group relative overflow-hidden p-4 sm:p-8 rounded-2xl sm:rounded-[2rem] flex flex-col items-center justify-center gap-3 sm:gap-4 transition-all duration-300 min-h-[140px] sm:min-h-0",
      comingSoon ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-white/10"
    )}
  >
    <div className={cn(
      "p-3 sm:p-5 rounded-xl sm:rounded-2xl transition-all duration-500",
      comingSoon ? "bg-white/5" : `bg-${color}-500/10 group-hover:bg-${color}-500/20`
    )}>
      {React.cloneElement(icon as React.ReactElement, { 
        className: cn("w-6 h-6 sm:w-10 sm:h-10", comingSoon ? "text-white/20" : `text-${color}-400 group-hover:scale-110 transition-transform duration-500`)
      })}
    </div>
    <span className="text-sm sm:text-xl font-semibold tracking-wide text-white/90 text-center">{label}</span>
    {comingSoon && (
      <span className="absolute top-2 right-2 sm:top-4 sm:right-4 bg-white/10 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-white/40 border border-white/5">
        Soon
      </span>
    )}
    
    {/* Background Glow */}
    {!comingSoon && (
      <div className={cn(
        "absolute -bottom-10 -right-10 w-32 h-32 blur-[60px] opacity-0 group-hover:opacity-20 transition-opacity duration-500",
        `bg-${color}-500`
      )} />
    )}
  </motion.button>
);

export default function Dashboard({ 
  onNavigate,
  theme,
  toggleTheme
}: { 
  onNavigate: (path: 'AL' | 'LR' | 'SL' | 'STAFF' | 'HOME' | 'SETTINGS' | 'REQUESTS' | 'BALANCES' | 'RECORDS') => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}) {
  const { profile, loading, user } = useAuth();
  const isAdmin = profile?.roles.includes('Admin');
  const [showAbout, setShowAbout] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
      window.location.href = '/';
    }
  };

  if (loading) return null;

  return (
    <div className="min-h-screen p-4 sm:p-8 md:p-12 relative overflow-hidden">
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {showReport && <ReportModal onClose={() => setShowReport(false)} />}
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-200px] right-[-100px] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-200px] left-[-100px] w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Header Profile - Elegant Design */}
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center mb-12 sm:mb-24 gap-6 relative z-20">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3 bg-white/5 backdrop-blur-md border border-white/10 p-2 pr-6 rounded-full shadow-2xl w-full sm:w-auto"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-base sm:text-lg border border-white/20 shadow-lg shrink-0">
            {profile?.name?.charAt(0)}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold tracking-wide text-white/90 truncate">{profile?.name}</span>
            <span className="text-[10px] uppercase text-blue-400 font-bold tracking-widest truncate">
              {profile?.roles.join(' • ')}
            </span>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto justify-end"
        >
          <div className="hidden lg:flex gap-2">
             <div className="glass px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest text-white/30 border-white/5 hover:bg-white/5 transition-colors cursor-default">
               Live Sync Active
             </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 relative">
            <Notifications />
          </div>

          <button 
            onClick={toggleTheme}
            className="glass-dark w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl sm:rounded-2xl text-white/40 hover:text-amber-400 hover:bg-amber-500/10 transition-all active:scale-95 border border-white/5 animate-fade-in"
            title={theme === 'dark' ? "Switch to Light Theme" : "Switch to Dark Theme"}
            id="dashboard-theme-toggle"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>

          <button 
            onClick={() => onNavigate('SETTINGS')}
            className="glass-dark w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl sm:rounded-2xl text-white/40 hover:text-blue-400 hover:bg-blue-500/10 transition-all active:scale-95 border border-white/5"
            title="Account Settings"
          >
            <SettingsIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button 
            onClick={handleSignOut}
            className="glass-dark w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl sm:rounded-2xl text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all active:scale-95 border border-white/5"
          >
            <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          <AppMenu onAbout={() => setShowAbout(true)} onReport={() => setShowReport(true)} />
        </motion.div>
      </div>

      {/* Main Grid */}
      <div className="max-w-7xl mx-auto relative z-10 px-2 sm:px-0">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
          <NavButton 
            icon={<Calendar />} 
            label="AL Planner" 
            color="blue"
            onClick={() => onNavigate('AL')} 
          />
          <NavButton 
            icon={<FileText />} 
            label="Leave Request" 
            color="orange"
            onClick={() => onNavigate('LR')} 
          />
          <NavButton 
            icon={<FileText />} 
            label="Sick Leave" 
            color="red"
            onClick={() => onNavigate('SL')} 
          />
          {isAdmin && (
            <NavButton 
              icon={<Users className="w-10 h-10" />} 
              label="Staff Manager" 
              color="indigo"
              onClick={() => onNavigate('STAFF')} 
            />
          )}
          {isAdmin && (
            <NavButton 
              icon={<FileSpreadsheet className="w-10 h-10" />} 
              label="Backend Record" 
              color="purple"
              onClick={() => onNavigate('RECORDS')} 
            />
          )}
          <NavButton 
            icon={<Clock />} 
            label="Requests" 
            color="amber"
            onClick={() => onNavigate('REQUESTS')} 
          />
          <NavButton 
            icon={<PieChart />} 
            label="Leave Balances" 
            color="emerald"
            onClick={() => onNavigate('BALANCES')} 
          />
        </div>
      </div>
      
      {/* 3D background elements */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-[20%] right-[10%] w-[30vw] h-[30vw] bg-blue-600/5 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[20%] left-[10%] w-[30vw] h-[30vw] bg-indigo-600/5 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '3s' }} />
      </div>
    </div>
  );
}
