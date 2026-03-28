import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import NeuralMap from '../pages/NeuralMap';
import Analytics from '../pages/Analytics';

type View = 'neural-map' | 'analytics';

const TABS: { id: View; label: string; icon: string }[] = [
  { id: 'neural-map', label: 'Neural Map', icon: '◈' },
  { id: 'analytics', label: 'Analytics', icon: '◇' },
];

export default function Dashboard() {
  const [view, setView] = useState<View>('neural-map');

  return (
    <div className="min-h-screen bg-[#010409] flex items-center justify-center p-2 sm:p-6 lg:p-10">
      <div className="flex flex-col w-full max-w-7xl h-[calc(100vh-1rem)] sm:h-[calc(100vh-3rem)] lg:h-[calc(100vh-5rem)] bg-void overflow-hidden rounded-xl border border-[#30363d] shadow-[0_0_100px_rgba(0,0,0,1)] relative">
        {/* Top navigation bar */}
        <nav className="shrink-0 border-b border-[#30363d] bg-[#0d1117]/80 backdrop-blur-xl z-50">
          <div className="w-full flex items-center justify-between px-6 py-3">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-xs"
              style={{
                background: 'linear-gradient(135deg, rgba(26, 107, 255, 0.15), rgba(0, 255, 213, 0.08))',
                border: '1px solid rgba(0, 255, 213, 0.1)',
              }}
            >
              <span className="text-value">◈</span>
            </div>
            <span className="font-display text-xs tracking-[0.15em] text-text-primary uppercase">
              Neuro-Shield
            </span>
          </div>

          {/* Tabs */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full p-1" style={{ background: 'rgba(255,255,255,0.03)' }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                className="relative px-5 py-1.5 rounded-full font-display text-[10px] tracking-[0.15em] uppercase transition-colors duration-200"
                style={{ color: view === tab.id ? '#e8e8f0' : '#6a6a80' }}
              >
                {view === tab.id && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <span className="text-xs">{tab.icon}</span>
                  {tab.label}
                </span>
              </button>
            ))}
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-2">
            <div className="relative w-1.5 h-1.5">
              <div className="absolute inset-0 rounded-full bg-value animate-ping opacity-50" />
              <div className="absolute inset-0 rounded-full bg-value" />
            </div>
            <span className="font-display text-[9px] tracking-[0.15em] text-text-dim uppercase">
              Shield Active
            </span>
          </div>
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
        </AnimatePresence>
      </div>
    </div>
    </div>
  );
}
