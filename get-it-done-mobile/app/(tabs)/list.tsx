import { ListView } from '@/components/ListView';
import { useUI } from '@/lib/ui-context';

export default function ListScreen() {
  const { openAddTask } = useUI();
  return <ListView onAdd={openAddTask} />;
}
