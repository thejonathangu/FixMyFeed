const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export interface NodeData {
  id: string;
  weight: number;
  category: 'toxic' | 'value' | 'neutral';
  theme_name: string;
  description: string;
  x: number;
  y: number;
  z: number;
  connections: string[];
}

export interface Snapshot {
  timestamp: string;
  day: number;
  nodes: NodeData[];
  stats: {
    toxic_intercepted: number;
    value_reinforced: number;
    rewiring_pct: number;
    avg_session_quality: number;
    positive_watchtime_min: number;
    total_watchtime_min: number;
  };
}

export interface EvolvingDopamineStats {
  user_id: string;
  snapshots: Snapshot[];
}

export interface WatchtimePoint {
  day: number;
  label: string;
  positive_min: number;
  toxic_min: number;
  total_min: number;
  quality_score: number;
}

interface EventRecord {
  created_at: string;
  action_type: string;
  duration_ms: number;
  category_vector?: string[];
  deep_analysis?: {
    themes?: string[];
    dopamine_trigger?: string;
    growth_potential?: string;
  };
}

interface StatsData {
  skipped: number;
  liked: number;
  waited: number;
  total_watch_time_min: number;
  positive_watch_time_min: number;
  quality_ratio: number;
  events: EventRecord[];
}

function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  };
}

interface ThemeData {
  name: string;
  category: 'value' | 'toxic' | 'neutral';
  count: number;
  firstSeen: number;
  lastSeen: number;
  triggers: string[];
}

function extractThemesFromEvents(events: EventRecord[]): Map<string, ThemeData> {
  const themeMap = new Map<string, ThemeData>();
  
  events.forEach((event, idx) => {
    const isValue = event.action_type === 'LIKE_AND_STAY';
    const isToxic = event.action_type === 'SKIP';
    const isNeutral = event.action_type === 'WAIT';
    
    if (!isValue && !isToxic && !isNeutral) return;
    
    const themes = event.deep_analysis?.themes || event.category_vector || [];
    const trigger = event.deep_analysis?.dopamine_trigger || 'unknown';
    
    const category: 'value' | 'toxic' | 'neutral' = isValue ? 'value' : isToxic ? 'toxic' : 'neutral';
    
    for (const theme of themes) {
      if (!theme || theme.length < 2) continue;
      
      const existing = themeMap.get(theme);
      if (existing) {
        existing.count++;
        existing.lastSeen = idx;
        if (!existing.triggers.includes(trigger)) {
          existing.triggers.push(trigger);
        }
        // Upgrade category: value > neutral > toxic
        if (category === 'value') {
          existing.category = 'value';
        } else if (category === 'neutral' && existing.category === 'toxic') {
          existing.category = 'neutral';
        }
      } else {
        themeMap.set(theme, {
          name: theme,
          category,
          count: 1,
          firstSeen: idx,
          lastSeen: idx,
          triggers: [trigger],
        });
      }
    }
  });
  
  return themeMap;
}

