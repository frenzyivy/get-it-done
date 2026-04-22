import { Text, View } from 'react-native';
import { labelTintBg } from '@/lib/utils';
import type { ProjectType } from '@/types';

interface Props {
  project: ProjectType | undefined;
}

export function ProjectBadge({ project }: Props) {
  if (!project) return null;
  const faded = project.status === 'archived';
  return (
    <View
      style={{
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: labelTintBg(project.color),
        opacity: faded ? 0.55 : 1,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '600', color: project.color }}>
        {project.name}
      </Text>
    </View>
  );
}
