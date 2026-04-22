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
import {
  notifyFocusSessionBroken,
  notifyFocusSessionComplete,
} from '@/lib/local-notifications';
import { MODE_TO_FOCUS_LOCK } from '@/types';
import { BreakingOutModal } from './BreakingOutModal';

// Screen 2 of the Focus Lock flow — "Focus Mode Active".
// Mounted globally in (tabs)/_layout; becomes visible whenever
// focusSessionId is set. Countdown if planned_duration_seconds is present,
// open-ended elapsed otherwise.
//
// Controls by lock level:
//   Just Track / Focus — Pause + Stop (Stop just ends cleanly)
//   No Mercy (Strict)  — Pause + Stop early, where Stop early launches
//                        Screen 3 (BreakingOutModal) with a 4s delay.
//
// Drift detection (AppState → background/inactive) logs drift_events for
// Focus and No Mercy modes. On No Mercy the drift immediately triggers
// Screen 3.

export function FocusModeScreen() {
  const focusSessionId = useStore((s) => s.focusSessionId);
  const activeSessions = useStore((s) => s.activeSessions);
  const tasks = useStore((s) => s.tasks);
  const profile = useStore((s) => s.profileV2);

  const stopSession = useStore((s) => s.stopSession);
  const pauseSession = useStore((s) => s.pauseSession);
  const completeSession = useStore((s) => s.completeSession);
  const appendDriftEvent = useStore((s) => s.appendDriftEvent);
  const closeFocusMode = useStore((s) => s.closeFocusMode);
  const openFocusMode = useStore((s) => s.openFocusMode);

  const elapsedMap = useLiveTimers();

  const session = useMemo(
    () => activeSessions.find((s) => s.id === focusSessionId) ?? null,
    [activeSessions, focusSessionId],
  );

  const driftStartRef = useRef<number | null>(null);
  const [breakingOutOpen, setBreakingOutOpen] = useState(false);
  const completedRef = useRef<string | null>(null);

  const task = session ? tasks.find((t) => t.id === session.task_id) ?? null : null;
  const subtask = session && task
    ? task.subtasks.find((x) => x.id === session.subtask_id) ?? null
    : null;

  const lockLevel = session ? MODE_TO_FOCUS_LOCK[session.mode as keyof typeof MODE_TO_FOCUS_LOCK] : null;
  const isStrict = session?.mode === 'strict';
  const isGatedMode = session?.mode === 'app_focus' || session?.mode === 'strict';

  // Drift detection.
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
          // No Mercy — backgrounding is itself a break attempt.
          if (session.mode === 'strict') setBreakingOutOpen(true);
        }
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [session, isGatedMode, appendDriftEvent]);

  // Countdown completion — planned duration reached.
  const elapsed = session ? elapsedMap[session.id] ?? 0 : 0;
  const planned = session?.planned_duration_seconds ?? null;
  const remaining = planned !== null ? Math.max(0, planned - elapsed) : null;
  const progress = planned ? Math.min(1, elapsed / planned) : 0;

  useEffect(() => {
    if (!session || planned === null) return;
    if (remaining !== 0) return;
    if (completedRef.current === session.id) return;
    completedRef.current = session.id;
    const title = task?.title ?? null;
    const mins = Math.round(planned / 60);
    void (async () => {
      await completeSession(session.id);
      await notifyFocusSessionComplete(title, mins);
    })();
  }, [session, planned, remaining, completeSession, task]);

  const handleMinimize = useCallback(() => {
    closeFocusMode();
  }, [closeFocusMode]);

  const handleStop = useCallback(() => {
    if (!session) return;
    if (isStrict) {
      // Screen 3 flow — captures reason and writes broken=true.
      setBreakingOutOpen(true);
      return;
    }
    // Just Track / Focus — confirm, then end cleanly.
    Alert.alert('End session?', 'Your elapsed time will be saved.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop',
        style: 'destructive',
        onPress: () => void stopSession(session.id),
      },
    ]);
  }, [session, isStrict, stopSession]);

  const handlePause = useCallback(() => {
    if (!session) return;
    void pauseSession(session.id);
  }, [session, pauseSession]);

  const handleConfirmBreak = useCallback(
    async (reason: string) => {
      if (!session) return;
      await useStore.getState().markSessionBroken(session.id, reason);
      await notifyFocusSessionBroken();
      setBreakingOutOpen(false);
    },
    [session],
  );

  if (!session) return null;

  const otherActive = activeSessions.filter((s) => s.id !== session.id);
  const streak = profile?.current_streak ?? 0;
  const driftCount = session.drift_events?.length ?? 0;

  const bg =
    session.mode === 'strict'
      ? '#2A1F6E'
      : session.mode === 'app_focus'
        ? '#3B2F8E'
        : session.mode === 'call_focus'
          ? '#312e81'
          : '#1e293b';

  const bannerLabel =
    lockLevel === 'no_mercy'
      ? 'FOCUS MODE'
      : lockLevel === 'focus'
        ? 'FOCUS MODE'
        : 'TRACKING';

  return (
    <>
      <Modal
        visible
        animationType="fade"
        onRequestClose={() => {
          if (isStrict) {
            setBreakingOutOpen(true);
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
          {/* Top — status bar + task pill */}
          <View style={{ alignItems: 'center', gap: 12 }}>
            <View
              style={{
                flexDirection: 'row',
                alignSelf: 'stretch',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: '800',
                  letterSpacing: 1,
                }}
              >
                {bannerLabel}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: '#10E4C1',
                  }}
                />
                <Text
                  style={{
                    color: '#10E4C1',
                    fontSize: 11,
                    fontWeight: '700',
                  }}
                >
                  Tracking
                </Text>
              </View>
            </View>

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
                paddingVertical: 10,
                borderRadius: 100,
                maxWidth: '95%',
              }}
            >
              <Text
                style={{
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: 11,
                  fontWeight: '700',
                  textAlign: 'center',
                }}
              >
                Working on
              </Text>
              <Text
                style={{
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: '800',
                  textAlign: 'center',
                  marginTop: 2,
                }}
                numberOfLines={2}
              >
                {task?.title ?? 'Tracking…'}
                {subtask ? ` → ${subtask.title}` : ''}
              </Text>
              {otherActive.length > 0 && (
                <Text
                  style={{
                    color: 'rgba(255,255,255,0.55)',
                    fontSize: 10,
                    textAlign: 'center',
                    marginTop: 2,
                  }}
                >
                  {otherActive.length + 1} running — tap to switch
                </Text>
              )}
            </Pressable>

            {driftCount > 0 && (
              <Text
                style={{
                  color: '#F5A623',
                  fontSize: 11,
                  fontWeight: '700',
                }}
              >
                ⚠ {driftCount} interruption{driftCount === 1 ? '' : 's'} logged
              </Text>
            )}
          </View>

          {/* Middle — big timer + planned duration footer */}
          <View style={{ alignItems: 'center', gap: 20 }}>
            <Text
              style={{
                color: '#fff',
                fontSize: 96,
                fontWeight: '800',
                fontVariant: ['tabular-nums'],
                letterSpacing: -4,
              }}
              accessibilityLabel={
                planned !== null
                  ? `${fmt(remaining ?? 0)} remaining of ${fmt(planned)}`
                  : `${fmt(elapsed)} elapsed`
              }
              accessibilityLiveRegion="polite"
            >
              {planned !== null ? fmt(remaining ?? 0) : fmt(elapsed)}
            </Text>
            {planned !== null && (
              <>
                <Text
                  style={{
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 14,
                    fontWeight: '700',
                  }}
                >
                  of {Math.round(planned / 60)}:00
                </Text>
                <ProgressBar fraction={progress} />
              </>
            )}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginTop: 4,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                Current streak: {streak} day{streak === 1 ? '' : 's'}
              </Text>
              <Text style={{ fontSize: 12 }}>🔥</Text>
            </View>
            <Text
              style={{
                color: 'rgba(255,255,255,0.6)',
                fontSize: 11,
                fontWeight: '600',
              }}
            >
              {isStrict
                ? '• Leaving resets your streak'
                : isGatedMode
                  ? '• Backgrounding logs drift'
                  : '• No restrictions'}
            </Text>
          </View>

          {/* Bottom — controls + minimize */}
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <BottomButton icon="⏸" label="Pause" onPress={handlePause} />
              <BottomButton
                icon="⏹"
                label={isStrict ? 'Stop early' : 'Stop'}
                onPress={handleStop}
                danger
              />
            </View>
            <Pressable
              onPress={handleMinimize}
              hitSlop={8}
              style={{ alignItems: 'center' }}
            >
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

      <BreakingOutModal
        visible={breakingOutOpen}
        elapsedSeconds={elapsed}
        plannedSeconds={planned}
        streak={streak}
        onCancel={() => setBreakingOutOpen(false)}
        onConfirm={handleConfirmBreak}
      />
    </>
  );
}

function BottomButton({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: danger ? 'rgba(229,68,122,0.25)' : 'rgba(255,255,255,0.14)',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        gap: 4,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 22 }}>{icon}</Text>
      <Text
        style={{
          color: '#fff',
          fontSize: 12,
          fontWeight: '800',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ProgressBar({ fraction }: { fraction: number }) {
  return (
    <View
      style={{
        width: 200,
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.18)',
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${Math.round(fraction * 100)}%`,
          height: '100%',
          backgroundColor: '#10E4C1',
        }}
      />
    </View>
  );
}