function buildNodesAtTime(
  themes: Map<string, ThemeData>,
  timeProgress: number,
  totalEvents: number,
): NodeData[] {
  const nodes: NodeData[] = [];
  
  const valueThemes = Array.from(themes.values())
    .filter(t => t.category === 'value')
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  
  const toxicThemes = Array.from(themes.values())
    .filter(t => t.category === 'toxic')
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  
  const neutralThemes = Array.from(themes.values())
    .filter(t => t.category === 'neutral')
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  const maxCount = Math.max(
    ...valueThemes.map(t => t.count),
    ...toxicThemes.map(t => t.count),
    ...neutralThemes.map(t => t.count),
    1
  );
  
  // Toxic themes: start central, drift outward
  toxicThemes.forEach((theme, i) => {
    const rng = seededRandom(theme.name);
    const baseWeight = (theme.count / maxCount) * 0.7 + 0.3;
    const weight = Math.max(0.08, baseWeight * (1 - timeProgress * 0.85));
    
    const angle = (i / Math.max(toxicThemes.length, 1)) * Math.PI * 2 + rng() * 0.3;
    const radius = 0.12 + timeProgress * 0.32 + rng() * 0.06;
    
    nodes.push({
      id: `toxic-${i}`,
      weight,
      category: 'toxic',
      theme_name: theme.name,
      description: `Seen ${theme.count}x | ${theme.triggers.slice(0, 2).join(', ')}`,
      x: 0.5 + Math.cos(angle) * radius,
      y: 0.5 + Math.sin(angle) * radius,
      z: (rng() - 0.5) * 0.5,
      connections: toxicThemes
        .filter((_, j) => j !== i && Math.abs(j - i) <= 2)
        .slice(0, 3)
        .map((_, j) => `toxic-${j}`),
    });
  });
  
  // Neutral themes: drift from outer to middle ring over time
  neutralThemes.forEach((theme, i) => {
    const rng = seededRandom(theme.name);
    const baseWeight = (theme.count / maxCount) * 0.5 + 0.2;
    const weight = baseWeight + timeProgress * 0.15; // Slight growth over time
    
    const angle = (i / Math.max(neutralThemes.length, 1)) * Math.PI * 2 + rng() * 0.4 + Math.PI / 4;
    // Start at outer ring, drift to middle ring
    const startRadius = 0.35 + rng() * 0.08;
    const endRadius = 0.18 + rng() * 0.06;
    const radius = startRadius + (endRadius - startRadius) * timeProgress;
    
    nodes.push({
      id: `neutral-${i}`,
      weight,
      category: 'neutral',
      theme_name: theme.name,
      description: `Seen ${theme.count}x | ${theme.triggers.slice(0, 2).join(', ')}`,
      x: 0.5 + Math.cos(angle) * radius,
      y: 0.5 + Math.sin(angle) * radius,
      z: (rng() - 0.5) * 0.3,
      connections: neutralThemes
        .filter((_, j) => j !== i && Math.abs(j - i) <= 2)
        .slice(0, 2)
        .map((_, j) => `neutral-${j}`),
    });
  });
  
  // Value themes: start scattered, cluster to center
  valueThemes.forEach((theme, i) => {
    const rng = seededRandom(theme.name);
    const baseWeight = (theme.count / maxCount) * 0.5 + 0.15;
    const weight = Math.min(1, baseWeight + timeProgress * (0.9 - baseWeight));
    
    const cluster = i % 4;
    const clusterAngle = (cluster / 4) * Math.PI * 2 + 0.4;
    const spread = 0.35 * (1 - timeProgress) + 0.08;
    const angle = clusterAngle + (rng() - 0.5) * spread * 2.5;
    const radius = 0.28 * (1 - timeProgress * 0.65) + rng() * 0.05;
    
    nodes.push({
      id: `value-${i}`,
      weight,
      category: 'value',
      theme_name: theme.name,
      description: `Seen ${theme.count}x | ${theme.triggers.slice(0, 2).join(', ')}`,
      x: 0.5 + Math.cos(angle) * radius,
      y: 0.5 + Math.sin(angle) * radius,
      z: (rng() - 0.5) * 0.4,
      connections: valueThemes
        .filter((_, j) => j !== i && Math.abs(j - i) <= 2)
        .slice(0, 3)
        .map((_, j) => `value-${j}`),
    });
  });
  
  return nodes;
}

function generateSnapshotsFromEvents(events: EventRecord[]): Snapshot[] {
  if (events.length === 0) return [];
  
  const themes = extractThemesFromEvents(events);
  if (themes.size === 0) return [];
  
  const timelinePoints = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1.0];
  const labels = ['Start', 'Early', 'Building', 'Midpoint', 'Progress', 'Late', 'Current'];
  
  let cumulativeSkipped = 0;
  let cumulativeLiked = 0;
  let cumulativePositiveMs = 0;
  let cumulativeTotalMs = 0;
  
  return timelinePoints.map((t, idx) => {
    const eventCutoff = Math.floor(t * events.length);
    const eventsUpToNow = events.slice(0, eventCutoff || 1);
    
    const skipped = eventsUpToNow.filter(e => e.action_type === 'SKIP').length;
    const liked = eventsUpToNow.filter(e => e.action_type === 'LIKE_AND_STAY').length;
    const positiveMs = eventsUpToNow
      .filter(e => e.action_type === 'LIKE_AND_STAY')
      .reduce((sum, e) => sum + (e.duration_ms || 0), 0);
    const totalMs = eventsUpToNow.reduce((sum, e) => sum + (e.duration_ms || 0), 0);
    
    return {
      timestamp: labels[idx],
      day: idx,
      nodes: buildNodesAtTime(themes, t, events.length),
      stats: {
        toxic_intercepted: skipped,
        value_reinforced: liked,
        rewiring_pct: Math.min(100, Math.round(t * 100)),
        avg_session_quality: totalMs > 0 ? Math.round((positiveMs / totalMs) * 100) : 50,
        positive_watchtime_min: Math.round(positiveMs / 60000),
        total_watchtime_min: Math.round(totalMs / 60000),
      },
    };
  });
}

