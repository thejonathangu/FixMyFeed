import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface MindfulnessOverlayProps {
  toxicIntercepted: number;
  rewiringPct: number;
}

interface Alert {
  id: number;
  message: string;
  icon: string;
}

const THRESHOLDS: { at: number; field: 'toxicIntercepted' | 'rewiringPct'; message: string; icon: string }[] = [
  { at: 10,  field: 'toxicIntercepted', message: '10 dark-pattern loops intercepted. Shield active.',             icon: '⬡' },
  { at: 50,  field: 'toxicIntercepted', message: '50 dark-pattern loops intercepted. Neural rewiring in progress.', icon: '⚠️' },
  { at: 100, field: 'toxicIntercepted', message: '100 toxic hooks neutralized. Cognitive core stabilizing.',       icon: '◈' },
  { at: 200, field: 'toxicIntercepted', message: '200 manipulative patterns blocked. You are reclaiming focus.',   icon: '◉' },
  { at: 25,  field: 'rewiringPct',      message: '25% neural rewiring complete. New pathways forming.',            icon: '◇' },
  { at: 50,  field: 'rewiringPct',      message: '50% rewiring milestone. Value clusters now dominant.',           icon: '◆' },
  { at: 75,  field: 'rewiringPct',      message: '75% rewiring. Toxic influence nearly eliminated.',               icon: '⬢' },
  { at: 100, field: 'rewiringPct',      message: 'Full neural rewiring achieved. Cognitive sovereignty restored.', icon: '✦' },
];

export default function MindfulnessOverlay({ toxicIntercepted, rewiringPct }: MindfulnessOverlayProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const triggered = useRef<Set<string>>(new Set());
  const nextId = useRef(0);

  useEffect(() => {
    const values = { toxicIntercepted, rewiringPct };

    THRESHOLDS.forEach((th) => {
      const key = `${th.field}-${th.at}`;
      if (values[th.field] >= th.at && !triggered.current.has(key)) {
        triggered.current.add(key);
        const id = nextId.current++;
        setAlerts((prev) => [...prev, { id, message: th.message, icon: th.icon }]);

        // Auto-dismiss after 4s
        setTimeout(() => {
          setAlerts((prev) => prev.filter((a) => a.id !== id));
        }, 4000);
      }
    });
  }, [toxicIntercepted, rewiringPct]);

  return (
    <div className="fixed top-6 right-6 z-50 flex flex-col gap-3 pointer-events-none max-w-sm">
      <AnimatePresence mode="popLayout">
        {alerts.map((alert) => (
          <motion.div
            key={alert.id}
            layout
            initial={{ opacity: 0, x: 80, scale: 0.9, filter: 'blur(8px)' }}
            animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: 40, scale: 0.95, filter: 'blur(4px)' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto"
          >
            <div
              className="relative overflow-hidden rounded-lg border px-4 py-3"
              style={{
                background: 'rgba(253, 250, 246, 0.92)',
                borderColor: 'rgba(44, 38, 31, 0.14)',
                boxShadow: '0 4px 24px rgba(44, 38, 31, 0.08)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5 opacity-70">{alert.icon}</span>
                <div>
                  <p className="font-body text-[10px] tracking-widest text-text-muted uppercase mb-1">
                    FixMyFeed
                  </p>
                  <p className="text-sm text-text-primary leading-relaxed font-normal">
                    {alert.message}
                  </p>
                </div>
              </div>

              {/* Auto-dismiss progress bar */}
              <motion.div
                className="absolute bottom-0 left-0 h-[2px]"
                style={{ background: 'linear-gradient(90deg, #6b6560, #5a6d5a)' }}
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: 4, ease: 'linear' }}
              />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
