// Types that match the DB rows Edge Functions read/write.
// Kept narrow — only the columns each function actually uses.

export interface UserPreferences {
  user_id: string;
  timezone: string;
  notify_in_app: boolean;
  notify_push: boolean;
  notify_email: boolean;
  expo_push_token: string | null;
  daily_summary_enabled: boolean;
  daily_summary_hour: number;
}

export interface AutomationRule {
  user_id: string;
  rule_key: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
}

export interface RecurringTemplate {
  id: string;
  user_id: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tag_ids: string[];
  subtask_titles: string[];
  frequency: 'daily' | 'weekdays' | 'weekly' | 'monthly';
  day_of_week: number | null;
  day_of_month: number | null;
  hour_local: number;
  is_enabled: boolean;
  last_materialized_at: string | null;
}

export interface NotificationInsert {
  user_id: string;
  kind: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

export interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
  total_time_seconds: number;
  created_at: string;
  updated_at: string;
}
