import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import NeuralMap from '../pages/NeuralMap';
import Analytics from '../pages/Analytics';

type View = 'neural-map' | 'analytics';

const TABS: { id: View; label: string }[] = [
  { id: 'neural-map', label: 'Map' },
  { id: 'analytics', label: 'Analytics' },
];

export default function Dashboard() {
  const [view, setView] = useState<View>('neural-map');

  return (
    <div className="min-h-screen flex flex-col items-stretch p-3 sm:p-6 lg:p-10">
      <header className="shrink-0 text-center pt-4 pb-6 sm:pt-6 sm:pb-8">
        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl text-text-primary leading-tight">
          FixMyFeed
        </h1>
        <p className="mt-2 text-sm text-text-muted font-body font-normal tracking-wide">
          Attention, distilled.
        </p>
      </header>

      <div
        className="flex flex-col w-full max-w-7xl mx-auto flex-1 min-h-0 h-[calc(100vh-10rem)] sm:h-[calc(100vh-12rem)] lg:h-[calc(100vh-13rem)] rounded-xl border overflow-hidden shadow-sm"
        style={{
          background: 'rgba(253, 250, 246, 0.72)',
          borderColor: 'rgba(44, 38, 31, 0.14)',
          boxShadow:
            '0 1px 2px rgba(44, 38, 31, 0.06), 0 12px 40px rgba(44, 38, 31, 0.06)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <nav
          className="shrink-0 border-b z-50"
          style={{
            borderColor: 'rgba(44, 38, 31, 0.1)',
            background: 'rgba(253, 250, 246, 0.65)',
          }}
        >
          <div className="w-full flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3">
            <div className="flex items-center gap-2 order-2 sm:order-1">
              <span
                className="font-body text-[11px] uppercase tracking-widest text-text-dim"
                style={{ letterSpacing: '0.12em' }}
              >
                Dashboard
              </span>
            </div>

            <div
              className="order-1 sm:order-2 w-full sm:w-auto flex justify-center items-center gap-0.5 rounded-full p-0.5"
              style={{ background: 'rgba(44, 38, 31, 0.06)' }}
            >
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setView(tab.id)}
                  className="relative px-4 sm:px-5 py-1.5 rounded-full font-body text-xs font-medium transition-colors duration-200"
                  style={{
                    color: view === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  }}
                >
                  {view === tab.id && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: 'rgba(253, 250, 246, 0.95)',
                        border: '1px solid rgba(44, 38, 31, 0.1)',
                        boxShadow: '0 1px 2px rgba(44, 38, 31, 0.05)',
                      }}
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 order-3">
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: 'var(--color-value)' }}
              />
              <span
                className="font-body text-[10px] uppercase tracking-wider text-text-dim"
                style={{ letterSpacing: '0.08em' }}
              >
                Active
              </span>
            </div>
          </div>
        </nav>

        <div className="flex-1 min-h-0 relative bg-void/30">
          <AnimatePresence mode="wait">
            {view === 'neural-map' && (
              <motion.div
                key="neural-map"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
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
                transition={{ duration: 0.2 }}
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
