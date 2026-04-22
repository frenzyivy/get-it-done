import { useEffect } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useStore } from '@/lib/store';
import { useUI } from '@/lib/ui-context';
import { supabase } from '@/lib/supabase';
import { M3Switch } from '@/components/M3Switch';
import { useAppTheme } from '@/lib/theme-context';
import { themes, type as M3Type, type ThemeName } from '@/lib/theme';
import type { FocusMode, UserPrefs } from '@/types';

const FOCUS_MODE_LABELS: Record<FocusMode, string> = {
  open: 'Just track',
  call_focus: 'Call focus',
  app_focus: 'Focus',
  strict: 'No mercy',
};

const FOCUS_MODE_CYCLE: FocusMode[] = ['open', 'app_focus', 'strict'];

const RULE_LABELS: Record<string, { label: string; desc: string }> = {
  due_soon: {
    label: 'Due-soon reminder',
    desc: 'Notify 24 hours before a task is due.',
  },
  overdue: {
    label: 'Overdue reminder',
    desc: 'Notify once when a task passes its due date.',
  },
  overdue_escalate: {
    label: 'Auto-escalate overdue',
    desc: "Bump priority after 48h overdue. Won't touch urgent tasks.",
  },
  recurring: {
    label: 'Recurring tasks',
    desc: 'Auto-create tasks from recurring templates on schedule.',
  },
  stale_todo: {
    label: 'Stale to-do nudge',
    desc: 'Nudge me about tasks sitting in To Do for 7+ days.',
  },
  subtask_nudge: {
    label: 'Subtask nudge',
    desc: 'Nudge me about subtasks with no progress in 3+ days.',
  },
  completion_celebrate: {
    label: 'Celebrate completions',
    desc: 'Send a little win notification when I finish a task.',
  },
};

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          ...M3Type.titleSmall,
          color: c.primary,
          paddingHorizontal: 4,
        }}
      >
        {title}
      </Text>
      <View
        style={{
          backgroundColor: c.elevation.level1,
          borderRadius: 16,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: c.outlineVariant,
        }}
      >
        {children}
      </View>
    </View>
  );
}

function Row({
  title,
  desc,
  trailing,
  first,
}: {
  title: string;
  desc?: string;
  trailing?: React.ReactNode;
  first?: boolean;
}) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <View>
      {!first && <View style={{ height: 1, backgroundColor: c.outlineVariant }} />}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ ...M3Type.bodyLarge, color: c.onSurface }}>{title}</Text>
          {desc && (
            <Text
              style={{
                ...M3Type.bodyMedium,
                color: c.onSurfaceVariant,
                marginTop: 2,
              }}
            >
              {desc}
            </Text>
          )}
        </View>
        {trailing}
      </View>
    </View>
  );
}

