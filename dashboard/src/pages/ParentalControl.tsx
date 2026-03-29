import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  fetchSettings,
  upsertSettings,
  hashPin,
  type ParentalSettings,
} from '../services/supabaseClient';

const DEFAULT_INTERESTS = ['software engineering', 'cooking', 'tennis'];
const DEFAULT_TOXIC = ['prank', 'gossip', 'rage', 'brainrot'];

// ── Sub-components ────────────────────────────────────────────────────────────

function Tag({
  label,
  color,
  onRemove,
  disabled,
}: {
  label: string;
  color: 'value' | 'toxic';
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const styles =
    color === 'value'
      ? { bg: 'rgba(253,250,246,0.95)', border: 'rgba(44,38,31,0.16)', text: '#2c261f' }
      : { bg: 'rgba(253,250,246,0.95)', border: 'rgba(44,38,31,0.16)', text: '#2c261f' };

  return (
    <span
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-sm tracking-wide"
      style={{ background: styles.bg, border: `1px solid ${styles.border}`, color: styles.text }}
    >
      {label}
      {!disabled && onRemove && (
        <button
          onClick={onRemove}
          className="opacity-70 hover:opacity-100 transition-opacity flex items-center justify-center rounded-full"
          style={{ fontSize: '22px', width: '28px', height: '28px', lineHeight: 1, background: 'rgba(255,255,255,0.08)' }}
        >
          ×
        </button>
      )}
    </span>
  );
}

function TagInput({
  placeholder,
  color: _color,
  onAdd,
  disabled,
}: {
  placeholder: string;
  color: 'value' | 'toxic';
  onAdd: (val: string) => void;
  disabled?: boolean;
}) {
  const [val, setVal] = useState('');
  const accent = 'rgba(44,38,31,0.35)';

  const submit = () => {
    const trimmed = val.trim().toLowerCase();
    if (trimmed) { onAdd(trimmed); setVal(''); }
  };

  return (
    <div className="flex gap-3 mt-4">
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 bg-transparent border rounded-lg px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-dim transition-colors"
        style={{ borderColor: 'rgba(44,38,31,0.2)', opacity: disabled ? 0.45 : 1 }}
        onFocus={(e) => (e.target.style.borderColor = accent)}
        onBlur={(e) => (e.target.style.borderColor = 'rgba(44,38,31,0.2)')}
      />
      <button
        onClick={submit}
        disabled={disabled}
        className="px-5 py-3 rounded-lg text-sm tracking-wide border transition-opacity"
        style={{
          background: '#f3efe8',
          borderColor: 'rgba(44,38,31,0.2)',
          color: '#2c261f',
          opacity: disabled ? 0.45 : 1
        }}
      >
        +
      </button>
    </div>
  );
}

function PinInput({
  label,
  onSubmit,
  error,
}: {
  label: string;
  onSubmit: (pin: string) => void;
  error?: string;
}) {
  const [pin, setPin] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (error) {
      setShake(true);
      setPin('');
      setTimeout(() => setShake(false), 500);
      inputRef.current?.focus();
    }
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm tracking-wide text-text-muted uppercase">{label}</p>
      <motion.input
        ref={inputRef}
        type="password"
        inputMode="numeric"
        maxLength={4}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
        onKeyDown={(e) => e.key === 'Enter' && pin.length === 4 && onSubmit(pin)}
        placeholder="••••"
        animate={shake ? { x: [-6, 6, -6, 6, 0] } : {}}
        transition={{ duration: 0.35 }}
        className="w-36 text-center bg-transparent border rounded-lg px-4 py-3 text-2xl tracking-[0.4em] text-text-primary outline-none"
        style={{ borderColor: error ? '#d97757' : 'rgba(44,38,31,0.2)', letterSpacing: '0.4em' }}
      />
      {error && (
        <p className="text-xs tracking-wide text-text-muted">{error}</p>
      )}
      <button
        onClick={() => pin.length === 4 && onSubmit(pin)}
        disabled={pin.length !== 4}
        className="px-7 py-3 rounded-lg text-sm tracking-wide border transition-opacity"
        style={{
          background: '#f3efe8',
          borderColor: 'rgba(44,38,31,0.2)',
          color: '#2c261f',
          opacity: pin.length === 4 ? 1 : 0.45
        }}
      >
        Confirm
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ParentalControl() {
  const [userId, setUserId] = useState('');
  const [userIdInput, setUserIdInput] = useState('');
  const [settings, setSettings] = useState<ParentalSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);

  const [interests, setInterests] = useState<string[]>(DEFAULT_INTERESTS);
  const [toxic, setToxic] = useState<string[]>(DEFAULT_TOXIC);

  // PIN flow states
  const [unlocked, setUnlocked] = useState(false);
  const [pinMode, setPinMode] = useState<'none' | 'unlock' | 'set-1' | 'set-2' | 'remove'>(
    'none',
  );
  const [firstPin, setFirstPin] = useState('');
  const [pinError, setPinError] = useState('');

  const isLocked = settings?.locked && !unlocked;

  const flash = (msg: string, ok: boolean) => {
    setStatus({ msg, ok });
    setTimeout(() => setStatus(null), 3000);
  };

  // ── Load settings ──────────────────────────────────────────────────────────

  async function loadSettings(id: string) {
    setLoading(true);
    try {
      const data = await fetchSettings(id);
      if (data) {
        setSettings(data);
        setInterests(data.interests ?? DEFAULT_INTERESTS);
        setToxic(data.toxic_keywords ?? DEFAULT_TOXIC);
        setUnlocked(false);
        setPinMode('none');
      } else {
        setSettings({
          user_id: id,
          interests: DEFAULT_INTERESTS,
          toxic_keywords: DEFAULT_TOXIC,
          pin_hash: null,
          locked: false,
          updated_at: new Date().toISOString(),
        });
        setInterests(DEFAULT_INTERESTS);
        setToxic(DEFAULT_TOXIC);
        setUnlocked(true);
      }
    } catch {
      flash('Failed to load settings', false);
    } finally {
      setLoading(false);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    try {
      await upsertSettings({
        user_id: settings.user_id,
        interests,
        toxic_keywords: toxic,
        pin_hash: settings.pin_hash,
        locked: settings.locked,
      });
      setSettings((s) => s ? { ...s, interests, toxic_keywords: toxic } : s);
      flash('Settings saved to Supabase ✓', true);
    } catch {
      flash('Save failed', false);
    } finally {
      setSaving(false);
    }
  }

  // ── PIN handlers ──────────────────────────────────────────────────────────

  async function handleUnlock(pin: string) {
    if (!settings?.pin_hash) return;
    const h = await hashPin(pin);
    if (h === settings.pin_hash) {
      setUnlocked(true);
      setPinMode('none');
      setPinError('');
    } else {
      setPinError('Wrong PIN');
    }
  }

  async function handleSetPin1(pin: string) {
    setFirstPin(pin);
    setPinMode('set-2');
    setPinError('');
  }

  async function handleSetPin2(pin: string) {
    if (pin !== firstPin) {
      setPinError("PINs don't match");
      return;
    }
    const h = await hashPin(pin);
    const updated = { ...settings!, pin_hash: h, locked: true };
    setSettings(updated);
    await upsertSettings({
      user_id: updated.user_id,
      interests,
      toxic_keywords: toxic,
      pin_hash: updated.pin_hash,
      locked: updated.locked,
    });
    setUnlocked(true);
    setPinMode('none');
    setPinError('');
    flash('Parental lock enabled ✓', true);
  }

  async function handleRemovePin(pin: string) {
    if (!settings?.pin_hash) return;
    const h = await hashPin(pin);
    if (h !== settings.pin_hash) {
      setPinError('Wrong PIN');
      return;
    }
    const updated = { ...settings, pin_hash: null, locked: false };
    setSettings(updated);
    await upsertSettings({
      user_id: updated.user_id,
      interests,
      toxic_keywords: toxic,
      pin_hash: null,
      locked: false,
    });
    setUnlocked(true);
    setPinMode('none');
    setPinError('');
    flash('Parental lock removed', true);
  }

  // ── Keyword helpers ───────────────────────────────────────────────────────

  const addInterest = (val: string) => {
    if (!interests.includes(val)) setInterests((p) => [...p, val]);
  };
  const removeInterest = (i: number) => setInterests((p) => p.filter((_, idx) => idx !== i));
  const addToxic = (val: string) => {
    if (!toxic.includes(val)) setToxic((p) => [...p, val]);
  };
  const removeToxic = (i: number) => setToxic((p) => p.filter((_, idx) => idx !== i));

  // ── Render ────────────────────────────────────────────────────────────────

  if (!userId) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-xl"
        >
          <div
            className="rounded-2xl border p-10 text-center"
            style={{
              background: 'rgba(253,250,246,0.95)',
              borderColor: 'rgba(44,38,31,0.14)',
            }}
          >
            <h2 className="text-lg tracking-wide text-text-primary uppercase mb-3">
              Parental Control
            </h2>
            <p className="text-sm text-text-muted mb-7">
              Enter the User ID from the Shadow-Scroll extension to manage content settings.
            </p>
            <div className="flex gap-3">
              <input
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && userIdInput.trim()) {
                    setUserId(userIdInput.trim());
                    loadSettings(userIdInput.trim());
                  }
                }}
                placeholder="user_abc123..."
                className="flex-1 bg-transparent border rounded-lg px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-dim"
                style={{ borderColor: 'rgba(44,38,31,0.2)' }}
              />
              <button
                onClick={() => {
                  if (userIdInput.trim()) {
                    setUserId(userIdInput.trim());
                    loadSettings(userIdInput.trim());
                  }
                }}
                className="px-5 py-3 rounded-lg text-sm tracking-wide border"
                style={{ background: '#f3efe8', borderColor: 'rgba(44,38,31,0.2)', color: '#2c261f' }}
              >
                Load
              </button>
            </div>
            <p className="text-xs text-text-dim mt-4">
              Find your User ID in the extension popup under Settings.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 border rounded-full"
          style={{ borderColor: 'rgba(44,38,31,0.2)', borderTopColor: '#2c261f' }}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-10 py-10 space-y-8">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-2xl tracking-wide text-text-primary uppercase">
              Parental Control
            </h2>
            <button
              onClick={() => { setUserId(''); setSettings(null); setUnlocked(false); }}
              className="text-xs tracking-wide text-text-dim hover:text-text-muted transition-colors uppercase"
            >
              ← Switch User
            </button>
          </div>
          <p className="text-xs text-text-muted">
            Managing:{' '}
            <span className="text-text-primary">{userId}</span>
          </p>
        </motion.div>

        {/* Lock status banner */}
        <AnimatePresence>
          {settings?.locked && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 rounded-xl border px-4 py-3"
              style={{
                background: 'rgba(253,250,246,0.9)',
                borderColor: 'rgba(44,38,31,0.14)',
              }}
            >
              <div>
                <p className="text-sm tracking-wide uppercase text-text-primary">
                  {unlocked ? 'Unlocked for this session' : 'Parental Lock Active'}
                </p>
                <p className="text-xs text-text-dim mt-1">
                  {unlocked
                    ? 'Changes will be saved to Supabase'
                    : 'Enter PIN to modify settings'}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* PIN modal */}
        <AnimatePresence>
          {pinMode !== 'none' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="rounded-2xl border p-8 flex flex-col items-center gap-4"
              style={{
                background: 'rgba(253,250,246,0.95)',
                borderColor: 'rgba(44,38,31,0.14)',
              }}
            >
              {pinMode === 'unlock' && (
                <PinInput label="Enter PIN to unlock" onSubmit={handleUnlock} error={pinError} />
              )}
              {pinMode === 'set-1' && (
                <PinInput label="Set a 4-digit PIN" onSubmit={handleSetPin1} error={pinError} />
              )}
              {pinMode === 'set-2' && (
                <PinInput label="Confirm PIN" onSubmit={handleSetPin2} error={pinError} />
              )}
              {pinMode === 'remove' && (
                <PinInput label="Enter current PIN to remove lock" onSubmit={handleRemovePin} error={pinError} />
              )}
              <button
                onClick={() => { setPinMode('none'); setPinError(''); }}
                className="text-xs tracking-wide text-text-dim hover:text-text-muted uppercase transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Keywords panel */}
        {pinMode === 'none' && (
          <>
            {/* Interests */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-2xl border p-8"
              style={{
                background: 'rgba(253,250,246,0.95)',
                borderColor: 'rgba(44,38,31,0.14)',
                opacity: isLocked ? 0.5 : 1,
                pointerEvents: isLocked ? 'none' : 'auto',
              }}
            >
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-sm tracking-wide text-text-primary uppercase">
                  Allowed Interests
                </h3>
                <span className="ml-auto text-xs text-text-dim">
                  {interests.length} topics
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {interests.map((kw, i) => (
                  <Tag
                    key={kw}
                    label={kw}
                    color="value"
                    onRemove={() => removeInterest(i)}
                    disabled={isLocked}
                  />
                ))}
              </div>
              <TagInput
                placeholder="add interest..."
                color="value"
                onAdd={addInterest}
                disabled={isLocked}
              />
            </motion.div>

            {/* Toxic keywords */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl border p-8"
              style={{
                background: 'rgba(253,250,246,0.95)',
                borderColor: 'rgba(44,38,31,0.14)',
                opacity: isLocked ? 0.5 : 1,
                pointerEvents: isLocked ? 'none' : 'auto',
              }}
            >
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-sm tracking-wide text-text-primary uppercase">
                  Blocked Keywords
                </h3>
                <span className="ml-auto text-xs text-text-dim">
                  {toxic.length} filters
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {toxic.map((kw, i) => (
                  <Tag
                    key={kw}
                    label={kw}
                    color="toxic"
                    onRemove={() => removeToxic(i)}
                    disabled={isLocked}
                  />
                ))}
              </div>
              <TagInput
                placeholder="add blocked keyword..."
                color="toxic"
                onAdd={addToxic}
                disabled={isLocked}
              />
            </motion.div>

            {/* Actions */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="flex flex-wrap items-center gap-3"
            >
              {/* Save */}
              <button
                onClick={saveSettings}
                disabled={saving || isLocked}
                className="px-7 py-3 rounded-xl text-sm tracking-wide border transition-opacity"
                style={{
                  background: '#f3efe8',
                  borderColor: 'rgba(44,38,31,0.2)',
                  color: '#2c261f',
                  opacity: saving || isLocked ? 0.45 : 1
                }}
              >
                {saving ? 'Saving…' : 'Save to Supabase'}
              </button>

              {/* Lock controls */}
              {!settings?.locked && (
                <button
                  onClick={() => { setPinMode('set-1'); setPinError(''); }}
                  className="px-6 py-3 rounded-xl text-sm tracking-wide border transition-colors"
                  style={{ borderColor: 'rgba(44,38,31,0.2)', color: '#2c261f' }}
                >
                  Set Parental Lock
                </button>
              )}
              {settings?.locked && !unlocked && (
                <button
                  onClick={() => { setPinMode('unlock'); setPinError(''); }}
                  className="px-6 py-3 rounded-xl text-sm tracking-wide border transition-colors"
                  style={{ borderColor: 'rgba(44,38,31,0.2)', color: '#2c261f' }}
                >
                  Enter PIN
                </button>
              )}
              {settings?.locked && unlocked && (
                <button
                  onClick={() => { setPinMode('remove'); setPinError(''); }}
                  className="px-6 py-3 rounded-xl text-sm tracking-wide border transition-colors"
                  style={{ borderColor: 'rgba(44,38,31,0.2)', color: '#2c261f' }}
                >
                  Remove Lock
                </button>
              )}
            </motion.div>
          </>
        )}

        {/* Status toast */}
        <AnimatePresence>
          {status && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 rounded-xl border px-6 py-3 text-sm tracking-wide"
              style={{
                background: 'rgba(253,250,246,0.97)',
                borderColor: 'rgba(44,38,31,0.14)',
                color: '#2c261f',
                zIndex: 100,
              }}
            >
              {status.msg}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
