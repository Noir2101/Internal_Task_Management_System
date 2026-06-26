# Giai đoạn 7 — Kế hoạch code và governance

> Hệ thống quản lý công việc nội bộ (Internal Task Management System)
> Tài liệu này biến hợp đồng đông cứng (Giai đoạn 1 tới 6) thành một **kế hoạch code**, và quan trọng hơn, thành một bộ **governance thực thi được** để giữ cho việc code trung thành với spine. Như các tài liệu trước, nó ghi lý do và đánh đổi cho từng quyết định lớn.
> Code thật viết bằng Claude Code. Tài liệu này cộng `CLAUDE.md` là input đông cứng cho việc đó.

---

## Bảng thuật ngữ

| Thuật ngữ | Nghĩa ngắn |
|---|---|
| walking skeleton | Lát mỏng xuyên hết stack, chạy được đầu-cuối, để wire mọi mảnh hạ tầng trước khi đắp tính năng. |
| keystone | Trục "thấy được so với được phép" của hợp đồng. Cơ chế scoped-load đẻ ra ranh giới 404 và 403. |
| scoped-load | Repo lọc sẵn theo nhóm cho người không phải admin. Là choke-point chung của phạm vi. |
| projection (phép chiếu) | Việc chọn lọc field từ domain để lộ ra response. Cố tình bỏ field và thêm field. |
| cổng cơ học (executable gate) | Một kiểm tra tự fail khi bất biến bị vi phạm. Ví dụ lint rule, test, provider. Khác một dòng checklist mà người phải nhớ. |
| fitness function | Một test/lint kiểm một ràng buộc kiến trúc, không phải một hành vi nghiệp vụ. Ví dụ "domain không import Prisma". |
| Clock provider | Một nguồn thời gian inject được, để mọi nơi dùng chung một mốc `now`. |
| seam (đường cắt để sẵn) | Một chỗ hoãn được, thêm sau mà không phải mổ lại lõi. |
| harness | Phần dàn dựng để lái Claude Code, gồm prompt và slash command. Dùng xong vứt được. |

---

## 0. Nguyên tắc: governance thực thi được, không phải prose

Hợp đồng Giai đoạn 6 có một triết lý gọn. Hợp đồng nên **làm cho cái sai trở nên bất khả**, thay vì chỉ mô tả cái đúng. Hình dạng stats ở mục 5 của hợp đồng là ví dụ. Nó không cho OVERDUE thành một bucket thứ tư tồn tại được, nên không cần ai nhớ luật đó.

Giai đoạn 7 áp đúng triết lý đó, nhưng cho **codebase và harness**, không chỉ cho API.

Đặt vấn đề cho rõ. Một cách giữ spine là viết hết bất biến vào `CLAUDE.md` rồi nhờ Claude Code nhớ và tuân mỗi lượt, cộng một lệnh tự-review diff. Cách này yếu một cách hệ thống. Một mô hình ngôn ngữ tự chấm output của chính nó theo một checklist nổi tiếng là dễ dãi. Rủi ro thật của giai đoạn này cũng không phải "quên một rule đã ghi". Nó là **drift tích luỹ rồi bị bắt muộn**, cộng với việc một agent giỏi **tự bịa đáp án cho chỗ spine để ngỏ**, vốn nguy hơn cãi một rule đã viết.

Nên nguyên tắc xuyên suốt Giai đoạn 7 là: mọi bất biến **cơ học hoá được** thì chuyển từ "checklist Claude tự grep" sang một **cổng tự fail**. Cái gì lint hoặc test bắt được thì để lint và test bắt, đừng nhét vào prompt review.

> Ghi chú phương pháp: cách này còn tách bạch hai loại artifact với hai vòng đời khác nhau. Ba cổng cơ học là **artifact production**, ship được và kể chuyện được khi phỏng vấn. Phần `.claude/` gồm prompt và command là **harness dùng xong vứt**. Đầu tư nặng vào cái đầu, giữ cái sau mỏng. Đây cũng là một câu trả lời cho "anh giữ chất lượng thế nào khi để AI viết code".

Hệ quả là `/check-spine` chỉ còn gánh phần **phán đoán** không cơ học hoá được. Ví dụ endpoint này có mang đúng một luật authz không, response này có đúng phép chiếu cố ý không.

---

## 1. Trình tự build

Nguyên tắc sắp xếp là **nền ngang trước, lát dọc sau**. Dựng xong hạ tầng dùng chung rồi mới đắp từng tính năng theo chiều dọc. Lý do là tránh phải quay lại sửa lõi mỗi lần thêm một module.

