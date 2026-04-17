import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useStore } from '@/lib/store';
import { fmtShort } from '@/lib/utils';
import type { PlannedBlock, TaskType } from '@/types';

// v2 spec §8 — Schedule view (mobile adaptation).
// Vertical timeline with a NOW marker; tap "+ Plan task" to schedule a block.
// Drag-and-drop is intentionally omitted on mobile — form modal is simpler.

const HOUR_HEIGHT = 64;
const START_HOUR = 6;
const END_HOUR = 23;

export function ScheduleView() {
  const tasks = useStore((s) => s.tasks);
  const plannedBlocks = useStore((s) => s.plannedBlocks);
  const fetchPlannedBlocks = useStore((s) => s.fetchPlannedBlocks);
  const addPlannedBlock = useStore((s) => s.addPlannedBlock);
  const deletePlannedBlock = useStore((s) => s.deletePlannedBlock);
  const userId = useStore((s) => s.userId);

  const [now, setNow] = useState(() => new Date());
  const [composerOpen, setComposerOpen] = useState(false);

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
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const plannedTotal = plannedBlocks.reduce((s, b) => s + b.duration_seconds, 0);

  const nowOffsetPx =
    now >= dayStart &&
    now.getHours() >= START_HOUR &&
    now.getHours() < END_HOUR
      ? (now.getHours() - START_HOUR) * HOUR_HEIGHT +
        (now.getMinutes() / 60) * HOUR_HEIGHT
      : null;

  const handleDelete = (b: PlannedBlock, taskTitle: string) =>
    Alert.alert('Delete block?', taskTitle, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void deletePlannedBlock(b.id),
      },
    ]);

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 10,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '800', color: '#1a1a2e' }}>
          {dayStart.toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
          })}
        </Text>
        <Text style={{ fontSize: 12, color: '#666' }}>
          Planned ·{' '}
          <Text style={{ color: '#8b5cf6', fontWeight: '700' }}>
            {fmtShort(plannedTotal)}
          </Text>
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ position: 'relative', backgroundColor: '#fff' }}>
          {Array.from(
            { length: END_HOUR - START_HOUR },
            (_, i) => START_HOUR + i,
          ).map((h) => (
            <HourRow
              key={h}
              hour={h}
              blocks={plannedBlocks.filter(
                (b) => new Date(b.start_at).getHours() === h,
              )}
              tasks={tasks}
              onDelete={handleDelete}
            />
          ))}
          {nowOffsetPx !== null && (
            <View
              style={{
                position: 'absolute',
                left: 56,
                right: 8,
                top: nowOffsetPx,
                height: 2,
                backgroundColor: '#dc2626',
              }}
              pointerEvents="none"
            >
              <View
                style={{
                  position: 'absolute',
                  left: -4,
                  top: -4,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: '#dc2626',
                }}
              />
            </View>
          )}
        </View>
      </ScrollView>

      <Pressable
        onPress={() => setComposerOpen(true)}
        style={{
          position: 'absolute',
          bottom: 20,
          left: 16,
          right: 16,
          backgroundColor: '#8b5cf6',
          paddingVertical: 14,
          borderRadius: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
          + Plan a task
        </Text>
      </Pressable>

      <BlockComposer
        visible={composerOpen}
        onClose={() => setComposerOpen(false)}
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
        }}
      />
    </View>
  );
}

function HourRow({
  hour,
  blocks,
  tasks,
  onDelete,
}: {
  hour: number;
  blocks: PlannedBlock[];
  tasks: TaskType[];
  onDelete: (b: PlannedBlock, taskTitle: string) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', height: HOUR_HEIGHT }}>
      <View
        style={{
          width: 56,
          borderRightWidth: 1,
          borderRightColor: '#eee',
          paddingHorizontal: 8,
          paddingVertical: 4,
        }}
      >
        <Text style={{ fontSize: 11, color: '#888' }}>
          {String(hour).padStart(2, '0')}:00
        </Text>
      </View>
      <View
        style={{
          flex: 1,
          position: 'relative',
          borderBottomWidth: 1,
          borderBottomColor: '#f0f0f0',
          borderStyle: 'dashed',
        }}
      >
        {blocks.map((b) => {
          const start = new Date(b.start_at);
          const task = tasks.find((t) => t.id === b.task_id);
          const topPx = (start.getMinutes() / 60) * HOUR_HEIGHT;
          const heightPx = (b.duration_seconds / 3600) * HOUR_HEIGHT;
          return (
            <Pressable
              key={b.id}
              onLongPress={() => onDelete(b, task?.title ?? 'Untitled')}
              style={{
                position: 'absolute',
                top: topPx,
                left: 4,
                right: 4,
                height: heightPx - 2,
                backgroundColor: 'rgba(139,92,246,0.08)',
                borderLeftWidth: 3,
                borderLeftColor: '#8b5cf6',
                borderRadius: 6,
                paddingHorizontal: 6,
                paddingVertical: 3,
              }}
            >
              <Text
                style={{ fontSize: 11, fontWeight: '700', color: '#1a1a2e' }}
                numberOfLines={1}
              >
                {task?.title ?? 'Untitled block'}
              </Text>
              <Text style={{ fontSize: 9, color: '#888' }}>
                {fmtShort(b.duration_seconds)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function BlockComposer({
  visible,
  onClose,
  tasks,
  dayStart,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  tasks: TaskType[];
  dayStart: Date;
  onCreate: (taskId: string, startAt: Date, durationMinutes: number) => Promise<void>;
}) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [startAt, setStartAt] = useState<Date>(() => {
    const d = new Date(dayStart);
    d.setHours(new Date().getHours() + 1, 0, 0, 0);
    return d;
  });
  const [duration, setDuration] = useState(60);
  const [pickerOpen, setPickerOpen] = useState(false);

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
            backgroundColor: '#fff',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
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
              backgroundColor: '#e5e7eb',
              marginBottom: 16,
            }}
          />
          <Text
            style={{
              fontSize: 18,
              fontWeight: '800',
              color: '#1a1a2e',
              marginBottom: 14,
            }}
          >
            Plan a time block
          </Text>

          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: '#888',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
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
                      paddingVertical: 8,
                      borderRadius: 8,
                      borderWidth: 1.5,
                      borderColor: on ? '#8b5cf6' : '#e5e7eb',
                      backgroundColor: on ? 'rgba(139,92,246,0.08)' : '#fff',
                    }}
                  >
                    <Text
                      style={{
                        color: on ? '#8b5cf6' : '#333',
                        fontSize: 12,
                        fontWeight: on ? '700' : '500',
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
              fontSize: 11,
              fontWeight: '700',
              color: '#888',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Start time
          </Text>
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 8,
              borderWidth: 1.5,
              borderColor: '#e5e7eb',
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 14, color: '#1a1a2e' }}>
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
              fontSize: 11,
              fontWeight: '700',
              color: '#888',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
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
                    paddingVertical: 8,
                    borderRadius: 8,
                    borderWidth: 1.5,
                    borderColor: on ? '#8b5cf6' : '#e5e7eb',
                    backgroundColor: on ? 'rgba(139,92,246,0.08)' : '#fff',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: on ? '#8b5cf6' : '#333',
                      fontWeight: on ? '700' : '500',
                    }}
                  >
                    {m}m
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
            <Pressable onPress={onClose} style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ color: '#888', fontSize: 14, fontWeight: '600' }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => taskId && void onCreate(taskId, startAt, duration)}
              disabled={!taskId}
              style={{
                backgroundColor: taskId ? '#8b5cf6' : '#ddd',
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 10,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                Plan it
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
