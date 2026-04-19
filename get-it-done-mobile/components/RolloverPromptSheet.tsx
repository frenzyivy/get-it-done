import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useStore } from '@/lib/store';
import { todayISO } from '@/lib/utils';
import type { TaskType } from '@/types';

// Mirror of web RolloverPromptModal. Shown once per calendar day when the
// user has past-planned tasks that are still open.
export function RolloverPromptSheet() {
  const tasks = useStore((s) => s.tasks);
  const profileV2 = useStore((s) => s.profileV2);
  const setPlannedForDateBulk = useStore((s) => s.setPlannedForDateBulk);
  const updateRolloverPromptDate = useStore((s) => s.updateRolloverPromptDate);

  const today = todayISO();

  const candidates: TaskType[] = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            t.planned_for_date !== null &&
            t.planned_for_date < today &&
            t.status !== 'done',
        )
        .sort((a, b) => {
          if (a.planned_for_date! > b.planned_for_date!) return -1;
          if (a.planned_for_date! < b.planned_for_date!) return 1;
          return a.sort_order - b.sort_order;
        }),
    [tasks, today],
  );

  const shouldShow =
    !!profileV2 &&
    profileV2.last_rollover_prompt_date !== today &&
    candidates.length > 0;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (shouldShow) setSelected(new Set(candidates.map((t) => t.id)));
  }, [shouldShow, candidates]);

  if (!shouldShow) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSkipAll = async () => {
    await updateRolloverPromptDate(today);
  };

  const handleConfirm = async () => {
    const updates = Array.from(selected).map((id) => ({
      id,
      planned_for_date: today,
    }));
    if (updates.length > 0) {
      await setPlannedForDateBulk(updates);
    }
    await updateRolloverPromptDate(today);
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={handleSkipAll}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.4)',
          padding: 16,
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 16,
            maxHeight: '80%',
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              paddingHorizontal: 20,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: '#eee',
            }}
          >
            <Text
              style={{ fontSize: 15, fontWeight: '800', color: '#1a1a2e' }}
            >
              Bring unfinished tasks to today?
            </Text>
            <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
              {candidates.length} task
              {candidates.length === 1 ? '' : 's'} from previous days weren&apos;t
              completed.
            </Text>
          </View>

          <ScrollView style={{ maxHeight: 420 }}>
            {candidates.map((t) => {
              const checked = selected.has(t.id);
              return (
                <Pressable
                  key={t.id}
                  onPress={() => toggle(t.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                  }}
                >
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      borderWidth: checked ? 0 : 2,
                      borderColor: '#ccc',
                      backgroundColor: checked ? '#8b5cf6' : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {checked && (
                      <Text
                        style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}
                      >
                        ✓
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ fontSize: 13, fontWeight: '700', color: '#1a1a2e' }}
                      numberOfLines={1}
                    >
                      {t.title}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
                      Planned for {t.planned_for_date}
                      {t.priority !== 'low' && ` · ${t.priority}`}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 20,
              paddingVertical: 14,
              borderTopWidth: 1,
              borderTopColor: '#eee',
              backgroundColor: '#fafafa',
            }}
          >
            <Text style={{ fontSize: 11, color: '#888' }}>
              {selected.size} selected
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={handleSkipAll}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 8,
                }}
              >
                <Text
                  style={{ fontSize: 13, fontWeight: '800', color: '#666' }}
                >
                  Skip all
                </Text>
              </Pressable>
              <Pressable
                onPress={handleConfirm}
                disabled={selected.size === 0}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: '#8b5cf6',
                  opacity: selected.size === 0 ? 0.5 : 1,
                }}
              >
                <Text
                  style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}
                >
                  Bring {selected.size} to today
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
