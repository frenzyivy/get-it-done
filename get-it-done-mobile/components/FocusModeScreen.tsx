import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  type AppStateStatus,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useStore } from '@/lib/store';
import { useLiveTimers } from '@/lib/useLiveTimer';
import { fmt } from '@/lib/utils';
import type { FocusMode } from '@/types';

// New-spec-1 Feature 5 (mobile) — dedicated deep-work screen.
// Mounts at the root via _layout. Shown when `focusSessionId` is set.
// Uses an opaque Modal (the mobile equivalent of the web Fullscreen API —
// on phones the screen is already the viewport). Drift detection uses
// AppState — the user backgrounding the app in App Focus or Strict mode
// logs a drift_events entry.

const MODES: { id: FocusMode; label: string; sub: string }[] = [
  { id: 'open', label: 'Open', sub: 'No restrictions' },
  { id: 'call_focus', label: 'Call focus', sub: 'App sounds muted' },
  { id: 'app_focus', label: 'App focus', sub: 'Backgrounding logs drift' },
  { id: 'strict', label: 'Strict zone', sub: 'Drift + confirm to exit' },
];

export function FocusModeScreen() {
  const focusSessionId = useStore((s) => s.focusSessionId);
  const activeSessions = useStore((s) => s.activeSessions);
  const tasks = useStore((s) => s.tasks);
  const prefs = useStore((s) => s.prefs);
  const stopSession = useStore((s) => s.stopSession);
  const pauseSession = useStore((s) => s.pauseSession);
  const updateSessionMode = useStore((s) => s.updateSessionMode);
  const appendDriftEvent = useStore((s) => s.appendDriftEvent);
  const closeFocusMode = useStore((s) => s.closeFocusMode);
  const openFocusMode = useStore((s) => s.openFocusMode);

  const elapsedMap = useLiveTimers();

  const session = useMemo(
    () => activeSessions.find((s) => s.id === focusSessionId) ?? null,
    [activeSessions, focusSessionId],
  );

  const driftStartRef = useRef<number | null>(null);
  const [postDrift, setPostDrift] = useState<{ durationSeconds: number } | null>(
    null,
  );
  const [modePickerOpen, setModePickerOpen] = useState(false);

  const task = session ? tasks.find((t) => t.id === session.task_id) ?? null : null;
  const subtask = session && task
    ? task.subtasks.find((x) => x.id === session.subtask_id) ?? null
    : null;

  const isGatedMode =
    session?.mode === 'app_focus' || session?.mode === 'strict';

  // --- Drift detection via AppState ----------------------------------------
  useEffect(() => {
    if (!session || !isGatedMode) return;
    const onChange = (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        if (driftStartRef.current == null) driftStartRef.current = Date.now();
      } else if (state === 'active' && driftStartRef.current) {
        const startMs = driftStartRef.current;
        const endMs = Date.now();
        driftStartRef.current = null;
        const dur = Math.max(0, Math.floor((endMs - startMs) / 1000));
        if (dur > 0) {
          void appendDriftEvent(session.id, {
            started_at: new Date(startMs).toISOString(),
            ended_at: new Date(endMs).toISOString(),
            duration_seconds: dur,
          });
          setPostDrift({ durationSeconds: dur });
          setTimeout(() => setPostDrift(null), 5000);
        }
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [session, isGatedMode, appendDriftEvent]);

  // --- Voice cue -----------------------------------------------------------
  // Mobile voice cue is deferred until expo-speech is added as a dependency.
  // For now we silently no-op; the web build does play the TTS prompt.
  const announcedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session) return;
    if (session.mode === 'open') return;
    const key = `${session.id}:${session.mode}`;
    announcedRef.current = key;
  }, [session]);
  void announcedRef;

  const handleMinimize = useCallback(() => {
    closeFocusMode();
  }, [closeFocusMode]);

  const handleStop = useCallback(() => {
    if (!session) return;
    const runStop = () => void stopSession(session.id);
    if (session.mode === 'strict') {
      Alert.alert(
        'Exit Strict Zone?',
        'Stopping a Strict Zone session will be recorded. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Stop', style: 'destructive', onPress: runStop },
        ],
      );
      return;
    }
    runStop();
  }, [session, stopSession]);

  const handlePause = useCallback(() => {
    if (!session) return;
    void pauseSession(session.id);
  }, [session, pauseSession]);

  if (!session) return null;

  const elapsed = elapsedMap[session.id] ?? 0;
  const otherActive = activeSessions.filter((s) => s.id !== session.id);

  const bg =
    session.mode === 'strict'
      ? '#3b0764'
      : session.mode === 'app_focus'
        ? '#4c1d95'
        : session.mode === 'call_focus'
          ? '#312e81'
          : '#1e293b';

  return (
    <Modal
      visible
      animationType="fade"
      onRequestClose={() => {
        if (session.mode === 'strict') {
          Alert.alert(
            'Exit Strict Zone?',
            'This will be recorded as a drift.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Exit', style: 'destructive', onPress: handleMinimize },
            ],
          );
        } else {
          handleMinimize();
        }
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: bg,
          paddingHorizontal: 24,
          paddingVertical: 40,
          justifyContent: 'space-between',
        }}
      >
        {/* Top — pill */}
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Pressable
            onPress={() => {
              if (otherActive.length === 0) return;
              const idx = activeSessions.findIndex((s) => s.id === session.id);
              const next = activeSessions[(idx + 1) % activeSessions.length];
              openFocusMode(next.id);
            }}
            style={{
              backgroundColor: 'rgba(255,255,255,0.1)',
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderRadius: 100,
              maxWidth: '95%',
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontSize: 14,
                fontWeight: '700',
                textAlign: 'center',
              }}
              numberOfLines={1}
            >
              {task?.title ?? 'Tracking…'}
              {subtask ? ` → ${subtask.title}` : ''}
            </Text>
            {otherActive.length > 0 && (
              <Text
                style={{
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: 11,
                  textAlign: 'center',
                  marginTop: 2,
                }}
              >
                {otherActive.length + 1} running — tap to switch
              </Text>
            )}
          </Pressable>
          {postDrift && (
            <View
              style={{
                backgroundColor: '#dc2626',
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 999,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                ⚡ You drifted for {postDrift.durationSeconds}s — logged.
              </Text>
            </View>
          )}
        </View>

        {/* Middle — time + controls */}
        <View style={{ alignItems: 'center', gap: 32 }}>
          <Text
            style={{
              color: '#fff',
              fontSize: 88,
              fontWeight: '800',
              fontVariant: ['tabular-nums'],
              letterSpacing: -4,
            }}
          >
            {fmt(elapsed)}
          </Text>
          <View style={{ flexDirection: 'row', gap: 24 }}>
            <ControlButton icon="⏸" label="Pause" onPress={handlePause} />
            <ControlButton
              icon="▶"
              label="Running"
              onPress={handleMinimize}
              disabled
            />
            <ControlButton icon="⏹" label="Stop" onPress={handleStop} danger />
          </View>
        </View>

        {/* Bottom — mode selector + minimize */}
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Pressable
            onPress={() => setModePickerOpen((v) => !v)}
            style={{
              backgroundColor: 'rgba(255,255,255,0.1)',
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderRadius: 100,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
              Mode · {labelForMode(session.mode)} ▾
            </Text>
          </Pressable>
          {modePickerOpen && (
            <View
              style={{
                backgroundColor: '#fff',
                borderRadius: 14,
                overflow: 'hidden',
                width: '100%',
              }}
            >
              {MODES.map((m, idx) => (
                <Pressable
                  key={m.id}
                  onPress={() => {
                    setModePickerOpen(false);
                    void updateSessionMode(session.id, m.id);
                  }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderTopWidth: idx > 0 ? 1 : 0,
                    borderTopColor: '#eee',
                    backgroundColor:
                      session.mode === m.id ? 'rgba(139,92,246,0.12)' : '#fff',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#1a1a2e' }}>
                    {m.label}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#666', marginTop: 1 }}>
                    {m.sub}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <Pressable onPress={handleMinimize} hitSlop={8}>
            <Text
              style={{
                color: 'rgba(255,255,255,0.7)',
                fontSize: 12,
                fontWeight: '700',
                textDecorationLine: 'underline',
              }}
            >
              Minimize (timer keeps running)
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ControlButton({
  icon,
  label,
  onPress,
  danger,
  disabled,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        width: 76,
        height: 76,
        borderRadius: 38,
        backgroundColor: danger ? '#dc2626' : 'rgba(255,255,255,0.14)',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 28 }}>{icon}</Text>
      <Text
        style={{
          color: '#fff',
          fontSize: 10,
          fontWeight: '700',
          opacity: 0.8,
          marginTop: 2,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function labelForMode(mode: FocusMode | string): string {
  switch (mode) {
    case 'call_focus':
      return 'Call focus';
    case 'app_focus':
      return 'App focus';
    case 'strict':
      return 'Strict zone';
    case 'open':
      return 'Open';
    default:
      return mode;
  }
}
