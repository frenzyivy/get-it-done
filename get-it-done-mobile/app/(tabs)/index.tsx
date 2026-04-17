import { KanbanView } from '@/components/KanbanView';
import { useUI } from '@/lib/ui-context';

export default function BoardScreen() {
  const { openAddTask } = useUI();
  return <KanbanView onAdd={openAddTask} />;
}
