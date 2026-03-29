export interface NodeData {
  id: string;
  weight: number;           // 0..1 — drives visual radius
  category: 'toxic' | 'value';
  theme_name: string;
  description: string;
  x: number;
  y: number;
  z: number;               // depth axis for 3D perspective
  connections: string[];    // ids of connected nodes
}

export interface Snapshot {
  timestamp: string;
  day: number;
  nodes: NodeData[];
  stats: {
    toxic_intercepted: number;
    value_reinforced: number;
    rewiring_pct: number;
    avg_session_quality: number;   // 0..100
    positive_watchtime_min: number;
    total_watchtime_min: number;
  };
}

export interface EvolvingDopamineStats {
  user_id: string;
  snapshots: Snapshot[];
}

// ---------------------------------------------------------------------------
// Seeded RNG
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Node definitions with richer metadata
// ---------------------------------------------------------------------------
const TOXIC_NODES = [
  { name: 'Rage Bait', desc: 'Content designed to provoke anger for engagement. Hijacks amygdala response.' },
  { name: 'Doomscrolling', desc: 'Infinite negative news loops. Depletes dopamine reserves.' },
  { name: 'Outrage Loops', desc: 'Circular arguments that maximize comment section time.' },
  { name: 'Clickbait Hooks', desc: 'Misleading thumbnails and titles exploiting curiosity gap.' },
  { name: 'Fear Mongering', desc: 'Anxiety-inducing content that keeps you checking back.' },
  { name: 'Hot Takes', desc: 'Shallow provocative opinions optimized for shares.' },
  { name: 'Drama Farming', desc: 'Manufactured interpersonal conflict for views.' },
  { name: 'Engagement Traps', desc: 'Comment-bait questions designed to boost algorithm metrics.' },
  { name: 'Controversy Mining', desc: 'Exploiting divisive topics for maximum reach.' },
  { name: 'Hate Threads', desc: 'Pile-on content that triggers mob participation.' },
  { name: 'Toxic Debates', desc: 'Bad-faith arguments that waste cognitive energy.' },
  { name: 'Shock Content', desc: 'Extreme content that hijacks attention through cortisol.' },
  { name: 'Anxiety Feeds', desc: 'Curated doom that amplifies health/financial/social fear.' },
  { name: 'Virtue Signaling', desc: 'Performative morality for social currency.' },
  { name: 'Cancel Culture', desc: 'Public shaming cycles that reward punitive engagement.' },
];

const VALUE_NODES = [
  { name: 'SQL Optimization', desc: 'Query performance tuning, indexing strategies, execution plans.' },
  { name: 'Tennis Strategy', desc: 'Serve patterns, court positioning, match analysis.' },
  { name: 'Systems Design', desc: 'Distributed systems, scalability patterns, architecture.' },
  { name: 'Deep Work', desc: 'Focus techniques, flow state, distraction elimination.' },
  { name: 'Spaced Repetition', desc: 'Memory retention algorithms, Anki workflows, learning science.' },
  { name: 'Type Theory', desc: 'Type systems, lambda calculus, formal verification.' },
  { name: 'Music Production', desc: 'Sound design, mixing, synthesis, DAW workflows.' },
  { name: 'Rock Climbing', desc: 'Route reading, training protocols, movement technique.' },
  { name: 'Meditation', desc: 'Mindfulness practice, breath work, awareness training.' },
  { name: 'Creative Writing', desc: 'Story structure, prose craft, worldbuilding techniques.' },
  { name: 'Data Viz', desc: 'Visual encoding, chart selection, perception science.' },
  { name: 'Biomechanics', desc: 'Movement analysis, injury prevention, performance optimization.' },
  { name: 'Philosophy', desc: 'Ethics, epistemology, critical thinking frameworks.' },
  { name: 'Open Source', desc: 'Community building, contribution workflows, project governance.' },
  { name: 'Cooking Techniques', desc: 'Flavor science, heat control, knife skills, fermentation.' },
];

// Connection groups — nodes that naturally relate
const VALUE_CLUSTERS: string[][] = [
  ['value-0', 'value-2', 'value-5', 'value-13'],  // tech/systems
  ['value-3', 'value-4', 'value-8', 'value-12'],   // focus/mind
  ['value-1', 'value-7', 'value-11'],               // physical
  ['value-6', 'value-9', 'value-10', 'value-14'],   // creative
];

const TOXIC_CLUSTERS: string[][] = [
  ['toxic-0', 'toxic-2', 'toxic-9', 'toxic-10'],
  ['toxic-1', 'toxic-4', 'toxic-12'],
  ['toxic-3', 'toxic-5', 'toxic-7'],
  ['toxic-6', 'toxic-8', 'toxic-11', 'toxic-13', 'toxic-14'],
];

function getConnections(id: string): string[] {
  const clusters = [...VALUE_CLUSTERS, ...TOXIC_CLUSTERS];
  const conns: string[] = [];
  for (const cluster of clusters) {
    if (cluster.includes(id)) {
      for (const peer of cluster) {
        if (peer !== id) conns.push(peer);
      }
    }
  }
  return conns;
}