function ThemePicker() {
  const theme = useTheme();
  const c = theme.colors;
  const { themeName, setThemeName } = useAppTheme();
  const options: { key: ThemeName; label: string }[] = [
    { key: 'focus', label: 'Focus' },
    { key: 'momentum', label: 'Momentum' },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {options.map(({ key, label }) => {
        const active = themeName === key;
        const swatch = themes[key].colors;
        return (
          <Pressable
            key={key}
            onPress={() => setThemeName(key)}
            accessibilityRole="button"
            accessibilityLabel={`${label} theme`}
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: active ? c.primary : c.outlineVariant,
              backgroundColor: swatch.background,
              padding: 12,
              gap: 8,
            }}
          >
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  backgroundColor: swatch.primary,
                }}
              />
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  backgroundColor: swatch.primaryContainer,
                }}
              />
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  backgroundColor: swatch.tertiaryContainer,
                }}
              />
            </View>
            <Text
              style={{
                ...M3Type.labelLarge,
                color: swatch.onBackground,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SettingsScreen() {
  const theme = useTheme();
  const c = theme.colors;
  const prefs = useStore((s) => s.prefs);
  const rules = useStore((s) => s.rules);
  const tasks = useStore((s) => s.tasks);
  const updatePrefs = useStore((s) => s.updatePrefs);
  const toggleRule = useStore((s) => s.toggleRule);
  const { openFocusLockPicker, openRecurringTemplates } = useUI();
  const recurringTemplates = useStore((s) => s.recurringTemplates);
  const fetchRecurringTemplates = useStore((s) => s.fetchRecurringTemplates);

  useEffect(() => {
    void fetchRecurringTemplates();
  }, [fetchRecurringTemplates]);

  const handleStartFocusFromSettings = () => {
    const today = new Date().toISOString().slice(0, 10);
    const pick =
      tasks.find(
        (t) => t.planned_for_date === today && t.status !== 'done',
      ) ??
      tasks.find((t) => t.status === 'in_progress') ??
      tasks.find((t) => t.status === 'todo');
    if (pick) openFocusLockPicker(pick.id);
  };

  const handleCycleDefaultMode = () => {
    if (!prefs) return;
    const idx = FOCUS_MODE_CYCLE.indexOf(prefs.default_timer_mode);
    const next = FOCUS_MODE_CYCLE[(idx + 1) % FOCUS_MODE_CYCLE.length];
    updatePrefs({ default_timer_mode: next });
  };

  if (!prefs) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 40 }}>
        <Text style={{ ...M3Type.bodyMedium, color: c.onSurfaceVariant }}>
          Loading settings…
        </Text>
      </View>
    );
  }

  const setPref = <K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) =>
    updatePrefs({ [key]: value } as Partial<UserPrefs>);

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 140,
        gap: 20,
      }}
    >
      <SectionCard title="Appearance">
        <View style={{ padding: 16, gap: 8 }}>
          <Text style={{ ...M3Type.bodyMedium, color: c.onSurfaceVariant }}>
            Two curated directions.
          </Text>
          <ThemePicker />
        </View>
      </SectionCard>

      <SectionCard title="Notifications">
        <Row
          first
          title="In-app"
          desc="Realtime updates inside the app."
          trailing={
            <M3Switch
              value={prefs.notify_in_app}
              onValueChange={(v) => setPref('notify_in_app', v)}
              accessibilityLabel="In-app notifications"
            />
          }
        />
        <Row
          title="Push"
          desc="Alerts on your device when the app is closed."
          trailing={
            <M3Switch
              value={prefs.notify_push}
              onValueChange={(v) => setPref('notify_push', v)}
              accessibilityLabel="Push notifications"
            />
          }
        />
        <Row
          title="Email"
          desc="Mirror the same updates to your inbox."
          trailing={
            <M3Switch
              value={prefs.notify_email}
              onValueChange={(v) => setPref('notify_email', v)}
              accessibilityLabel="Email notifications"
            />
          }
        />
      </SectionCard>

      <SectionCard title="Focus sessions">
        <Row
          first
          title="Start focus session"
          desc={
            tasks.length === 0
              ? 'Add a task first to start a focus session.'
              : 'Pick a task, a lock level, and a duration.'
          }
          trailing={
            <Pressable
              onPress={handleStartFocusFromSettings}
              disabled={tasks.length === 0}
              accessibilityRole="button"
              style={({ pressed }) => ({
                height: 36,
                paddingHorizontal: 14,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? c.primaryContainer : c.primary,
                opacity: tasks.length === 0 ? 0.5 : 1,
              })}
            >
              <Text style={{ ...M3Type.labelLarge, color: c.onPrimary }}>
                Start
              </Text>
            </Pressable>
          }
        />
        <Row
          title="Default lock level"
          desc="What new timers start as. Tap to cycle."
          trailing={
            <Pressable
              onPress={handleCycleDefaultMode}
              accessibilityRole="button"
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: pressed ? c.surfaceVariant : 'transparent',
              })}
            >
              <Text
                style={{
                  ...M3Type.bodyMedium,
                  color: c.primary,
                  fontWeight: '700',
                }}
              >
                {FOCUS_MODE_LABELS[prefs.default_timer_mode] ?? prefs.default_timer_mode}
              </Text>
            </Pressable>
          }
        />
        <Row
          title="Announce focus start"
          desc="Play a short voice cue when a focus session begins (web)."
          trailing={
            <M3Switch
              value={prefs.announce_focus_sessions}
              onValueChange={(v) => setPref('announce_focus_sessions', v)}
              accessibilityLabel="Announce focus start"
            />
          }
        />
      </SectionCard>

      <SectionCard title="Briefings">
        <Row
          first
          title="Morning briefing"
          desc="A short AI recap of yesterday and today's priorities."
          trailing={
            <M3Switch
              value={prefs.daily_summary_enabled}
              onValueChange={(v) => setPref('daily_summary_enabled', v)}
              accessibilityLabel="Morning briefing"
            />
          }
        />
        <Row
          title="Timezone"
          trailing={
            <TextInput
              value={prefs.timezone}
              onChangeText={(v) => setPref('timezone', v)}
              placeholder="Asia/Kolkata"
              placeholderTextColor={c.onSurfaceVariant}
              style={{
                ...M3Type.bodyMedium,
                color: c.onSurface,
                fontVariant: ['tabular-nums'],
                minWidth: 140,
                textAlign: 'right',
              }}
            />
          }
        />
      </SectionCard>

      <SectionCard title="Automations">
        {rules.length === 0 ? (
          <View style={{ padding: 16 }}>
            <Text style={{ ...M3Type.bodyMedium, color: c.onSurfaceVariant }}>
              Loading rules…
            </Text>
          </View>
        ) : (
          rules
            .filter((r) => RULE_LABELS[r.rule_key])
            .map((r, i) => {
              const meta = RULE_LABELS[r.rule_key];
              return (
                <Row
                  key={r.rule_key}
                  first={i === 0}
                  title={meta.label}
                  desc={meta.desc}
                  trailing={
                    <M3Switch
                      value={r.is_enabled}
                      onValueChange={(v) => toggleRule(r.rule_key, v)}
                      accessibilityLabel={meta.label}
                    />
                  }
                />
              );
            })
        )}
      </SectionCard>

      <SectionCard title="Recurring templates">
        <Row
          first
          title="Manage templates"
          desc={
            recurringTemplates.length === 0
              ? 'Create blueprints that turn into tasks on a schedule.'
              : `${recurringTemplates.length} template${recurringTemplates.length === 1 ? '' : 's'}. ${recurringTemplates.filter((t) => t.is_enabled).length} active.`
          }
          trailing={
            <Pressable
              onPress={openRecurringTemplates}
              accessibilityRole="button"
              style={({ pressed }) => ({
                height: 36,
                paddingHorizontal: 14,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? c.primaryContainer : c.primary,
              })}
            >
              <Text style={{ ...M3Type.labelLarge, color: c.onPrimary }}>
                Open
              </Text>
            </Pressable>
          }
        />
      </SectionCard>

      <SectionCard title="AI suggestions">
        <Row
          first
          title="Auto-generate subtasks"
          desc="Suggest subtasks for new tasks automatically."
          trailing={
            <M3Switch
              value={prefs.ai_auto_subtasks}
              onValueChange={(v) => setPref('ai_auto_subtasks', v)}
              accessibilityLabel="Auto-generate subtasks"
            />
          }
        />
        <Row
          title="Auto-suggest tags"
          desc="Match task titles against existing tags."
          trailing={
            <M3Switch
              value={prefs.ai_auto_tags}
              onValueChange={(v) => setPref('ai_auto_tags', v)}
              accessibilityLabel="Auto-suggest tags"
            />
          }
        />
        <Row
          title="Auto-suggest priority"
          desc="Infer priority from task content."
          trailing={
            <M3Switch
              value={prefs.ai_auto_priority}
              onValueChange={(v) => setPref('ai_auto_priority', v)}
              accessibilityLabel="Auto-suggest priority"
            />
          }
        />
      </SectionCard>

      <SectionCard title="Account">
        <View style={{ padding: 16 }}>
          <Pressable
            onPress={() => supabase.auth.signOut()}
            accessibilityRole="button"
            style={({ pressed }) => ({
              height: 40,
              paddingHorizontal: 16,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: c.error,
              alignSelf: 'flex-start',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? c.errorContainer : 'transparent',
            })}
          >
            <Text style={{ ...M3Type.labelLarge, color: c.error }}>
              Sign out
            </Text>
          </Pressable>
        </View>
      </SectionCard>
    </ScrollView>
  );
}
