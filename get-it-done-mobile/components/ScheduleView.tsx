import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useTheme } from 'react-native-paper';
import { useStore } from '@/lib/store';
import { type as M3Type } from '@/lib/theme';
import type { PlannedBlock, TaskType } from '@/types';

const START_HOUR = 6;
const END_HOUR = 22;
const HOUR_H = 52;
const RAIL_W = 48;

// "Success" green for on-plan actual blocks. M3 doesn't define a success role;
// app-android.jsx uses #0F7A4B (light) / #6FE39B (dark). We pick based on theme.

interface PlacedBlock {
  id: string;
  task: TaskType | undefined;
  startHour: number;
  endHour: number;
}

function toHourFloat(iso: string, dayStart: Date): number {
  const ms = new Date(iso).getTime() - dayStart.getTime();
  return ms / 3_600_000;
}

// RN stand-in for the prototype's oklch(0.94 0.04 hue) / oklch(0.22 0.04 hue).
// We hash a seed into a hue and build an HSL pair — pastel in light mode,
// dusky in dark mode.
function tagHuePair(seed: string | undefined, dark: boolean, fallback: string) {
  if (!seed) return { fill: fallback, border: fallback };
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return dark
    ? { fill: `hsl(${h}, 24%, 26%)`, border: `hsl(${h}, 32%, 34%)` }
    : { fill: `hsl(${h}, 48%, 92%)`, border: `hsl(${h}, 40%, 82%)` };
}

