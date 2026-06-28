import { Task } from '../domain/task.entity';

/**
 * Kết quả use-case đọc/ghi: domain Task + cờ `overdue` (computed bởi use-case từ Clock — cổng 3).
 * Interface layer map sang TaskResponse; application KHÔNG biết class-transformer (giữ chiều phụ thuộc).
 */
export interface TaskView {
  task: Task;
  overdue: boolean;
}
