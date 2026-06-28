import { ApiProperty } from '@nestjs/swagger';
import { TaskResponse } from './task.response';

/** Meta phân trang (docs/06 §4.2). `total` = COUNT trên tập đã lọc+scoped; totalPages = ceil(total/limit). */
export class PaginationMeta {
  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;
}

/** Bọc list (docs/06 §4.2): { data: TaskResponse[], meta }. data đã projection từng item. */
export class TaskListResponse {
  @ApiProperty({ type: [TaskResponse] })
  data: TaskResponse[];

  @ApiProperty({ type: PaginationMeta })
  meta: PaginationMeta;
}
