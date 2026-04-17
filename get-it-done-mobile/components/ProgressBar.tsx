import { View } from 'react-native';

interface Props {
  value: number;
  height?: number;
  accent?: string;
}

export function ProgressBar({ value, height = 6, accent }: Props) {
  const fill =
    accent ?? (value === 100 ? '#10b981' : value > 50 ? '#f59e0b' : '#8b5cf6');
  return (
    <View
      style={{
        width: '100%',
        height,
        borderRadius: height,
        backgroundColor: 'rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          height: '100%',
          borderRadius: height,
          backgroundColor: fill,
        }}
      />
    </View>
  );
}