function buildNodes(day: number, maxDay: number): NodeData[] {
  const t = day / maxDay;
  const nodes: NodeData[] = [];

  TOXIC_NODES.forEach((def, i) => {
    const rng = seededRandom(`toxic-${i}`);
    const baseWeight = 0.5 + rng() * 0.5;
    const weight = Math.max(0.05, baseWeight * (1 - t * 0.9));

    // Start mixed in, drift outward to edges
    const angle = (i / TOXIC_NODES.length) * Math.PI * 2 + rng() * 0.4;
    const radius = 0.15 + t * 0.35 + rng() * 0.05;

    nodes.push({
      id: `toxic-${i}`,
      weight,
      category: 'toxic',
      theme_name: def.name,
      description: def.desc,
      x: 0.5 + Math.cos(angle) * radius,
      y: 0.5 + Math.sin(angle) * radius,
      z: (rng() - 0.5) * 0.6,
      connections: getConnections(`toxic-${i}`),
    });
  });

  VALUE_NODES.forEach((def, i) => {
    const rng = seededRandom(`value-${i}`);
    const baseWeight = 0.1 + rng() * 0.2;
    const weight = baseWeight + t * (0.85 - baseWeight);

    // Start scattered, cluster to center
    const cluster = i % 4;
    const clusterAngle = (cluster / 4) * Math.PI * 2 + 0.5;
    const spread = 0.3 * (1 - t) + 0.05;
    const angle = clusterAngle + (rng() - 0.5) * spread * 3;
    const radius = 0.32 * (1 - t * 0.7) + rng() * 0.04;

    nodes.push({
      id: `value-${i}`,
      weight,
      category: 'value',
      theme_name: def.name,
      description: def.desc,
      x: 0.5 + Math.cos(angle) * radius,
      y: 0.5 + Math.sin(angle) * radius,
      z: (rng() - 0.5) * 0.5,
      connections: getConnections(`value-${i}`),
    });
  });

  return nodes;
}

// ---------------------------------------------------------------------------
// Watchtime / attention analytics data
// ---------------------------------------------------------------------------
export interface WatchtimePoint {
  day: number;
  label: string;
  positive_min: number;
  toxic_min: number;
  total_min: number;
  quality_score: number;  // 0..100
}

function generateWatchtimeData(): WatchtimePoint[] {
  const points: WatchtimePoint[] = [];
  const days = [0, 1, 2, 3, 5, 7, 10, 14, 18, 21, 25, 30];
  const labels = ['D0', 'D1', 'D2', 'D3', 'D5', 'W1', 'D10', 'W2', 'D18', 'W3', 'D25', 'M1'];

  days.forEach((day, i) => {
    const t = day / 30;
    const rng = seededRandom(`wt-${day}`);
    const jitter = (rng() - 0.5) * 8;

    const total = 120 + t * 30 + jitter;
    const toxicRatio = Math.max(0.05, 0.65 * (1 - t * 1.1));
    const toxic_min = Math.round(total * toxicRatio);
    const positive_min = Math.round(total - toxic_min);

    points.push({
      day,
      label: labels[i],
      positive_min,
      toxic_min,
      total_min: Math.round(total),
      quality_score: Math.min(100, Math.round(20 + t * 75 + jitter * 0.3)),
    });
  });

  return points;
}

// ---------------------------------------------------------------------------
// Generate snapshots
// ---------------------------------------------------------------------------
function generateSnapshots(): Snapshot[] {
  const days = [0, 1, 3, 7, 14, 21, 30];
  const labels = ['Day 0', 'Day 1', 'Day 3', 'Week 1', 'Week 2', 'Week 3', 'Month 1'];
  const maxDay = 30;

  return days.map((day, i) => {
    const t = day / maxDay;
    const rng = seededRandom(`snap-${day}`);
    return {
      timestamp: labels[i],
      day,
      nodes: buildNodes(day, maxDay),
      stats: {
        toxic_intercepted: Math.round(day * 12 + day * day * 0.3),
        value_reinforced: Math.round(day * 8 + day * day * 0.5),
        rewiring_pct: Math.min(100, Math.round(t * 100)),
        avg_session_quality: Math.min(100, Math.round(20 + t * 72 + (rng() - 0.5) * 6)),
        positive_watchtime_min: Math.round(45 + t * 80),
        total_watchtime_min: Math.round(120 + t * 30),
      },
    };
  });
}

const MOCK_DATA: EvolvingDopamineStats = {
  user_id: 'neuro-shield-demo',
  snapshots: generateSnapshots(),
};

const MOCK_WATCHTIME = generateWatchtimeData();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function fetchEvolvingDopamineStats(): Promise<EvolvingDopamineStats> {
  await new Promise((r) => setTimeout(r, 300));
  return structuredClone(MOCK_DATA);
}

export async function fetchWatchtimeData(): Promise<WatchtimePoint[]> {
  await new Promise((r) => setTimeout(r, 200));
  return structuredClone(MOCK_WATCHTIME);
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
  const maxIdx = snapshots.length - 1;
  const raw = progress * maxIdx;
  const lo = Math.floor(raw);
  const hi = Math.min(lo + 1, maxIdx);
  const t = raw - lo;

  const a = snapshots[lo];
  const b = snapshots[hi];

  const nodes: NodeData[] = a.nodes.map((nodeA, i) => {
    const nodeB = b.nodes[i];
    return {
      id: nodeA.id,
      weight: lerp(nodeA.weight, nodeB.weight, t),
      category: nodeA.category,
      theme_name: nodeA.theme_name,
      description: nodeA.description,
      x: lerp(nodeA.x, nodeB.x, t),
      y: lerp(nodeA.y, nodeB.y, t),
      z: lerp(nodeA.z ?? 0, nodeB.z ?? 0, t),
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