| Bước | Nội dung | Phụ thuộc và lý do thứ tự |
|---|---|---|
| 1 | Walking skeleton | Không phụ thuộc gì. Phải có trước để mọi bước sau cắm vào. |
| 2 | Auth (thin) | Cần bảng User và RefreshToken, có sau bước 1. Mọi module sau cần JWT claims và guard. |
| 3 | Common authz scaffold | Cần claims từ bước 2. Dựng primitive dùng chung trước khi có resource đầu tiên. |
| 4 | Tasks (deep) | Cần bảng User (có sau seed) và authz scaffold. Là trái tim, nên realize keystone tại đây. |
| 5 | Users và Teams (thin) | Cần `TaskQueryPort` và `Notifier` của Tasks, nên phải sau bước 4. |
| 6 | Stats (read-model) | Chỉ cần `TaskQueryPort`. Đắp sau khi Tasks ổn định. |
| 7 | Hardening | Gắn ở rìa, không cản các bước trước. |

Ba điểm trong bảng này cần nói rõ lý do, vì chúng là chỗ một trình tự ngây thơ hay sai.

**Bước 3 không chứa `TaskPolicy`.** Một phiên bản trước của kế hoạch gom scoped-load và `TaskPolicy` vào bước 3 như "primitive dùng chung". Đó là đặt sai tầng. `TaskPolicy` sống trong domain của Tasks, theo Giai đoạn 4 mục 3.3. scoped-load cho task chính là phần lọc-theo-nhóm bên trong `PrismaTaskRepository`, theo hợp đồng mục 3.2. Không thể dựng hai thứ này tách rời khỏi Tasks. Cái thật sự dùng chung và dựng được trước Tasks chỉ gồm guard vai trò, decorator current-user, hai domain-exception cộng chỗ map chúng sang HTTP, và một helper cho convention "miss thì 404, predicate fail thì 403". Convention đó áp chung cho tasks, users, teams, nhưng hiện thực theo từng module.

Ý đồ de-risk keystone sớm vẫn được giữ. Chỉ là keystone được **chứng minh khi lát dọc đầu tiên đáp xuống**, tức là khi Tasks landing ở bước 4. Lý do là keystone chỉ thành hình khi có một resource có-phạm-vi để gắn vào.

**Tasks đi trước Users và Teams.** Hướng phụ thuộc là lý do, không phải sở thích. Tasks chỉ cần *bảng* User, vốn có sau migration và seed. Ngược lại, luồng deactivate của Users trả về `orphanedTaskCount` và phát thông báo qua `Notifier`, mà hai thứ đó là artifact của Tasks. Đảo thứ tự sẽ buộc phải stub `orphanedTaskCount` và `Notifier` rồi quay lại sửa. Lý do duy nhất để đảo, là cần endpoint tạo data qua API, đã bị `seed.ts` vô hiệu, vì seed cho sẵn một ma trận fixture đầy đủ.

**Stats chỉ đọc qua `TaskQueryPort`.** Hợp đồng mục 5 chốt rằng Stats không thêm phụ thuộc sang Users. Nghĩa là query outer-join cho `byProgress` và `byAssignee` phải nằm sau một method của `TaskQueryPort`, hiện thực trong adapter Prisma của Tasks. Nếu StatsModule tự viết một query Prisma riêng join hai bảng, nó âm thầm phá invariant kiến trúc này. Đây là một mục bắt buộc trong `/check-spine`.

Vài nit nhỏ đã gấp vào bảng trên, nêu lại cho đủ. Migration đầu phải dùng `--create-only` cộng sửa tay raw-SQL, không phải `prisma migrate dev` thuần (xem §2.4). Middleware sinh `requestId` wire ngay ở bước 1 cùng exception filter, để envelope đủ field từ endpoint đầu. Phần map Prisma-error sang HTTP ở bước 7 chỉ là nhánh safety-net cho lỗi raw constraint, còn nhánh domain-exception sang HTTP phải dựng cùng mỗi module.

---

## 2. Ba cổng cơ học

Đây là phần thay kỷ luật mong manh bằng đảm bảo rẻ. Mỗi cổng dựng ở bước 1 hoặc bước 4, và `/check-spine` kiểm chúng tồn tại cộng xanh.

### 2.1. Cổng một, domain purity bằng fitness function

Bất biến quan trọng nhất của kiến trúc là domain của Tasks không biết Prisma và Nest. Biến nó thành lỗi build, không phải một dòng để nhớ. Một lint rule `no-restricted-imports` đủ làm việc đó, và nó là một câu chuyện phỏng vấn hiếm ở portfolio mức junior.

