import { labelTintBg } from '@/lib/utils';
import type { ProjectType } from '@/types';

interface Props {
  project: ProjectType | undefined;
}

// Secondary visual weight — no dot, no border, just a tinted pill. Archived
// projects render faded so stale labels don't scream for attention.
export function ProjectBadge({ project }: Props) {
  if (!project) return null;
  const faded = project.status === 'archived';
  return (
    <span
      className="inline-flex items-center px-[9px] py-[3px] rounded-md text-[11px] font-semibold"
      style={{
        backgroundColor: labelTintBg(project.color),
        color: project.color,
        opacity: faded ? 0.55 : 1,
      }}
      title={project.status === 'active' ? project.name : `${project.name} (${project.status})`}
    >
      {project.name}
    </span>
  );
}
