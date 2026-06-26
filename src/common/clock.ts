/**
 * Cổng cơ học 3 — một nguồn thời gian inject được.
 * OVERDUE suy ra ở hai nơi (cờ `overdue` + filter `?overdue=`); cả hai phải dùng
 * cùng một mốc `now` lấy MỘT lần mỗi request từ provider này (realize ở Bước 4).
 * Test bơm clock cố định để không phụ thuộc giờ máy.
 */
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