function generateWatchtimeFromEvents(events: EventRecord[]): WatchtimePoint[] {
  const byDate = new Map<string, EventRecord[]>();
  
  for (const e of events) {
    const date = e.created_at?.split('T')[0] || 'unknown';
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(e);
  }
  
  const sortedDates = Array.from(byDate.keys()).sort();
  
  return sortedDates.map((date, idx) => {
    const dayEvents = byDate.get(date) || [];
    
    const positiveMs = dayEvents
      .filter(e => e.action_type === 'LIKE_AND_STAY')
      .reduce((sum, e) => sum + (e.duration_ms || 0), 0);
    
    const toxicMs = dayEvents
      .filter(e => e.action_type === 'SKIP')
      .reduce((sum, e) => sum + (e.duration_ms || 0), 0);
    
    const waitMs = dayEvents
      .filter(e => e.action_type === 'WAIT')
      .reduce((sum, e) => sum + (e.duration_ms || 0), 0);
    
    const totalMs = positiveMs + toxicMs + waitMs;
    
    return {
      day: idx,
      label: date.slice(5),
      positive_min: Math.round(positiveMs / 60000),
      toxic_min: Math.round(toxicMs / 60000),
      total_min: Math.round(totalMs / 60000),
      quality_score: totalMs > 0 ? Math.round((positiveMs / totalMs) * 100) : 50,
    };
  });
}

// ---------------------------------------------------------------------------
// Demo data (fallback when no real data)
// ---------------------------------------------------------------------------
function generateDemoSnapshots(): Snapshot[] {
  const demoThemes = new Map<string, ThemeData>([
    ['productivity', { name: 'productivity', category: 'value', count: 8, firstSeen: 0, lastSeen: 10, triggers: ['mastery'] }],
    ['learning', { name: 'learning', category: 'value', count: 6, firstSeen: 1, lastSeen: 9, triggers: ['curiosity'] }],
    ['fitness', { name: 'fitness', category: 'value', count: 5, firstSeen: 2, lastSeen: 8, triggers: ['mastery'] }],
    ['creativity', { name: 'creativity', category: 'value', count: 4, firstSeen: 3, lastSeen: 7, triggers: ['awe'] }],
    ['mindfulness', { name: 'mindfulness', category: 'value', count: 3, firstSeen: 4, lastSeen: 6, triggers: ['curiosity'] }],
    ['drama', { name: 'drama', category: 'toxic', count: 7, firstSeen: 0, lastSeen: 5, triggers: ['outrage'] }],
    ['rage bait', { name: 'rage bait', category: 'toxic', count: 5, firstSeen: 1, lastSeen: 4, triggers: ['outrage'] }],
    ['clickbait', { name: 'clickbait', category: 'toxic', count: 4, firstSeen: 2, lastSeen: 3, triggers: ['fear'] }],
    ['gossip', { name: 'gossip', category: 'toxic', count: 3, firstSeen: 0, lastSeen: 2, triggers: ['social_validation'] }],
  ]);
  
  const timelinePoints = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1.0];
  const labels = ['Start', 'Early', 'Building', 'Midpoint', 'Progress', 'Late', 'Current'];
  
  return timelinePoints.map((t, idx) => ({
    timestamp: labels[idx],
    day: idx,
    nodes: buildNodesAtTime(demoThemes, t, 50),
    stats: {
      toxic_intercepted: Math.round(t * 45),
      value_reinforced: Math.round(t * 32),
      rewiring_pct: Math.round(t * 100),
      avg_session_quality: Math.round(25 + t * 60),
      positive_watchtime_min: Math.round(t * 85),
      total_watchtime_min: Math.round(50 + t * 70),
    },
  }));
}

