import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import type { UserPrefs } from '@/types';

const RULE_LABELS: Record<string, { label: string; desc: string }> = {
  due_soon: {
    label: 'Due soon reminder',
    desc: 'Notify me 24h before a task is due.',
  },
  overdue: {
    label: 'Overdue reminder',
    desc: 'Notify me once when a task passes its due date.',
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

function Toggle({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc?: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#1a1a2e' }}>
          {label}
        </Text>
        {desc && (
          <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
            {desc}
          </Text>
        )}
      </View>
      <Pressable
        onPress={() => onChange(!checked)}
        style={{
          width: 44,
          height: 24,
          borderRadius: 12,
          backgroundColor: checked ? '#8b5cf6' : '#d1d5db',
          justifyContent: 'center',
          paddingHorizontal: 2,
          marginTop: 2,
        }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: '#fff',
            transform: [{ translateX: checked ? 20 : 0 }],
          }}
        />
      </Pressable>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 18,
        marginBottom: 12,
        marginHorizontal: 16,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: '800',
          color: '#1a1a2e',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function SettingsScreen() {
  const prefs = useStore((s) => s.prefs);
  const rules = useStore((s) => s.rules);
  const updatePrefs = useStore((s) => s.updatePrefs);
  const toggleRule = useStore((s) => s.toggleRule);

  if (!prefs) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 40 }}>
        <Text style={{ color: '#aaa', fontSize: 13 }}>Loading settings…</Text>
      </View>
    );
  }

  const setPref = <K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) =>
    updatePrefs({ [key]: value } as Partial<UserPrefs>);

  return (
    <ScrollView contentContainerStyle={{ paddingVertical: 12, paddingBottom: 80 }}>
      <Section title="Notifications">
        <Toggle
          label="In-app notifications"
          desc="🔔 bell with realtime updates."
          checked={prefs.notify_in_app}
          onChange={(v) => setPref('notify_in_app', v)}
        />
        <Toggle
          label="Push notifications"
          desc="Alerts on your device when the app is closed."
          checked={prefs.notify_push}
          onChange={(v) => setPref('notify_push', v)}
        />
        <Toggle
          label="Email notifications"
          desc="Email the same updates to your account address."
          checked={prefs.notify_email}
          onChange={(v) => setPref('notify_email', v)}
        />
      </Section>

      <Section title="Daily summary">
        <Toggle
          label="Send me a morning briefing"
          desc="A Claude-written recap of yesterday + today's priorities."
          checked={prefs.daily_summary_enabled}
          onChange={(v) => setPref('daily_summary_enabled', v)}
        />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 10,
            borderTopWidth: 1,
            borderTopColor: '#eee',
            marginTop: 6,
          }}
        >
          <Text style={{ fontSize: 13, color: '#555', flex: 1 }}>
            Timezone
          </Text>
          <TextInput
            value={prefs.timezone}
            onChangeText={(v) => setPref('timezone', v)}
            placeholder="Asia/Kolkata"
            style={{
              borderWidth: 1.5,
              borderColor: '#e5e7eb',
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 6,
              fontSize: 13,
              minWidth: 160,
              textAlign: 'right',
            }}
          />
        </View>
      </Section>

      <Section title="Automations">
        {rules.length === 0 ? (
          <Text style={{ fontSize: 13, color: '#888' }}>Loading rules…</Text>
        ) : (
          rules
            .filter((r) => RULE_LABELS[r.rule_key])
            .map((r) => {
              const meta = RULE_LABELS[r.rule_key];
              return (
                <Toggle
                  key={r.rule_key}
                  label={meta.label}
                  desc={meta.desc}
                  checked={r.is_enabled}
                  onChange={(v) => toggleRule(r.rule_key, v)}
                />
              );
            })
        )}
      </Section>

      <Section title="AI suggestions">
        <Toggle
          label="Auto-generate subtasks"
          desc="Suggest subtasks for new tasks automatically."
          checked={prefs.ai_auto_subtasks}
          onChange={(v) => setPref('ai_auto_subtasks', v)}
        />
        <Toggle
          label="Auto-suggest tags"
          desc="Match task titles against existing tags."
          checked={prefs.ai_auto_tags}
          onChange={(v) => setPref('ai_auto_tags', v)}
        />
        <Toggle
          label="Auto-suggest priority"
          desc="Infer priority from task content."
          checked={prefs.ai_auto_priority}
          onChange={(v) => setPref('ai_auto_priority', v)}
        />
      </Section>

      <Section title="Account">
        <Pressable
          onPress={() => supabase.auth.signOut()}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 8,
            borderWidth: 1.5,
            borderColor: '#fecaca',
            backgroundColor: '#fef2f2',
            alignSelf: 'flex-start',
            marginTop: 4,
          }}
        >
          <Text style={{ color: '#dc2626', fontSize: 13, fontWeight: '700' }}>
            Sign out
          </Text>
        </Pressable>
      </Section>
    </ScrollView>
  );
}
