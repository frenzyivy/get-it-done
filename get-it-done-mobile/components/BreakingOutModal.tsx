import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';

// Screen 3 — "Breaking Out (Strict)".
// Shown only when the user tries to end a No Mercy / Strict session before
// the planned duration completes. Forces the user to pick a reason and
// holds the "Leave" button disabled for 4 seconds (accessibility: the
// countdown is live-read).
//
// Writes happen in the parent via store.markSessionBroken(reason).

const REASONS = [
  { emoji: '🤒', label: 'Genuine emergency' },
  { emoji: '🚪', label: 'Need to leave this spot' },
  { emoji: '🙈', label: 'Just got distracted' },
];

interface Props {
  visible: boolean;
  elapsedSeconds: number;
  plannedSeconds: number | null;
  streak: number;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export function BreakingOutModal({
  visible,
  elapsedSeconds,
  plannedSeconds,
  streak,
  onCancel,
  onConfirm,
}: Props) {
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [customReason, setCustomReason] = useState('');
  const [countdown, setCountdown] = useState(4);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setPickedIndex(null);
      setCustomReason('');
      setCountdown(4);
      setSubmitting(false);
      return;
    }
    setCountdown(4);
    const id = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [visible]);

  const elapsedMin = Math.floor(elapsedSeconds / 60);
  const plannedMin = plannedSeconds ? Math.round(plannedSeconds / 60) : null;

  const reason = useMemo(() => {
    if (customReason.trim().length > 0) return customReason.trim();
    if (pickedIndex !== null) return REASONS[pickedIndex].label;
    return null;
  }, [customReason, pickedIndex]);

  const canLeave = countdown === 0 && reason !== null && !submitting;

  const handleLeave = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(reason);
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible
      animationType="fade"
      transparent
      onRequestClose={onCancel}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 420,
            backgroundColor: '#fff',
            borderRadius: 24,
            padding: 20,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: '#FDE0EA',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
            }}
          >
            <Text style={{ fontSize: 22 }}>⚠️</Text>
          </View>
          <Text
            style={{
              fontSize: 20,
              fontWeight: '800',
              color: '#1a1a2e',
              marginBottom: 6,
            }}
          >
            Leave this session?
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: '#555',
              lineHeight: 20,
            }}
          >
            {plannedMin !== null
              ? `You're ${elapsedMin}m into a ${plannedMin}m block. `
              : `You're ${elapsedMin}m into this session. `}
            <Text style={{ fontWeight: '800', color: '#E5447A' }}>
              Leaving marks this as a broken session
            </Text>
            {streak > 0 ? ` and ends your ${streak}-day streak.` : '.'}
          </Text>

          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: '#888',
              marginTop: 18,
              marginBottom: 8,
              letterSpacing: 0.5,
            }}
          >
            WHY ARE YOU LEAVING?
          </Text>

          {REASONS.map((r, i) => {
            const active = pickedIndex === i;
            return (
              <Pressable
                key={r.label}
                onPress={() => {
                  setPickedIndex(i);
                  setCustomReason('');
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  borderWidth: 2,
                  borderColor: active ? '#E5447A' : '#E5E5E5',
                  backgroundColor: active ? '#FFF1F5' : '#fff',
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  marginBottom: 8,
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text style={{ fontSize: 18 }}>{r.emoji}</Text>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '700',
                    color: '#1a1a2e',
                  }}
                >
                  {r.label}
                </Text>
              </Pressable>
            );
          })}

          <TextInput
            value={customReason}
            onChangeText={(t) => {
              setCustomReason(t);
              if (t.length > 0) setPickedIndex(null);
            }}
            placeholder="Or type your own reason…"
            placeholderTextColor="#999"
            style={{
              borderWidth: 1,
              borderColor: '#E5E5E5',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 13,
              color: '#1a1a2e',
              marginTop: 4,
            }}
          />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <Pressable
              onPress={onCancel}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: '#CCC',
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text
                style={{ fontSize: 13, fontWeight: '800', color: '#1a1a2e' }}
              >
                Stay focused
              </Text>
            </Pressable>
            <Pressable
              onPress={handleLeave}
              disabled={!canLeave}
              accessibilityLabel={
                countdown > 0
                  ? `Leave in ${countdown} seconds`
                  : 'Leave now'
              }
              accessibilityLiveRegion="polite"
              style={{
                flex: 1,
                backgroundColor: canLeave ? '#E5447A' : '#F5C6D4',
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '800',
                  color: '#fff',
                }}
              >
                {countdown > 0
                  ? `Leave in ${countdown}s…`
                  : !reason
                    ? 'Pick a reason'
                    : submitting
                      ? 'Leaving…'
                      : 'Leave'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