function generateDemoWatchtime(): WatchtimePoint[] {
  return [
    { day: 0, label: 'Day 1', positive_min: 12, toxic_min: 45, total_min: 57, quality_score: 21 },
    { day: 1, label: 'Day 2', positive_min: 18, toxic_min: 38, total_min: 56, quality_score: 32 },
    { day: 2, label: 'Day 3', positive_min: 25, toxic_min: 32, total_min: 57, quality_score: 44 },
    { day: 3, label: 'Day 4', positive_min: 35, toxic_min: 25, total_min: 60, quality_score: 58 },
    { day: 4, label: 'Day 5', positive_min: 42, toxic_min: 20, total_min: 62, quality_score: 68 },
    { day: 5, label: 'Day 6', positive_min: 50, toxic_min: 15, total_min: 65, quality_score: 77 },
    { day: 6, label: 'Day 7', positive_min: 55, toxic_min: 12, total_min: 67, quality_score: 82 },
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function fetchEvolvingDopamineStats(userId?: string): Promise<EvolvingDopamineStats> {
  if (!userId) {
    userId = localStorage.getItem('fixmyfeed_user_id') || '';
  }
  
  console.log('[DataService] Fetching stats for userId:', userId);
  
  if (userId) {
    try {
      const response = await fetch(`${API_BASE}/stats/${userId}`);
      console.log('[DataService] Response status:', response.status);
      
      if (response.ok) {
        const data: StatsData = await response.json();
        console.log('[DataService] Events count:', data.events?.length);
        
        if (data.events && data.events.length >= 5) {
          const themes = extractThemesFromEvents(data.events);
          console.log('[DataService] Extracted themes:', themes.size);
          
          const snapshots = generateSnapshotsFromEvents(data.events);
          console.log('[DataService] Generated snapshots:', snapshots.length);
          
          if (snapshots.length > 0) {
            console.log('[DataService] Returning REAL data');
            return { user_id: userId, snapshots };
          }
        }
      }
    } catch (err) {
      console.error('[DataService] Error fetching:', err);
    }
  }
  
  console.log('[DataService] Falling back to DEMO data');
  await new Promise(r => setTimeout(r, 200));
  return { user_id: userId || 'demo', snapshots: generateDemoSnapshots() };
}

export async function fetchWatchtimeData(userId?: string): Promise<WatchtimePoint[]> {
  if (!userId) {
    userId = localStorage.getItem('fixmyfeed_user_id') || '';
  }
  
  if (userId) {
    try {
      const response = await fetch(`${API_BASE}/stats/${userId}`);
      if (response.ok) {
        const data: StatsData = await response.json();
        if (data.events && data.events.length >= 3) {
          const watchtime = generateWatchtimeFromEvents(data.events);
          if (watchtime.length > 0) {
            return watchtime;
          }
        }
      }
    } catch (err) {
      console.warn('Could not fetch real watchtime:', err);
    }
  }
  
  await new Promise(r => setTimeout(r, 150));
  return generateDemoWatchtime();
}

// ---------------------------------------------------------------------------
// Interpolation helpers
// ---------------------------------------------------------------------------
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function interpolateSnapshots(
  snapshots: Snapshot[],
  progress: number,
): { nodes: NodeData[]; stats: Snapshot['stats']; label: string } {
  if (snapshots.length === 0) {
    return {
      nodes: [],
      stats: { toxic_intercepted: 0, value_reinforced: 0, rewiring_pct: 0, avg_session_quality: 0, positive_watchtime_min: 0, total_watchtime_min: 0 },
      label: 'No data',
    };
  }
  
  if (snapshots.length === 1) {
    return { nodes: snapshots[0].nodes, stats: snapshots[0].stats, label: snapshots[0].timestamp };
  }
  
  const maxIdx = snapshots.length - 1;
  const raw = progress * maxIdx;
  const lo = Math.floor(raw);
  const hi = Math.min(lo + 1, maxIdx);
  const t = raw - lo;

  const a = snapshots[lo];
  const b = snapshots[hi];

  const nodes: NodeData[] = a.nodes.map((nodeA, i) => {
    const nodeB = b.nodes.find(n => n.id === nodeA.id) || b.nodes[i] || nodeA;
    return {
      id: nodeA.id,
      weight: lerp(nodeA.weight, nodeB.weight, t),
      category: nodeA.category,
      theme_name: nodeA.theme_name,
      description: nodeA.description,
      x: lerp(nodeA.x, nodeB.x, t),
      y: lerp(nodeA.y, nodeB.y, t),
      z: lerp(nodeA.z, nodeB.z, t),
      connections: nodeA.connections,
    };
  });

  const stats: Snapshot['stats'] = {
    toxic_intercepted: Math.round(lerp(a.stats.toxic_intercepted, b.stats.toxic_intercepted, t)),
    value_reinforced: Math.round(lerp(a.stats.value_reinforced, b.stats.value_reinforced, t)),
    rewiring_pct: Math.round(lerp(a.stats.rewiring_pct, b.stats.rewiring_pct, t)),
    avg_session_quality: Math.round(lerp(a.stats.avg_session_quality, b.stats.avg_session_quality, t)),
    positive_watchtime_min: Math.round(lerp(a.stats.positive_watchtime_min, b.stats.positive_watchtime_min, t)),
    total_watchtime_min: Math.round(lerp(a.stats.total_watchtime_min, b.stats.total_watchtime_min, t)),
  };

  const label = t < 0.5 ? a.timestamp : b.timestamp;
  return { nodes, stats, label };
}