export function ScheduleView() {
  const theme = useTheme();
  const c = theme.colors;
  const success = theme.dark ? '#6FE39B' : '#0F7A4B';

  const tasks = useStore((s) => s.tasks);
  const plannedBlocks = useStore((s) => s.plannedBlocks);
  const fetchPlannedBlocks = useStore((s) => s.fetchPlannedBlocks);
  const addPlannedBlock = useStore((s) => s.addPlannedBlock);
  const deletePlannedBlock = useStore((s) => s.deletePlannedBlock);
  const activeSessions = useStore((s) => s.activeSessions);
  const userId = useStore((s) => s.userId);

  const scrollRef = useRef<ScrollView>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerSeedHour, setComposerSeedHour] = useState<number | null>(null);

  const openComposerAtHour = (hour: number) => {
    setComposerSeedHour(hour);
    setComposerOpen(true);
  };

  const dayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const dayEnd = useMemo(() => {
    const d = new Date(dayStart);
    d.setDate(d.getDate() + 1);
    return d;
  }, [dayStart]);

  useEffect(() => {
    if (!userId) return;
    void fetchPlannedBlocks(dayStart.toISOString(), dayEnd.toISOString());
  }, [userId, fetchPlannedBlocks, dayStart, dayEnd]);

  useEffect(() => {
    // Tick every 30s — fine-grained enough for the Live block + NOW line to
    // move visibly, cheap enough to not thrash React.
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const nowHour = (nowMs - dayStart.getTime()) / 3_600_000;

  const placedPlanned: PlacedBlock[] = useMemo(
    () =>
      plannedBlocks.map((b) => {
        const start = toHourFloat(b.start_at, dayStart);
        return {
          id: b.id,
          task: tasks.find((t) => t.id === b.task_id) ?? undefined,
          startHour: start,
          endHour: start + b.duration_seconds / 3600,
        };
      }),
    [plannedBlocks, tasks, dayStart],
  );

  // Actual blocks: TimeSession history whose started_at is today.
  const actualBlocks: PlacedBlock[] = useMemo(() => {
    const out: PlacedBlock[] = [];
    for (const t of tasks) {
      for (const s of t.sessions) {
        const startMs = new Date(s.started_at).getTime();
        if (startMs < dayStart.getTime() || startMs >= dayEnd.getTime()) continue;
        const startH = (startMs - dayStart.getTime()) / 3_600_000;
        out.push({
          id: s.id,
          task: t,
          startHour: startH,
          endHour: startH + s.duration_seconds / 3600,
        });
      }
    }
    return out;
  }, [tasks, dayStart, dayEnd]);

  const liveSession = activeSessions[activeSessions.length - 1] ?? null;
  const liveTask = liveSession
    ? tasks.find((t) => t.id === liveSession.task_id)
    : null;
  const liveStartHour = liveSession
    ? toHourFloat(liveSession.started_at, dayStart)
    : null;

  const plannedTotalSec = plannedBlocks.reduce(
    (s, b) => s + b.duration_seconds,
    0,
  );
  const trackedTotalSec = actualBlocks.reduce(
    (s, b) => s + (b.endHour - b.startHour) * 3600,
    0,
  );

  const isOnPlan = (a: PlacedBlock) =>
    placedPlanned.some(
      (p) =>
        p.task?.id === a.task?.id &&
        a.startHour < p.endHour &&
        a.endHour > p.startHour,
    );

  const scrollToNow = () => {
    const y = Math.max(0, (nowHour - START_HOUR) * HOUR_H - HOUR_H * 2);
    scrollRef.current?.scrollTo({ y, animated: true });
  };

  const fmtHHMM = (h: number) => {
    let hh = Math.floor(h);
    let mm = Math.round((h - hh) * 60);
    if (mm === 60) {
      mm = 0;
      hh += 1;
    }
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };

  const nowInRange = nowHour >= START_HOUR && nowHour <= END_HOUR + 1;
  const nowTopPx = nowInRange ? (nowHour - START_HOUR) * HOUR_H : 0;

  const handleDeletePlan = (b: PlannedBlock, title: string) =>
    Alert.alert('Delete block?', title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void deletePlannedBlock(b.id),
      },
    ]);

  const weekdayLabel = dayStart.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

  const secToMs = (n: number) => {
    const m = Math.round(n / 60);
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h > 0 ? `${h}h${r > 0 ? ` ${r}m` : ''}` : `${m}m`;
  };

  const railInnerHeight = (END_HOUR - START_HOUR + 1) * HOUR_H;

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ ...M3Type.titleMedium, color: c.onSurface }}>
            {weekdayLabel}
          </Text>
          <Text
            style={{
              ...M3Type.bodySmall,
              color: c.onSurfaceVariant,
              fontVariant: ['tabular-nums'],
              marginTop: 2,
            }}
          >
            Planned {secToMs(plannedTotalSec)} · Tracked {secToMs(trackedTotalSec)}
          </Text>
        </View>
        <Pressable
          onPress={scrollToNow}
          accessibilityRole="button"
          accessibilityLabel="Jump to now"
          style={{
            height: 32,
            paddingHorizontal: 14,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: c.outline,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ ...M3Type.labelLarge, color: c.onSurface }}>Today</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        <View
          style={{
            position: 'relative',
            paddingLeft: RAIL_W,
            paddingRight: 16,
            paddingTop: 8,
            minHeight: railInnerHeight + 16,
          }}
        >
          {/* Hour rail — tap an empty hour to plan a block at that time */}
          {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, i) => {
            const hr = START_HOUR + i;
            return (
              <Pressable
                key={hr}
                onPress={() => openComposerAtHour(hr)}
                accessibilityRole="button"
                accessibilityLabel={`Plan a block at ${String(hr).padStart(2, '0')}:00`}
                style={({ pressed }) => ({
                  position: 'relative',
                  height: HOUR_H,
                  borderTopWidth: 1,
                  borderTopColor: c.outlineVariant,
                  backgroundColor: pressed ? c.elevation.level1 : 'transparent',
                })}
              >
                <Text
                  style={{
                    position: 'absolute',
                    left: -RAIL_W + 8,
                    top: -8,
                    ...M3Type.labelSmall,
                    fontVariant: ['tabular-nums'],
                    color: c.onSurfaceVariant,
                  }}
                >
                  {String(hr).padStart(2, '0')}:00
                </Text>
              </Pressable>
            );
          })}

          {/* Plan column (left 46%) */}
          {placedPlanned.map((p) => {
            const top = (p.startHour - START_HOUR) * HOUR_H + 8;
            const h = Math.max(18, (p.endHour - p.startHour) * HOUR_H - 4);
            const seed = p.task?.tag_ids[0] ?? p.task?.title;
            const { fill, border } = tagHuePair(
              seed,
              theme.dark,
              theme.dark ? c.elevation.level3 : c.elevation.level2,
            );
            return (
              <Pressable
                key={p.id}
                onLongPress={() =>
                  handleDeletePlan(
                    plannedBlocks.find((b) => b.id === p.id)!,
                    p.task?.title ?? 'Planned block',
                  )
                }
                style={{
                  position: 'absolute',
                  left: RAIL_W,
                  top,
                  width: '46%',
                  height: h,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: border,
                  backgroundColor: fill,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  overflow: 'hidden',
                }}
              >
                <Text
                  style={{
                    ...M3Type.labelSmall,
                    color: c.onSurfaceVariant,
                    textTransform: 'uppercase',
                  }}
                >
                  Plan
                </Text>
                <Text
                  numberOfLines={2}
                  style={{
                    ...M3Type.bodyMedium,
                    color: c.onSurface,
                    marginTop: 2,
                  }}
                >
                  {p.task?.title ?? 'Untitled'}
                </Text>
              </Pressable>
            );
          })}

          {/* Actual column (right 50%) */}
          {actualBlocks.map((a) => {
            const top = (a.startHour - START_HOUR) * HOUR_H + 8;
            const h = Math.max(8, (a.endHour - a.startHour) * HOUR_H - 2);
            const onPlan = isOnPlan(a);
            const bg = onPlan ? success : c.tertiary;
            const fg = onPlan || theme.dark ? '#FFFFFF' : c.onTertiary;
            const short = h < 22;
            return (
              <View
                key={a.id}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top,
                  width: '50%',
                  height: h,
                  borderRadius: 8,
                  backgroundColor: bg,
                  paddingHorizontal: 6,
                  paddingVertical: 3,
                  overflow: 'hidden',
                }}
              >
                {short ? (
                  <Text
                    style={{
                      ...M3Type.labelSmall,
                      color: fg,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {secToMs((a.endHour - a.startHour) * 3600)}
                  </Text>
                ) : (
                  <>
                    <Text
                      style={{
                        ...M3Type.labelSmall,
                        color: fg,
                        textTransform: 'uppercase',
                        opacity: 0.85,
                      }}
                    >
                      {onPlan ? 'On plan' : 'Off plan'}
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={{ ...M3Type.bodyMedium, color: fg, marginTop: 2 }}
                    >
                      {a.task?.title ?? 'Untitled'}
                    </Text>
                  </>
                )}
              </View>
            );
          })}

          {/* Live block — primary fill, from live start to now */}
          {liveStartHour !== null && liveTask && nowHour > liveStartHour && (
            <View
              style={{
                position: 'absolute',
                left: '50%',
                top: (liveStartHour - START_HOUR) * HOUR_H + 8,
                width: '50%',
                height: Math.max(28, (nowHour - liveStartHour) * HOUR_H - 2),
                borderRadius: 8,
                backgroundColor: c.primary,
                paddingHorizontal: 8,
                paddingVertical: 4,
                overflow: 'hidden',
                shadowColor: c.primary,
                shadowOpacity: 0.4,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 },
                elevation: 4,
                zIndex: 5,
              }}
            >
              <Text
                style={{
                  ...M3Type.labelSmall,
                  color: c.onPrimary,
                  textTransform: 'uppercase',
                }}
              >
                Live
              </Text>
              <Text
                numberOfLines={2}
                style={{ ...M3Type.bodyMedium, color: c.onPrimary, marginTop: 2 }}
              >
                {liveTask.title}
              </Text>
            </View>
          )}

          {/* NOW line */}
          {nowInRange && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: RAIL_W - 10,
                right: 16,
                top: nowTopPx + 8,
                height: 2,
                backgroundColor: c.error,
                zIndex: 10,
              }}
            >
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  top: -4,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: c.error,
                }}
              />
              <Text
                style={{
                  position: 'absolute',
                  right: 0,
                  top: -18,
                  ...M3Type.labelSmall,
                  color: c.error,
                  fontVariant: ['tabular-nums'],
                }}
              >
                NOW · {fmtHHMM(nowHour)}
              </Text>
            </View>
          )}

          {/* Empty-day CTA */}
          {placedPlanned.length === 0 && (
            <View
              pointerEvents="box-none"
              style={{
                position: 'absolute',
                left: RAIL_W,
                right: 16,
                top: railInnerHeight / 2,
                alignItems: 'center',
              }}
            >
              <Pressable
                onPress={() => openComposerAtHour(Math.max(START_HOUR, Math.min(END_HOUR - 1, Math.floor(nowHour))))}
                style={{
                  paddingHorizontal: 16,
                  height: 40,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: c.outline,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ ...M3Type.labelLarge, color: c.onSurface }}>
                  + Plan a task
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>

      <BlockComposer
        visible={composerOpen}
        seedHour={composerSeedHour}
        onClose={() => {
          setComposerOpen(false);
          setComposerSeedHour(null);
        }}
        tasks={tasks.filter((t) => t.status !== 'done')}
        dayStart={dayStart}
        onCreate={async (taskId, startAt, durationMinutes) => {
          await addPlannedBlock({
            task_id: taskId,
            subtask_id: null,
            start_at: startAt.toISOString(),
            duration_seconds: durationMinutes * 60,
            block_type: 'work',
            notes: null,
          });
          setComposerOpen(false);
          setComposerSeedHour(null);
        }}
      />
    </View>
  );
}

