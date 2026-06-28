import { Progress } from './task.entity';

/**
 * OVERDUE là COMPUTED, không phải cột/status thứ tư/bucket (bất biến spine, docs/06 §4).
 *   OVERDUE ⟺ deadline != null AND deadline < now AND progress != DONE
 * - deadline NULL ⇒ KHÔNG bao giờ overdue.
 * - DONE-quá-hạn ⇒ KHÔNG overdue (đã xong thì không tính trễ).
 *
 * `now` truyền vào từ Clock (cổng 3) — MỘT mốc/request, dùng chung cho cờ `overdue` lẫn filter
 * `?overdue=` (cùng nguồn ⇒ không lệch). Hàm PURE để test bơm clock cố định, không phụ thuộc giờ máy.
 */
export const DueStatus = {
  isOverdue(
    task: { deadline: Date | null; progress: Progress },
    now: Date,
  ): boolean {
    return (
      task.deadline !== null &&
      task.deadline.getTime() < now.getTime() &&
      task.progress !== 'DONE'
    );
  },
};
