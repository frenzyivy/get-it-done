import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { aiClient, type AiSubtask, type AiTagSuggestion } from '@/lib/ai';

interface Props {
  taskTitle: string;
  selectedTagIds: string[];
  onAcceptSubtasks: (titles: string[]) => void;
  onAcceptTags: (tagIds: string[]) => void;
  onAcceptEstimate: (seconds: number) => void;
}

type Loading = 'none' | 'subtasks' | 'tags' | 'estimate';

export function AiSuggestionPanel({
  taskTitle,
  selectedTagIds,
  onAcceptSubtasks,
  onAcceptTags,
  onAcceptEstimate,
}: Props) {
  const [loading, setLoading] = useState<Loading>('none');
  const [subtasks, setSubtasks] = useState<AiSubtask[] | null>(null);
  const [tagSuggestions, setTagSuggestions] = useState<AiTagSuggestion[] | null>(null);
  const [estimate, setEstimate] = useState<{ seconds: number; reasoning: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canRun = taskTitle.trim().length >= 3;

  const run = async (which: Exclude<Loading, 'none'>) => {
    if (!canRun) return;
    setLoading(which);
    setError(null);
    try {
      if (which === 'subtasks') {
        const res = await aiClient.generateSubtasks(taskTitle);
        setSubtasks(res.subtasks);
      } else if (which === 'tags') {
        const res = await aiClient.smartTag(taskTitle);
        setTagSuggestions(res.suggestions);
      } else {
        const res = await aiClient.estimateTask(taskTitle, subtasks?.map((s) => s.title));
        setEstimate({ seconds: res.estimated_seconds, reasoning: res.reasoning });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading('none');
    }
  };

  const newTagSuggestions = (tagSuggestions ?? []).filter(
    (s) => !selectedTagIds.includes(s.tag_id),
  );

  return (
    <View
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#c4b5fd',
        backgroundColor: '#faf5ff',
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#7c3aed' }}>✨ AI assist</Text>
        <Text style={{ fontSize: 10, color: '#9ca3af' }}>Always optional</Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <AiButton
          label="Subtasks"
          loading={loading === 'subtasks'}
          disabled={!canRun || loading !== 'none'}
          onPress={() => run('subtasks')}
        />
        <AiButton
          label="Tags"
          loading={loading === 'tags'}
          disabled={!canRun || loading !== 'none'}
          onPress={() => run('tags')}
        />
        <AiButton
          label="Estimate"
          loading={loading === 'estimate'}
          disabled={!canRun || loading !== 'none'}
          onPress={() => run('estimate')}
        />
      </View>

      {error && <Text style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>{error}</Text>}

      {subtasks && subtasks.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Suggested subtasks
          </Text>
          <View style={{ marginTop: 4, gap: 2 }}>
            {subtasks.map((s, i) => (
              <Text key={i} style={{ fontSize: 13, color: '#374151' }}>
                • {s.title}
              </Text>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <PrimaryButton
              label="Add all"
              onPress={() => {
                onAcceptSubtasks(subtasks.map((s) => s.title));
                setSubtasks(null);
              }}
            />
            <SecondaryButton label="Dismiss" onPress={() => setSubtasks(null)} />
          </View>
        </View>
      )}

      {tagSuggestions && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Suggested tags
          </Text>
          {newTagSuggestions.length === 0 ? (
            <Text style={{ marginTop: 4, fontSize: 12, color: '#9ca3af' }}>
              No confident matches from your existing tags.
            </Text>
          ) : (
            <View style={{ marginTop: 4, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {newTagSuggestions.map((s) => (
                <Pressable
                  key={s.tag_id}
                  onPress={() => {
                    onAcceptTags([s.tag_id]);
                    setTagSuggestions((prev) => prev?.filter((x) => x.tag_id !== s.tag_id) ?? null);
                  }}
                  style={{
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: '#c4b5fd',
                    backgroundColor: '#fff',
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ fontSize: 12, color: '#7c3aed' }}>
                    + {s.name}{' '}
                    <Text style={{ fontSize: 10, color: '#9ca3af' }}>
                      {Math.round(s.confidence * 100)}%
                    </Text>
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      {estimate && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Suggested estimate
          </Text>
          <Text style={{ marginTop: 4, fontSize: 13, color: '#374151' }}>
            {Math.round(estimate.seconds / 60)} minutes
            {estimate.reasoning ? (
              <Text style={{ color: '#9ca3af' }}> — {estimate.reasoning}</Text>
            ) : null}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <PrimaryButton
              label="Use this estimate"
              onPress={() => {
                onAcceptEstimate(estimate.seconds);
                setEstimate(null);
              }}
            />
            <SecondaryButton label="Dismiss" onPress={() => setEstimate(null)} />
          </View>
        </View>
      )}
    </View>
  );
}

function AiButton({
  label,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#c4b5fd',
        backgroundColor: '#fff',
        paddingHorizontal: 10,
        paddingVertical: 6,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {loading && <ActivityIndicator size="small" color="#7c3aed" />}
      <Text style={{ fontSize: 12, fontWeight: '700', color: '#7c3aed' }}>{label}</Text>
    </Pressable>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ borderRadius: 8, backgroundColor: '#8b5cf6', paddingHorizontal: 12, paddingVertical: 6 }}
    >
      <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
    >
      <Text style={{ fontSize: 12, color: '#6b7280' }}>{label}</Text>
    </Pressable>
  );
}
