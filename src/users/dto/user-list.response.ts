import { ApiProperty } from '@nestjs/swagger';
import { UserResponse } from './user.response';

/** Meta phân trang (docs/06 §4.2 — dùng lại cho /users). totalPages = ceil(total/limit). */
export class UserPaginationMeta {
  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;
}

/** Bọc list GET /users (§4.2/§9.2): { data: UserResponse[], meta }. data đã projection từng item. */
export class UserListResponse {
  @ApiProperty({ type: [UserResponse] })
  data: UserResponse[];

  @ApiProperty({ type: UserPaginationMeta })
  meta: UserPaginationMeta;
}
