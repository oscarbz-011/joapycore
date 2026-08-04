import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../../common/types/jwt-payload.interface';

@Injectable()
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(socket: Socket) {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      socket.disconnect();
      return;
    }
    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.getOrThrow('JWT_ACCESS_SECRET'),
      });
      await socket.join(`tenant:${payload.tenantId}`);
      this.logger.log(
        `WS connected: ${socket.id} → tenant:${payload.tenantId}`,
      );
    } catch {
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {
    this.logger.debug(`WS disconnected: ${socket.id}`);
  }

  emitToTenant(tenantId: string, event: string, payload: unknown) {
    this.server
      .to(`tenant:${tenantId}`)
      .emit('ws-event', { type: event, payload });
  }
}
