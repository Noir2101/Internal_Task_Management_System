import { useParams } from 'react-router-dom';
import { TaskDetail } from '../features/tasks/TaskDetail';

/** Thin route wrapper: reads :id and hands it to the TaskDetail feature. */
export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <TaskDetail id={id} />;
}
