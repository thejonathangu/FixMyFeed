import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import NeuralMap from '../pages/NeuralMap';
import Analytics from '../pages/Analytics';
import ParentalControl from '../pages/ParentalControl';
import Insights from '../pages/Insights';

type View = 'neural-map' | 'analytics' | 'insights' | 'parental';

const TABS: { id: View; label: string; icon: string }[] = [
  { id: 'neural-map', label: 'Neural Map', icon: '◈' },
  { id: 'analytics', label: 'Analytics', icon: '◇' },
  { id: 'insights', label: 'AI Insights', icon: '✦' },
  { id: 'parental', label: 'Controls', icon: '🔐' },
];


export default function Dashboard() {
  const [view, setView] = useState<View>('neural-map');
  const [userId, setUserId] = useState<string>('');
  const [showUserInput, setShowUserInput] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlUserId = params.get('user_id');
    const storedUserId = localStorage.getItem('fixmyfeed_user_id');
    
    if (urlUserId) {
      setUserId(urlUserId);
      localStorage.setItem('fixmyfeed_user_id', urlUserId);
    } else if (storedUserId) {
      setUserId(storedUserId);
    }
  }, []);

  const handleUserIdSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem('userId') as HTMLInputElement;
    if (input.value.trim()) {
      setUserId(input.value.trim());
      localStorage.setItem('fixmyfeed_user_id', input.value.trim());
      setShowUserInput(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-stretch px-4 py-5 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
      <div
        className="flex flex-col w-full max-w-7xl mx-auto flex-1 min-h-0 h-[calc(100vh-4.5rem)] sm:h-[calc(100vh-6.5rem)] lg:h-[calc(100vh-7.5rem)] rounded-[1.35rem] border overflow-hidden"
        style={{
          background: 'linear-gradient(165deg, rgba(253, 250, 246, 0.78) 0%, rgba(248, 243, 236, 0.62) 100%)',
          borderColor: 'rgba(44, 38, 31, 0.12)',
          boxShadow:
            '0 2px 4px rgba(44, 38, 31, 0.05), 0 24px 56px rgba(44, 38, 31, 0.09), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
          backdropFilter: 'blur(16px) saturate(150%)',
          WebkitBackdropFilter: 'blur(16px) saturate(150%)',
        }}
      >
        <nav
          className="shrink-0 z-50 border-b"
          style={{
            borderColor: 'rgba(44, 38, 31, 0.1)',
            background: 'rgba(253, 250, 246, 0.45)',
            backdropFilter: 'blur(14px) saturate(140%)',
            WebkitBackdropFilter: 'blur(14px) saturate(140%)',
          }}
        >
          <div className="w-full flex flex-wrap items-center justify-between gap-4 px-5 sm:px-7 py-3.5 sm:py-4">
            <div className="flex flex-col gap-0.5 min-w-0 order-1">
              <h1 className="font-display text-2xl sm:text-3xl md:text-[2.1rem] text-text-primary leading-none truncate">
                FixMyFeed
              </h1>
              <p className="font-body text-[11px] sm:text-xs text-text-muted tracking-wide">
                Attention, distilled.
              </p>
            </div>

            <div
              className="order-3 sm:order-2 w-full sm:w-auto flex justify-center items-center gap-0.5 rounded-full p-0.5"
              style={{ background: 'rgba(44, 38, 31, 0.06)' }}
            >
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setView(tab.id)}
                  className="relative px-5 sm:px-6 py-2 rounded-full font-body text-xs font-medium transition-colors duration-200"
                  style={{
                    color: view === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  }}
                >
                  {view === tab.id && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: 'rgba(253, 250, 246, 0.92)',
                        border: '1px solid rgba(44, 38, 31, 0.1)',
                        boxShadow: '0 2px 6px rgba(44, 38, 31, 0.06)',
                      }}
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              ))}
            </div>

            <div
              className="flex items-center gap-3 order-2 sm:order-3 sm:pl-2"
            >
              {userId && (
                <button
                  onClick={() => setShowUserInput(!showUserInput)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors"
                  style={{
                    background: 'rgba(78, 119, 84, 0.1)',
                  }}
                  title="Click to change user ID"
                >
                  <span
                    className="font-body text-[10px] uppercase tracking-wide"
                    style={{ color: '#4e7754' }}
                  >
                    {userId.slice(0, 8)}...
                  </span>
                </button>
              )}
              <div className="flex items-center gap-2" title="Extension active">
                <motion.span
                  className="relative flex h-2 w-2 shrink-0"
                  aria-hidden
                >
                  <span
                    className="absolute inline-flex h-full w-full rounded-full opacity-40 animate-ping"
                    style={{ background: 'var(--color-value)' }}
                  />
                  <span
                    className="relative inline-flex h-2 w-2 rounded-full"
                    style={{ background: 'var(--color-value)' }}
                  />
                </motion.span>
                <span
                  className="font-body text-[10px] uppercase tracking-wider text-text-dim"
                  style={{ letterSpacing: '0.1em' }}
                >
                  Active
                </span>
              </div>
            </div>
            
            {/* User ID change modal */}
            <AnimatePresence>
              {showUserInput && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full right-5 mt-2 z-50"
                >
                  <form
                    onSubmit={handleUserIdSubmit}
                    className="flex gap-2 p-3 rounded-xl border shadow-lg"
                    style={{
                      background: 'rgba(253, 250, 246, 0.98)',
                      borderColor: 'rgba(44, 38, 31, 0.12)',
                    }}
                  >
                    <input
                      name="userId"
                      type="text"
                      defaultValue={userId}
                      placeholder="User ID"
                      className="px-3 py-1.5 rounded-lg border font-body text-xs w-44"
                      style={{
                        borderColor: 'rgba(44, 38, 31, 0.15)',
                        background: 'white',
                      }}
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg font-body text-xs font-medium"
                      style={{
                        background: '#4e7754',
                        color: 'white',
                      }}
                    >
                      Save
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </nav>

      {/* Page content */}
      <div className="flex-1 min-h-0 relative">
        <AnimatePresence mode="wait">
          {view === 'neural-map' && (
            <motion.div
              key="neural-map"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0"
            >
              <NeuralMap />
            </motion.div>
          )}
          {view === 'analytics' && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0"
            >
              <Analytics />
            </motion.div>
          )}
          {view === 'insights' && (
            <motion.div
              key="insights"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0"
            >
              {userId ? (
                <Insights userId={userId} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
                  <p className="font-body text-sm text-text-muted text-center max-w-md">
                    Enter your user ID to see AI-generated insights about your scrolling behavior.
                  </p>
                  <form onSubmit={handleUserIdSubmit} className="flex gap-2">
                    <input
                      name="userId"
                      type="text"
                      placeholder="Enter your user ID"
                      className="px-4 py-2 rounded-full border font-body text-sm"
                      style={{
                        borderColor: 'rgba(44, 38, 31, 0.15)',
                        background: 'rgba(253, 250, 246, 0.8)',
                      }}
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-full font-body text-xs font-medium"
                      style={{
                        background: 'rgba(78, 119, 84, 0.15)',
                        color: '#4e7754',
                      }}
                    >
                      Connect
                    </button>
                  </form>
                  <p className="font-body text-xs text-text-dim text-center">
                    Tip: Your user ID is shown in the Chrome extension popup
                  </p>
                </div>
              )}
            </motion.div>
          )}
          {view === 'parental' && (
            <motion.div
              key="parental"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0"
            >
              <ParentalControl />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </div>
    </div>
  );
}