```js
// eslint.config.mjs — thêm hai override
{
  files: ['src/tasks/domain/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['@prisma/client', '@prisma/*'], message: 'domain không được biết Prisma — map ở adapter.' },
        { group: ['@nestjs/*'],                    message: 'domain thuần, không phụ thuộc framework.' },
        { group: ['**/infrastructure/**'],         message: 'mũi tên chỉ vào trong; domain không biết infrastructure.' },
      ],
    }],
  },
},
{
  files: ['src/stats/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['@prisma/client'], message: 'Stats chỉ đọc qua TaskQueryPort, không Prisma trực tiếp.' },
      ],
    }],
  },
}
```

### 2.2. Cổng hai, projection default-deny

Failure-mode số một của một bộ sinh code là serialize thẳng model Prisma ra response, tức là `return task`. Giết nó bằng cấu trúc, không bằng lời nhắc. Một mapper với `excludeExtraneousValues` biến projection thành mặc-định-từ-chối. Chỉ field được khai báo mới lộ ra.

```ts
// tasks/interface/dto/task.response.ts
import { Expose, Type, plainToInstance } from 'class-transformer';

class UserBrief {
  @Expose() id: string;
  @Expose() name: string;
}

export class TaskResponse {
  @Expose() id: string;
  @Expose() title: string;
  @Expose() description: string | null;
  @Expose() progress: string;
  @Expose() deadline: string | null;
  @Expose() overdue: boolean;                       // computed, gắn trước khi map
  @Expose() @Type(() => UserBrief) owner: UserBrief;
  @Expose() @Type(() => UserBrief) assignee: UserBrief;
  @Expose() createdAt: string;
  @Expose() updatedAt: string;
}

export const toTaskResponse = (src: unknown): TaskResponse =>
  plainToInstance(TaskResponse, src, { excludeExtraneousValues: true });
```

Cặp động cho cấu trúc đó là một test khẳng định field cấm không bao giờ lọt ra.

```ts
it('projection không lộ field nội tại', () => {
  const res: any = toTaskResponse({
    id: 'x', title: 't', passwordHash: 'H', deletedAt: new Date(), teamId: 'T',
    owner:    { id: 'o', name: 'O', passwordHash: 'H' },
    assignee: { id: 'a', name: 'A' },
  });
  expect(res.passwordHash).toBeUndefined();
  expect(res.deletedAt).toBeUndefined();
  expect(res.teamId).toBeUndefined();
  expect(res.owner.passwordHash).toBeUndefined();
});
```

### 2.3. Cổng ba, một Clock provider

OVERDUE suy ra ở hai nơi. Cờ `overdue` trong response, và filter `?overdue=` trong query. Nếu hai nơi dùng hai mốc thời gian khác nhau thì sinh bug lệch. Giai đoạn 4 mục 8.4 vốn đã muốn một nguồn `now` tính một lần mỗi request. Biến nó thành provider để hai nơi *không thể* lệch nhau về mặt cấu trúc.

```ts
// common/clock.ts
export const CLOCK = Symbol('CLOCK');
export interface Clock { now(): Date; }
export class SystemClock implements Clock { now() { return new Date(); } }
// module: { provide: CLOCK, useClass: SystemClock }
```

```ts
// use-case lấy now MỘT lần, truyền xuống cả cờ lẫn filter
const now = this.clock.now();
// DueStatus.isOverdue(task, now)         cho cờ
// TaskQueryPort.list({ ...filter, now })  cho predicate filter
```

```ts
// test bơm clock cố định, không phụ thuộc giờ máy
const fixed: Clock = { now: () => new Date('2026-06-24T00:00:00Z') };
```

### 2.4. Cổng bốn, ràng buộc DB không-model-được

Đây không phải cổng tự fail mà là một gotcha có nơi giữ. Schema có bốn object Prisma không biểu diễn được, nằm trong migration thủ công. Slash command `/migrate` giữ tri thức này, và `/check-spine` không gánh nó. Bốn object là hai CHECK, một partial unique cho leader, và một partial index cho OVERDUE. Bỏ qua thì seed vẫn chạy nhưng mất sạch bảo đảm mức database. SQL cụ thể nằm trong `/migrate`.

---

## 3. Walking slice của keystone, không chỉ của plumbing

Bước 1 chứng minh ống nước chạy thông, bằng một health check chạm database. Nhưng phần khó nhất của hệ này không phải ống nước, mà là keystone. Nên ngay khi Tasks landing ở bước 4, lát dọc đầu tiên nên là **đường hẹp nhất chứng minh keystone**, làm trước mọi endpoint khác.

Đường đó là `GET /tasks/:id`. Nó đi qua scoped-load, nên chứng minh được cả ba thứ một lúc. Ngoài nhóm thì trả 404. Trong nhóm nhưng predicate fail thì trả 403. Và response đi qua mapper projection. Khoá nó bằng test, rồi dùng làm template cho mọi endpoint sau copy theo.

