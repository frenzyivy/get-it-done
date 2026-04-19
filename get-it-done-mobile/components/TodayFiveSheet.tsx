import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import DraggableFlatList, {
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { useStore } from '@/lib/store';
import { todayISO } from '@/lib/utils';
import type { Status, TaskType } from '@/types';

// "Today's 5" sheet (mobile). Mirrors the web TodayFiveDrawer:
//   • Top 5 by sort_order are "today's 5"; anything beyond is a waiting list.
//   • Drag to reorder within the planned set (rewrites sort_order).
//   • A picker for empty slots.
const DAILY_CAP = 5;

export interface TodayFiveSheetHandle {
  open: () => void;
  close: () => void;
}

export const TodayFiveSheet = forwardRef<TodayFiveSheetHandle>(
  function TodayFiveSheet(_props, ref) {
    const [open, setOpen] = useState(false);

    useImperativeHandle(ref, () => ({
      open: () => setOpen(true),
      close: () => setOpen(false),
    }));

    return (
      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <TodayFiveInner onClose={() => setOpen(false)} />
      </Modal>
    );
  },
);

function TodayFiveInner({ onClose }: { onClose: () => void }) {
  const tasks = useStore((s) => s.tasks);
  const updateTask = useStore((s) => s.updateTask);
  const setPlannedForDateBulk = useStore((s) => s.setPlannedForDateBulk);

  const today = todayISO();
  const planned = useMemo(
    () =>
      tasks
        .filter((t) => t.planned_for_date === today)
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order),
    [tasks, today],
  );
  const completed = planned
    .slice(0, DAILY_CAP)
    .filter((t) => t.status === 'done').length;

  const [pickerOpen, setPickerOpen] = useState(false);

  const handleStatusToggle = async (t: TaskType) => {
    const next: Status = t.status === 'done' ? 'in_progress' : 'done';
    await updateTask(t.id, { status: next });
  };

  const handleRemove = async (t: TaskType) => {
    await updateTask(t.id, { planned_for_date: null });
  };

  const handleReorder = async (next: TaskType[]) => {
    if (next.length === 0) return;
    const minOrder = Math.min(...next.map((t) => t.sort_order));
    await Promise.all(
      next.map((t, i) =>
        updateTask(t.id, { sort_order: minOrder + i }),
      ),
    );
  };

  const renderItem = ({ item, drag, getIndex }: RenderItemParams<TaskType>) => {
    const i = getIndex() ?? 0;
    const inTopFive = i < DAILY_CAP;
    return (
      <View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: inTopFive ? '#fff' : '#fafafa',
            borderRadius: 8,
            marginBottom: 2,
          }}
        >
          <Pressable onLongPress={drag} hitSlop={8}>
            <Text style={{ color: '#bbb', fontSize: 16 }}>⋮⋮</Text>
          </Pressable>
          <Pressable
            onPress={() => void handleStatusToggle(item)}
            hitSlop={6}
            style={{
              width: 20,
              height: 20,
              borderRadius: 6,
              borderWidth: item.status === 'done' ? 0 : 2,
              borderColor: '#ccc',
              backgroundColor: item.status === 'done' ? '#10b981' : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {item.status === 'done' && (
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                ✓
              </Text>
            )}
          </Pressable>
          <Text
            style={{
              flex: 1,
              fontSize: 13,
              color: item.status === 'done' ? '#aaa' : inTopFive ? '#1a1a2e' : '#666',
              fontWeight: inTopFive ? '700' : '500',
              textDecorationLine: item.status === 'done' ? 'line-through' : 'none',
            }}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Pressable onPress={() => void handleRemove(item)} hitSlop={8}>
            <Text style={{ color: '#ccc', fontSize: 16 }}>🗑</Text>
          </Pressable>
        </View>
        {i === DAILY_CAP - 1 && planned.length > DAILY_CAP && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginTop: 4,
              marginBottom: 4,
            }}
          >
            <View style={{ flex: 1, height: 1, backgroundColor: '#ddd' }} />
            <Text
              style={{
                fontSize: 10,
                fontWeight: '800',
                color: '#888',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Top {DAILY_CAP} · below is waiting list
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: '#ddd' }} />
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <View
        style={{
          backgroundColor: '#fff',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          maxHeight: '85%',
          paddingBottom: 24,
        }}
      >
        <View
          style={{
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: '#eee',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <View>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '800',
                color: '#1a1a2e',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Today&apos;s 5
            </Text>
            <Text style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
              {completed} / {DAILY_CAP} done
              {planned.length > DAILY_CAP &&
                ` · ${planned.length - DAILY_CAP} queued`}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={{ color: '#aaa', fontSize: 22 }}>×</Text>
          </Pressable>
        </View>

        <View style={{ padding: 12 }}>
          {planned.length === 0 ? (
            <Text
              style={{
                textAlign: 'center',
                color: '#aaa',
                fontSize: 13,
                paddingVertical: 30,
              }}
            >
              Nothing picked for today yet. Tap ⭐ on a task card, or add one
              below.
            </Text>
          ) : (
            <View style={{ minHeight: Math.min(400, planned.length * 48) }}>
              <DraggableFlatList
                data={planned}
                keyExtractor={(t) => t.id}
                renderItem={renderItem}
                onDragEnd={({ data }) => void handleReorder(data)}
                activationDistance={10}
                scrollEnabled={false}
              />
            </View>
          )}

          {planned.length < DAILY_CAP && (
            <Pressable
              onPress={() => setPickerOpen((v) => !v)}
              style={{
                marginTop: 8,
                borderWidth: 1.5,
                borderColor: '#c4b5fd',
                borderStyle: 'dashed',
                backgroundColor: 'rgba(139,92,246,0.04)',
                borderRadius: 8,
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#8b5cf6', fontSize: 13, fontWeight: '700' }}>
                + Add a task to today ({DAILY_CAP - planned.length} slot
                {DAILY_CAP - planned.length === 1 ? '' : 's'} left)
              </Text>
            </Pressable>
          )}

          {pickerOpen && (
            <TaskPicker
              excludeDate={today}
              onPick={async (taskId) => {
                const maxOrder = planned.length
                  ? Math.max(...planned.map((t) => t.sort_order))
                  : 0;
                await setPlannedForDateBulk([
                  { id: taskId, planned_for_date: today },
                ]);
                await updateTask(taskId, { sort_order: maxOrder + 1 });
                setPickerOpen(false);
              }}
            />
          )}
        </View>
      </View>
    </View>
  );
}

function TaskPicker({
  excludeDate,
  onPick,
}: {
  excludeDate: string;
  onPick: (taskId: string) => void | Promise<void>;
}) {
  const tasks = useStore((s) => s.tasks);
  const [query, setQuery] = useState('');
  const candidates = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            t.planned_for_date !== excludeDate &&
            t.status !== 'done' &&
            t.title.toLowerCase().includes(query.toLowerCase()),
        )
        .slice()
        .sort((a, b) => {
          const p = priorityRank(b.priority) - priorityRank(a.priority);
          return p !== 0 ? p : a.sort_order - b.sort_order;
        })
        .slice(0, 20),
    [tasks, excludeDate, query],
  );
  return (
    <View
      style={{
        marginTop: 10,
        backgroundColor: '#fff',
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
        overflow: 'hidden',
      }}
    >
      <TextInput
        autoFocus
        value={query}
        onChangeText={setQuery}
        placeholder="Search tasks…"
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 13,
          borderBottomWidth: 1,
          borderBottomColor: '#eee',
        }}
      />
      <ScrollView style={{ maxHeight: 240 }}>
        {candidates.length === 0 ? (
          <Text
            style={{
              textAlign: 'center',
              color: '#aaa',
              fontSize: 12,
              paddingVertical: 16,
            }}
          >
            No matching tasks.
          </Text>
        ) : (
          candidates.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => void onPick(t.id)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: 'row',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  backgroundColor: 'rgba(0,0,0,0.06)',
                  borderRadius: 4,
                  paddingHorizontal: 5,
                  paddingVertical: 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '800',
                    color: '#666',
                    textTransform: 'uppercase',
                  }}
                >
                  {t.priority}
                </Text>
              </View>
              <Text style={{ flex: 1, fontSize: 13, color: '#1a1a2e' }}>
                {t.title}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function priorityRank(p: TaskType['priority']): number {
  switch (p) {
    case 'urgent':
      return 3;
    case 'high':
      return 2;
    case 'medium':
      return 1;
    default:
      return 0;
  }
}
