/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import AlPlanner from './components/AlPlanner';
import LeaveRequest from './components/LeaveRequest';
import StaffManager from './components/StaffManager';
import Settings from './components/Settings';
import RequestsManager from './components/RequestsManager';
import AlBalances from './components/AlBalances';
import SickLeave from './components/SickLeave';
import BackendRecords from './components/BackendRecords';
import ChatBot from './components/ChatBot';
import Notifications from './components/Notifications';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Sun, Moon } from 'lucide-react';

type View = 'HOME' | 'AL' | 'LR' | 'SL' | 'STAFF' | 'SETTINGS' | 'REQUESTS' | 'BALANCES' | 'RECORDS';

export default function App() {
  const { user, profile, loading } = useAuth();
  const [currentView, setCurrentView] = useState<View>('HOME');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark';
  });

  React.useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Loader2 className="w-10 h-10 text-blue-500" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <div className="min-h-screen bg-[#0f172a] relative transition-colors duration-500">
      {/* Background dynamic orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-blue-600/15 rounded-full blur-[140px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-emerald-600/10 rounded-full blur-[140px] animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[30%] right-[10%] w-[40vw] h-[40vw] bg-indigo-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '4s' }} />
      </div>

      {currentView !== 'HOME' && (
        <div className="fixed top-6 right-6 z-[100] flex items-center gap-2 sm:gap-4 animate-fade-in">
          <button
            onClick={toggleTheme}
            className="glass-dark w-10 h-10 flex items-center justify-center rounded-xl text-white/40 hover:text-amber-400 hover:bg-amber-500/10 transition-all active:scale-95 border border-white/5"
            title={theme === 'dark' ? "Switch to Light Theme" : "Switch to Dark Theme"}
            id="global-theme-toggle"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <Notifications />
        </div>
      )}

      <main className="relative z-10">
        <AnimatePresence mode="wait">
          {currentView === 'HOME' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Dashboard onNavigate={setCurrentView} theme={theme} toggleTheme={toggleTheme} />
            </motion.div>
          )}

          {currentView === 'AL' && (
            <motion.div
              key="al"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.4, type: 'spring', damping: 20 }}
            >
              <AlPlanner onBack={() => setCurrentView('HOME')} />
            </motion.div>
          )}

          {currentView === 'LR' && (
            <motion.div
              key="lr"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.4, type: 'spring', damping: 20 }}
            >
              <LeaveRequest onBack={() => setCurrentView('HOME')} />
            </motion.div>
          )}

          {currentView === 'SL' && (
            <motion.div
              key="sl"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.4, type: 'spring', damping: 20 }}
            >
              <SickLeave onBack={() => setCurrentView('HOME')} />
            </motion.div>
          )}

          {currentView === 'STAFF' && (
            <motion.div
              key="staff"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
            >
              <StaffManager onBack={() => setCurrentView('HOME')} />
            </motion.div>
          )}

          {currentView === 'SETTINGS' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Settings onBack={() => setCurrentView('HOME')} />
            </motion.div>
          )}

          {currentView === 'REQUESTS' && (
            <motion.div
              key="requests"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <RequestsManager onBack={() => setCurrentView('HOME')} />
            </motion.div>
          )}

          {currentView === 'BALANCES' && (
            <motion.div
              key="balances"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <AlBalances onBack={() => setCurrentView('HOME')} />
            </motion.div>
          )}

          {currentView === 'RECORDS' && (
            <motion.div
              key="records"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <BackendRecords onBack={() => setCurrentView('HOME')} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <ChatBot />
    </div>
  );
}

