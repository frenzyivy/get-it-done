import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { fmt, fmtShort } from '@/lib/utils';
import { useStore } from '@/lib/store';
import type { TaskType } from '@/types';

const GENERAL = '__general__';

interface Props {
  task: TaskType;
}

export function PomodoroTimer({ task }: Props) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [activeSubtaskId, setActiveSubtaskId] = useState<string>(GENERAL);

  const runningTimer = useStore((s) => s.runningTimer);
  const setRunningTimer = useStore((s) => s.setRunningTimer);
  const tickRunningTimer = useStore((s) => s.tickRunningTimer);
  const saveTimeSession = useStore((s) => s.saveTimeSession);

  const running = runningTimer?.taskId === task.id;
  const startTimeRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setElapsed((e) => e + 1);
        tickRunningTimer();
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, tickRunningTimer]);

  const activeSub = task.subtasks.find((s) => s.id === activeSubtaskId);
  const activeLabel = activeSub ? activeSub.title : 'General (whole task)';

  const handleStart = () => {
    if (runningTimer) return;
    const now = new Date().toISOString();
    startTimeRef.current = now;
    setElapsed(0);
    setRunningTimer({
      taskId: task.id,
      subtaskId: activeSubtaskId === GENERAL ? null : activeSubtaskId,
      label: activeLabel,
      startedAt: now,
      elapsed: 0,
    });
  };

  const handlePause = () => {
    if (running) setRunningTimer(null);
  };
  const handleResume = () => {
    if (elapsed <= 0) return;
    setRunningTimer({
      taskId: task.id,
      subtaskId: activeSubtaskId === GENERAL ? null : activeSubtaskId,
      label: activeLabel,
      startedAt: startTimeRef.current ?? new Date().toISOString(),
      elapsed,
    });
  };
  const handleDiscard = () => {
    setRunningTimer(null);
    setElapsed(0);
    startTimeRef.current = null;
  };
  const handleStop = async () => {
    setRunningTimer(null);
    if (elapsed <= 0) return;
    const startedAt = startTimeRef.current ?? new Date().toISOString();
    const subId = activeSubtaskId === GENERAL ? null : activeSubtaskId;
    await saveTimeSession(task.id, subId, startedAt, elapsed, activeLabel);
    setElapsed(0);
    startTimeRef.current = null;
  };

  const totalTime = task.total_time_seconds + (running ? elapsed : 0);
  const sessionCount = task.sessions.length + (running ? 1 : 0);

  const timerIcon = (
    <Pressable
      onPress={() => setPanelOpen((v) => !v)}
      hitSlop={6}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: running
          ? '#8b5cf6'
          : totalTime > 0
            ? 'rgba(139,92,246,0.1)'
            : 'rgba(0,0,0,0.04)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: running ? '#fff' : totalTime > 0 ? '#8b5cf6' : '#999',
          fontSize: 14,
        }}
      >
        {running ? '⏸' : '●'}
      </Text>
      {running && (
        <View
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#ef4444',
          }}
        />
      )}
    </Pressable>
  );

  if (!panelOpen) return { timerIcon, panel: null, running, totalTime };

  const Btn = ({
    onPress,
    bg,
    color,
    children,
  }: {
    onPress: () => void;
    bg: string;
    color?: string;
    children: React.ReactNode;
  }) => (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: bg,
        borderRadius: 10,
        paddingHorizontal: 16,
        paddingVertical: 8,
      }}
    >
      <Text style={{ color: color ?? '#fff', fontSize: 13, fontWeight: '700' }}>
        {children}
      </Text>
    </Pressable>
  );

  const panel = (
    <View
      style={{
        backgroundColor: '#f8f7ff',
        borderRadius: 12,
        padding: 14,
        marginTop: 8,
        borderWidth: 1.5,
        borderColor: 'rgba(139,92,246,0.15)',
      }}
    >
      <View style={{ marginBottom: 12 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: '#888',
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          Working on
        </Text>
        <Pressable
          disabled={running}
          onPress={() => setPickerOpen(true)}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 10,
            borderRadius: 10,
            borderWidth: 1.5,
            borderColor: running ? 'rgba(139,92,246,0.3)' : '#e5e7eb',
            backgroundColor: running ? 'rgba(139,92,246,0.05)' : '#fff',
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: running ? '#8b5cf6' : '#1a1a2e',
            }}
          >
            {activeSubtaskId === GENERAL
              ? '🎯 General (whole task)'
              : `${activeSub?.is_done ? '✅' : '○'} ${activeSub?.title}${
                  activeSub && activeSub.total_time_seconds > 0
                    ? ` (${fmtShort(activeSub.total_time_seconds)})`
                    : ''
                }`}
          </Text>
        </Pressable>
      </View>

      <Text
        style={{
          fontSize: 36,
          fontWeight: '800',
          color: running ? '#8b5cf6' : '#1a1a2e',
          textAlign: 'center',
          fontVariant: ['tabular-nums'],
        }}
      >
        {fmt(elapsed)}
      </Text>
      {running && (
        <Text
          style={{
            textAlign: 'center',
            fontSize: 12,
            color: '#8b5cf6',
            fontWeight: '600',
            marginBottom: 8,
          }}
        >
          ▸ {activeLabel}
        </Text>
      )}

      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          justifyContent: 'center',
          marginVertical: 12,
        }}
      >
        {!running && elapsed === 0 && (
          <Btn onPress={handleStart} bg="#8b5cf6">
            ▶ Start
          </Btn>
        )}
        {running && (
          <>
            <Btn onPress={handlePause} bg="#f59e0b">
              ⏸ Pause
            </Btn>
            <Btn onPress={handleStop} bg="#10b981">
              ⏹ Save
            </Btn>
          </>
        )}
        {!running && elapsed > 0 && (
          <>
            <Btn onPress={handleResume} bg="#8b5cf6">
              ▶ Resume
            </Btn>
            <Btn onPress={handleStop} bg="#10b981">
              ⏹ Save
            </Btn>
            <Btn onPress={handleDiscard} bg="rgba(0,0,0,0.06)" color="#888">
              ✕ Discard
            </Btn>
          </>
        )}
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: 16,
          justifyContent: 'center',
          paddingVertical: 8,
          borderTopWidth: 1,
          borderTopColor: 'rgba(139,92,246,0.1)',
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#8b5cf6' }}>
            {fmtShort(totalTime)}
          </Text>
          <Text
            style={{
              fontSize: 10,
              color: '#888',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Total
          </Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a1a2e' }}>
            {sessionCount}
          </Text>
          <Text
            style={{
              fontSize: 10,
              color: '#888',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Sessions
          </Text>
        </View>
      </View>

      {task.sessions.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: '#aaa',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 4,
            }}
          >
            Session Log
          </Text>
          <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
            {[...task.sessions]
              .sort(
                (a, b) =>
                  new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
              )
              .map((s) => {
                const d = new Date(s.started_at);
                return (
                  <View
                    key={s.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingVertical: 5,
                      borderBottomWidth: 1,
                      borderBottomColor: 'rgba(0,0,0,0.04)',
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ fontSize: 12, fontWeight: '600', color: '#1a1a2e' }}
                        numberOfLines={1}
                      >
                        {s.label || 'General'}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#aaa' }}>
                        {d.toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}{' '}
                        ·{' '}
                        {d.toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                    <Text
                      style={{ fontSize: 12, fontWeight: '700', color: '#8b5cf6' }}
                    >
                      {fmtShort(s.duration_seconds)}
                    </Text>
                  </View>
                );
              })}
          </ScrollView>
        </View>
      )}

      <Modal
        visible={pickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          onPress={() => setPickerOpen(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.4)',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14 }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '800',
                color: '#1a1a2e',
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Pick subtask
            </Text>
            <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled>
              <Pressable
                onPress={() => {
                  setActiveSubtaskId(GENERAL);
                  setPickerOpen(false);
                }}
                style={{
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: 'rgba(0,0,0,0.06)',
                }}
              >
                <Text style={{ fontSize: 14 }}>🎯 General (whole task)</Text>
              </Pressable>
              {task.subtasks.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    setActiveSubtaskId(s.id);
                    setPickerOpen(false);
                  }}
                  style={{
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: 'rgba(0,0,0,0.06)',
                  }}
                >
                  <Text style={{ fontSize: 14 }}>
                    {s.is_done ? '✅' : '○'} {s.title}
                    {s.total_time_seconds > 0
                      ? ` (${fmtShort(s.total_time_seconds)})`
                      : ''}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );

  return { timerIcon, panel, running, totalTime };
}