> Lợi ích là de-risk đúng phần khó nhất trước, thay vì xây hết Tasks rồi mới phát hiện keystone sai ở cuối. Đây cũng là chỗ test-as-you-go của Giai đoạn 7 bắt đầu có giá trị.

---

## 4. Test ở Giai đoạn 7

Quyết định là **test-as-you-go, khoanh hẹp đúng keystone domain**. Coverage rộng để dành Giai đoạn 8.

Lý do khoanh hẹp truy thẳng về kiến trúc. Tasks đi sâu hexagonal chính vì cụm luật của nó đáng test biệt lập khỏi I/O, theo Giai đoạn 4 mục 2.2. Nên phần đáng test ngay bây giờ đúng bằng phần đó. Nó cũng là phần rủi-ro-cao nhất và dễ regression nhất khi Users, Teams, Stats đắp đè lên sau.

Phần test ngay trong Giai đoạn 7:

- `TaskPolicy`, mọi nhánh owner, assignee, cùng-nhóm.
- `DueStatus`, OVERDUE với clock cố định, gồm ca DONE-quá-hạn không overdue và deadline NULL không overdue.
- ownership khác assignment.
- keystone integration, `GET /tasks/:id` cho 404, 403, và projection đúng.

Phần cố tình để dành Giai đoạn 8:

- CRUD mỏng của Auth, Users, Teams.
- Coverage rộng, edge case không thuộc keystone, test e2e đầy đủ.

Test domain không cần database, vì dùng fake in-memory thay `PrismaTaskRepository`. Nếu một test domain đòi database thì đó là dấu hiệu sai tầng.

---

## 5. Lái Claude Code

Vòng làm việc cho mỗi module là **plan-mode, rồi người review đối chiếu hợp đồng, rồi execute**. Chạy `/check-spine` trước mỗi commit.

Bộ harness gồm các phần sau, mỗi phần một việc.

- `CLAUDE.md` ở root là spine chưng cất, đọc mỗi lượt, nên giữ gọn. Nó nhắc bất biến và trỏ cổng, không chép lại sáu doc.
- `src/tasks/CLAUDE.md` lồng là luật hexagonal, đặt cạnh module duy nhất đi sâu. Tách ra để root khỏi phình và để luật nằm đúng chỗ nó áp.
- `/check-spine` chạy cổng cơ học trước, rồi soi phần phán đoán, rồi flag chỗ spine để ngỏ.
- `/migrate` giữ tri thức raw-SQL và chặn lệnh xoá data.
- `/test` giữ kỷ luật chỉ-test-keystone của Giai đoạn 7.
- `settings.json` cho phép sẵn các lệnh an toàn, và **chặn** `db push`, `migrate reset`, force-push, để chúng luôn phải hỏi.

Luật số 0 của `CLAUDE.md` là quan trọng nhất trong các luật prose. Khi hợp đồng để ngỏ một chỗ, agent phải DỪNG và hỏi, không tự phát minh hợp đồng rồi đi tiếp.

---

## 6. Chống over-engineer, cái cố tình không làm

Để cho thấy ba cổng là tiết chế chứ không phải phình ra, đây là những thứ đã cân nhắc và loại. Ở một đồ án bốn module, chúng là nghi thức.

- Tự viết một eslint plugin riêng. `no-restricted-imports` có sẵn đã đủ.
- Contract-testing kiểu Pact. Một người làm, một frontend, không có consumer ngoài.
- Snapshot mọi response. Một projection test cho field cấm là đủ, snapshot toàn bộ là nhiễu.
- Mutation testing và coverage gate trong CI. Là chuyện của hệ lớn, không phải bản nộp 23 ngày.
- Subagents, MCP, hook phức tạp trong `.claude/`. Harness nên mỏng.

> Ranh giới chống over-engineer ở đây nhất quán với cả bốn tài liệu trước. Áp nguyên lý theo đòn bẩy, không theo giáo điều. Ba cổng đều thay một kỷ luật mong manh bằng một đảm bảo rẻ, không thêm một tầng mới.

---

## 7. Truy vết

Tài liệu này truy ngược về:

- **Giai đoạn 4** mục 2.2 (quy tắc đi sâu), mục 3 (cấu trúc Tasks), mục 4.1 (DIP chỉ ở Tasks), mục 8.4 (một nguồn thời gian).
- **Giai đoạn 6** mục 0 (hợp đồng làm cái sai bất khả), mục 3 (keystone), mục 5 (Stats chỉ qua port), mục 8.2 (projection), mục 7.4 (map constraint sang HTTP).
- **schema.prisma**, bốn object raw-SQL trong header.

Và là input cho việc code bằng Claude Code, cùng với `CLAUDE.md` và sáu doc spine.
