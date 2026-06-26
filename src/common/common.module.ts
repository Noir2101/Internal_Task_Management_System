import { Global, Module } from '@nestjs/common';
import { CLOCK, SystemClock } from './clock';

/** Global — cung cấp Clock (cổng 3) cho mọi nơi cần `now()`. */
@Global()
@Module({
  providers: [{ provide: CLOCK, useClass: SystemClock }],
  exports: [CLOCK],
})
export class CommonModule {}
