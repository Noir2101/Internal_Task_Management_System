import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { project } from '../common/projection';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccountDisabledException,
  InvalidCredentialsException,
  SessionExpiredException,
  TokenInvalidException,
} from './auth.exceptions';
import { AccessClaims } from './auth.types';
import { AuthUserResponse } from './dto/auth-user.response';
import { generateRawToken, newFamilyId, sha256 } from './tokens.util';

/** Refresh thô vừa cấp + hạn — controller dùng để set cookie (maxAge suy từ expiresAt). */
interface IssuedRefresh {
  raw: string;
  expiresAt: Date;
}
interface SessionResult {
  accessToken: string;
  refresh: IssuedRefresh;
}

/**
 * Auth thin: inject PrismaService trực tiếp (KHÔNG port — DIP chỉ ở Tasks).
 * Giữ các bất biến §6.3 (thứ tự kiểm login), §6.2/§05 §8.4 (rotation + reuse-detection),
 * và projection §6.2 (response qua project(), không serialize model Prisma).
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly refreshTtlMs: number;
  /** Hash argon2 hợp lệ để verify hằng-thời-gian khi email lạ (chống dò email qua timing, §6.3). */
  private dummyHash!: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    const days = Number(config.get<string>('REFRESH_TTL_DAYS') ?? '7');
    this.refreshTtlMs = days * 86_400_000;
  }

  async onModuleInit(): Promise<void> {
    // Sinh một lần, cùng option mặc định như seed → tham số cost khớp hash thật.
    this.dummyHash = await argon2.hash(generateRawToken());
  }

  /** §6.3 — thứ tự CẤM đảo: verify (luôn) → 401 chung; chỉ khi pass đúng mới xét isActive → 403. */
  async login(
    email: string,
    password: string,
  ): Promise<SessionResult & { user: AuthUserResponse }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // LUÔN verify (dummy khi email lạ), KHÔNG early-return → thời gian gần bằng nhau.
    const ok = await argon2.verify(
      user?.passwordHash ?? this.dummyHash,
      password,
    );
    if (!user || !ok) throw new InvalidCredentialsException();
    if (!user.isActive) throw new AccountDisabledException();

    const refresh = await this.persistRefresh(
      this.prisma,
      user.id,
      newFamilyId(),
    );
    const accessToken = await this.signAccess(user);
    return { accessToken, refresh, user: project(AuthUserResponse, user) };
  }

  /**
   * §6.2 + §05 §8.4 — gộp MỌI lỗi → SESSION_EXPIRED (controller xoá cookie). Reuse KHÔNG code riêng.
   * Cụm tìm–kiểm–usedAt–đẻ-con trong một $transaction (atomic) để hai refresh đua nhau không cùng rotate.
   */
  async refresh(rawToken: string | undefined): Promise<SessionResult> {
    if (!rawToken) throw new SessionExpiredException();
    const tokenHash = sha256(rawToken);

    // KHÔNG throw bên trong $transaction: throw làm rollback → mất luôn revoke của reuse.
    // Trả outcome rồi mới quyết định throw sau khi commit.
    const outcome = await this.prisma.$transaction(async (tx) => {
      const token = await tx.refreshToken.findUnique({ where: { tokenHash } });
      const now = new Date();
      if (!token || token.revokedAt || token.expiresAt <= now) {
        return { kind: 'invalid' as const };
      }
      if (token.usedAt) {
        // REUSE: đã rotate mà trình lại → thu hồi cả family (phải COMMIT), buộc login lại (§8.4).
        await tx.refreshToken.updateMany({
          where: { familyId: token.familyId, revokedAt: null },
          data: { revokedAt: now },
        });
        return { kind: 'invalid' as const };
      }
      // CAS: chỉ rotate nếu token VẪN chưa dùng/chưa thu hồi → hai refresh đua nhau,
      // kẻ thua thấy count=0 (khoá hàng tuần tự hoá), không cùng rotate (§8.4).
      const claimed = await tx.refreshToken.updateMany({
        where: { id: token.id, usedAt: null, revokedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count === 0) {
        return { kind: 'invalid' as const };
      }
      const refresh = await this.persistRefresh(
        tx,
        token.userId,
        token.familyId,
      );
      return { kind: 'ok' as const, userId: token.userId, refresh };
    });

    if (outcome.kind !== 'ok') throw new SessionExpiredException();

    // Không kiểm isActive (quyết định: staleness ≤ access TTL; revoke đặt ở luồng deactivate, Bước 5).
    const user = await this.prisma.user.findUnique({
      where: { id: outcome.userId },
    });
    if (!user) throw new SessionExpiredException();
    const accessToken = await this.signAccess(user);
    return { accessToken, refresh: outcome.refresh };
  }

  /** §6.2 — idempotent: revoke token hiện tại nếu có; controller luôn xoá cookie + 204. */
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** §6.2 — danh tính từ DB (nguồn thật cho name/role/teamId, không từ claims có thể stale). */
  async me(sub: string): Promise<AuthUserResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!user) throw new TokenInvalidException();
    return project(AuthUserResponse, user);
  }

  private async signAccess(user: User): Promise<string> {
    const claims: AccessClaims = {
      sub: user.id,
      role: user.role,
      teamId: user.teamId,
    };
    return this.jwt.signAsync(claims);
  }

  /** Lưu một refresh (lưu SHA-256, không token thô); trả raw + expiresAt cho cookie. */
  private async persistRefresh(
    client: Prisma.TransactionClient,
    userId: string,
    familyId: string,
  ): Promise<IssuedRefresh> {
    const raw = generateRawToken();
    const expiresAt = new Date(Date.now() + this.refreshTtlMs);
    await client.refreshToken.create({
      data: { tokenHash: sha256(raw), userId, familyId, expiresAt },
    });
    return { raw, expiresAt };
  }
}
