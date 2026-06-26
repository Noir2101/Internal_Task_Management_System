export {};

declare global {
  namespace Express {
    interface Request {
      /** Gắn bởi requestIdMiddleware; đi vào envelope lỗi để dò log. */
      requestId?: string;
    }
  }
}
