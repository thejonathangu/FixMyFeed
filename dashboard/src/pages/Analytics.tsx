import { motion } from 'framer-motion';

const HEX_EMBED_URL =
  'https://app.hex.tech/019d36de-2e5c-700e-8814-0a1d0d57d82b/app/Analytics-032q6cNYNEahELW9NYlQca/latest?embedded=1';

const HEX_FULL_URL =
  'https://app.hex.tech/019d36de-2e5c-700e-8814-0a1d0d57d82b/app/Analytics-032q6cNYNEahELW9NYlQca/latest';

export default function Analytics() {
  return (
    <motion.div
      className="h-full overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header — stays centred with consistent app padding */}
      <motion.div
        className="max-w-5xl mx-auto px-6 sm:px-10 pt-8 sm:pt-10 pb-5 flex items-center justify-between"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
      >
        <div>
          <h2 className="font-body text-xl font-medium tracking-tight text-text-primary mb-0.5">
            Attention analytics
          </h2>
          <p className="font-body text-xs text-text-dim">
            Interactive data explorer — powered by Hex
          </p>
        </div>

        <a
          href={HEX_FULL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-body text-[10px] uppercase tracking-wide transition-all hover:opacity-70 active:scale-95"
          style={{
            background: 'rgba(107, 101, 96, 0.1)',
            color: '#6b6560',
            border: '1px solid rgba(107, 101, 96, 0.2)',
          }}
        >
          Open full
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
            <path
              d="M1.5 6.5L6.5 1.5M6.5 1.5H2.5M6.5 1.5V5.5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      </motion.div>

      {/* Iframe card — full available width so no chart is clipped */}
      <motion.div
        className="mx-8 sm:mx-12 mb-6 sm:mb-8 rounded-2xl overflow-hidden glass-frosted"
        style={{
          border: '1px solid rgba(44, 38, 31, 0.11)',
          boxShadow:
            '0 2px 20px rgba(44, 38, 31, 0.07), 0 1px 4px rgba(44, 38, 31, 0.04)',
        }}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Accent stripe */}
        <div
          aria-hidden
          style={{
            height: 3,
            background:
              'linear-gradient(90deg, #4e7754 0%, #6b6560 55%, #a86063 100%)',
            opacity: 0.5,
          }}
        />

        <iframe
          src={HEX_EMBED_URL}
          title="FixMyFeed Analytics"
          allow="autoplay; fullscreen; clipboard-write"
          loading="eager"
          style={{
            display: 'block',
            width: '100%',
            height: 1200,
            border: 'none',
          }}
        />
      </motion.div>
    </motion.div>
  );
}
