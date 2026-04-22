import { forwardRef, useImperativeHandle, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

// Lightweight bottom-sheet action list. Used by TopAppBar's ⋮ overflow button
// so the user can reach Tags / Categories / Projects management without each
// needing its own header slot.
interface Action {
  label: string;
  icon?: string;
  onPress: () => void;
  destructive?: boolean;
}

export interface OverflowMenuHandle {
  open: (actions: Action[]) => void;
  close: () => void;
}

export const OverflowMenu = forwardRef<OverflowMenuHandle>(function OverflowMenu(
  _props,
  ref,
) {
  const [actions, setActions] = useState<Action[]>([]);
  const visible = actions.length > 0;

  useImperativeHandle(ref, () => ({
    open: (next) => setActions(next),
    close: () => setActions([]),
  }));

  const close = () => setActions([]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={close}>
      <Pressable
        onPress={close}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.3)',
          justifyContent: 'flex-end',
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: '#fff',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            paddingBottom: 28,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: '#e5e7eb',
              marginTop: 10,
              marginBottom: 8,
            }}
          />
          {actions.map((a, i) => (
            <Pressable
              key={i}
              onPress={() => {
                close();
                a.onPress();
              }}
              style={{
                paddingVertical: 14,
                paddingHorizontal: 20,
                borderBottomWidth: i < actions.length - 1 ? 1 : 0,
                borderBottomColor: '#f3f4f6',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              {a.icon && <Text style={{ fontSize: 16 }}>{a.icon}</Text>}
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '600',
                  color: a.destructive ? '#dc2626' : '#1a1a2e',
                }}
              >
                {a.label}
              </Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
});
