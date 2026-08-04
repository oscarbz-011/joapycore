import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsGateway } from './gateway/notifications.gateway';
import { WsBridgeListener } from './listeners/ws-bridge.listener';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  providers: [NotificationsGateway, WsBridgeListener],
  exports: [NotificationsGateway],
})
export class NotificationsModule {}
