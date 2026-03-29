const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export interface Insight {
  type: 'win' | 'challenge' | 'recommendation';
  message: string;
}

export interface InsightsResponse {
  summary: string;
  neural_rewiring_score: number;
  top_value_themes: string[];
  top_avoided_themes: string[];
  dopamine_pattern: 'healthy' | 'improving' | 'mixed' | 'concerning' | 'unknown';
  streak_days: number;
  insights: Insight[];
  motivational_message: string;
  error?: string;
}

export interface StatsResponse {
  total_events: number;
  skipped: number;
  liked: number;
  waited: number;
  skip_rate: number;
  engagement_rate: number;
  total_watch_time_min: number;
  positive_watch_time_min: number;
  quality_ratio: number;
  top_categories: [string, number][];
  events: EventRecord[];
  error?: string;
}

export interface EventRecord {
  id: string;
  created_at: string;
  user_id: string;
  action_type: string;
  duration_ms: number;
  caption: string;
  hashtags: string[];
  creator: string;
  category_vector: string[] | null;
  deep_analysis: DeepAnalysis | null;
}

export interface DeepAnalysis {
  themes: string[];
  sentiment_score: number;
  educational_value: number;
  entertainment_value: number;
  dopamine_trigger: string;
  cognitive_load: string;
  content_archetype: string;
  value_alignment_score: number;
  toxicity_markers: string[];
  growth_potential: string;
  brief_insight: string;
}

export async function fetchInsights(
  userId: string,
  interests: string[] = [],
): Promise<InsightsResponse> {
  const interestsParam = interests.length > 0 ? `?interests=${encodeURIComponent(interests.join(','))}` : '';
  
  const response = await fetch(`${API_BASE}/insights/${userId}${interestsParam}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch insights: ${response.status}`);
  }
  
  return response.json();
}

export async function fetchStats(userId: string): Promise<StatsResponse> {
  const response = await fetch(`${API_BASE}/stats/${userId}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch stats: ${response.status}`);
  }
  
  return response.json();
}

export async function checkHealth(): Promise<{
  status: string;
  agents: Record<string, { model: string; provider: string; status: string }>;
  supabase: string;
}> {
  const response = await fetch(`${API_BASE}/health`);
  return response.json();
}
