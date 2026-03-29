import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import NeuralMap from '../pages/NeuralMap';
import Analytics from '../pages/Analytics';

type View = 'neural-map' | 'analytics';

const TABS: { id: View; label: string }[] = [
  { id: 'neural-map', label: 'Map' },
  { id: 'analytics', label: 'Analytics' },
];

const tabEase = [0.22, 1, 0.36, 1] as const;

const tabPanel = {
  initial: { opacity: 0, x: 14 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.3, ease: tabEase } },
  exit: { opacity: 0, x: -10, transition: { duration: 0.3, ease: tabEase } },
};

export default function Dashboard() {
  const [view, setView] = useState<View>('neural-map');

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
              className="flex items-center gap-2 order-2 sm:order-3 sm:pl-2"
              title="Extension active"
            >
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
        </nav>

        <div className="flex-1 min-h-0 relative bg-void/30">
          <AnimatePresence mode="wait">
            {view === 'neural-map' && (
              <motion.div
                key="neural-map"
                variants={tabPanel}
                initial="initial"
                animate="animate"
                exit="exit"
                className="absolute inset-0"
              >
                <NeuralMap />
              </motion.div>
            )}
            {view === 'analytics' && (
              <motion.div
                key="analytics"
                variants={tabPanel}
                initial="initial"
                animate="animate"
                exit="exit"
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