function BlockComposer({
  visible,
  seedHour,
  onClose,
  tasks,
  dayStart,
  onCreate,
}: {
  visible: boolean;
  seedHour: number | null;
  onClose: () => void;
  tasks: TaskType[];
  dayStart: Date;
  onCreate: (
    taskId: string,
    startAt: Date,
    durationMinutes: number,
  ) => Promise<void>;
}) {
  const theme = useTheme();
  const c = theme.colors;
  const [taskId, setTaskId] = useState<string | null>(null);
  const [startAt, setStartAt] = useState<Date>(() => {
    const d = new Date(dayStart);
    d.setHours(new Date().getHours() + 1, 0, 0, 0);
    return d;
  });
  const [duration, setDuration] = useState(60);
  const [pickerOpen, setPickerOpen] = useState(false);

  // When the user taps an empty hour on the grid, seed the composer's start
  // time to that hour so the block lands where they tapped.
  useEffect(() => {
    if (visible && seedHour !== null) {
      const d = new Date(dayStart);
      d.setHours(seedHour, 0, 0, 0);
      setStartAt(d);
    }
  }, [visible, seedHour, dayStart]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.4)',
          justifyContent: 'flex-end',
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: c.elevation.level2,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: 20,
            paddingBottom: 32,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: c.outlineVariant,
              marginBottom: 16,
            }}
          />
          <Text
            style={{
              ...M3Type.titleLarge,
              color: c.onSurface,
              marginBottom: 14,
            }}
          >
            Plan a time block
          </Text>

          <Text
            style={{
              ...M3Type.labelMedium,
              color: c.onSurfaceVariant,
              marginBottom: 6,
              textTransform: 'uppercase',
            }}
          >
            Task
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 16 }}
          >
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {tasks.map((t) => {
                const on = t.id === taskId;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => setTaskId(t.id)}
                    style={{
                      paddingHorizontal: 12,
                      height: 32,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: on ? c.primary : c.outlineVariant,
                      backgroundColor: on
                        ? c.secondaryContainer
                        : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        ...M3Type.labelLarge,
                        color: on ? c.onSecondaryContainer : c.onSurface,
                      }}
                    >
                      {t.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Text
            style={{
              ...M3Type.labelMedium,
              color: c.onSurfaceVariant,
              marginBottom: 6,
              textTransform: 'uppercase',
            }}
          >
            Start time
          </Text>
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={{
              paddingHorizontal: 12,
              height: 44,
              justifyContent: 'center',
              borderRadius: 8,
              borderWidth: 1,
              borderColor: c.outlineVariant,
              marginBottom: 16,
            }}
          >
            <Text style={{ ...M3Type.bodyLarge, color: c.onSurface }}>
              {startAt.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </Pressable>
          {pickerOpen && (
            <DateTimePicker
              value={startAt}
              mode="time"
              onChange={(_e: DateTimePickerEvent, d?: Date) => {
                setPickerOpen(false);
                if (d) setStartAt(d);
              }}
            />
          )}

          <Text
            style={{
              ...M3Type.labelMedium,
              color: c.onSurfaceVariant,
              marginBottom: 6,
              textTransform: 'uppercase',
            }}
          >
            Duration
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 20 }}>
            {[25, 50, 60, 90, 120].map((m) => {
              const on = m === duration;
              return (
                <Pressable
                  key={m}
                  onPress={() => setDuration(m)}
                  style={{
                    paddingHorizontal: 12,
                    height: 32,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: on ? c.primary : c.outlineVariant,
                    backgroundColor: on ? c.secondaryContainer : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      ...M3Type.labelLarge,
                      color: on ? c.onSecondaryContainer : c.onSurface,
                    }}
                  >
                    {m}m
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View
            style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}
          >
            <Pressable
              onPress={onClose}
              style={{ paddingHorizontal: 16, height: 40, justifyContent: 'center' }}
            >
              <Text style={{ ...M3Type.labelLarge, color: c.onSurfaceVariant }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => taskId && void onCreate(taskId, startAt, duration)}
              disabled={!taskId}
              style={{
                backgroundColor: taskId ? c.primary : c.elevation.level3,
                paddingHorizontal: 20,
                height: 40,
                borderRadius: 20,
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  ...M3Type.labelLarge,
                  color: taskId ? c.onPrimary : c.onSurfaceVariant,
                }}
              >
                Plan it
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

