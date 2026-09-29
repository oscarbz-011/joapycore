import { Injectable } from '@nestjs/common';
import { connect as connectNet, type Socket } from 'node:net';
import { connect as connectTls } from 'node:tls';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export interface ImapConnectionConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password?: string;
}

export interface IncomingImapMessage {
  uid: string;
  messageId?: string;
  senderName?: string;
  senderEmail: string;
  recipients: string;
  subject: string;
  bodyText: string;
  receivedAt: Date;
  isRead: boolean;
  starred: boolean;
}

export interface FetchedImapInbox {
  uidValidity: string;
  messages: IncomingImapMessage[];
}

const CONNECTION_TIMEOUT_MS = 15_000;

class ImapLineReader {
  private buffer = '';
  private readonly lines: string[] = [];
  private readonly waiters: Array<{
    resolve: (line: string) => void;
    reject: (error: Error) => void;
  }> = [];

  private readonly onData = (chunk: Buffer) => {
    this.buffer += chunk.toString('utf8');
    let separator = this.buffer.indexOf('\r\n');
    while (separator >= 0) {
      const line = this.buffer.slice(0, separator);
      this.buffer = this.buffer.slice(separator + 2);
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve(line);
      else this.lines.push(line);
      separator = this.buffer.indexOf('\r\n');
    }
  };

  private readonly onError = (error: Error) => {
    this.rejectWaiters(error);
  };

  private readonly onClose = () => {
    this.rejectWaiters(new Error('El servidor IMAP cerró la conexión'));
  };

  private rejectWaiters(error: Error) {
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }

  constructor(private readonly socket: Socket) {
    socket.on('data', this.onData);
    socket.on('error', this.onError);
    socket.on('close', this.onClose);
  }

  dispose() {
    this.socket.off('data', this.onData);
    this.socket.off('error', this.onError);
    this.socket.off('close', this.onClose);
  }

  nextLine(): Promise<string> {
    const line = this.lines.shift();
    if (line !== undefined) return Promise.resolve(line);
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve: (value: string) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
      };
      const timeout = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error('El servidor IMAP no respondió a tiempo'));
      }, CONNECTION_TIMEOUT_MS);
      this.waiters.push(waiter);
    });
  }

  async taggedResponse(tag: string): Promise<string> {
    for (;;) {
      const line = await this.nextLine();
      if (line.toUpperCase().startsWith(`${tag.toUpperCase()} `)) return line;
      if (line.toUpperCase().startsWith('* BYE')) {
        throw new Error('El servidor IMAP cerró la conexión');
      }
    }
  }
}

function waitForConnection(socket: Socket, event: 'connect' | 'secureConnect') {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      socket.destroy();
      reject(new Error('Tiempo de conexión IMAP agotado'));
    }, CONNECTION_TIMEOUT_MS);
    const onConnected = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off(event, onConnected);
      socket.off('error', onError);
    };
    socket.once(event, onConnected);
    socket.once('error', onError);
  });
}

function quoteImap(value: string) {
  if (/\r|\n/.test(value)) {
    throw new Error('Las credenciales IMAP contienen caracteres no válidos');
  }
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function expectGreeting(reader: ImapLineReader) {
  const greeting = await reader.nextLine();
  if (!/^\* (OK|PREAUTH)\b/i.test(greeting)) {
    throw new Error('El servidor no devolvió un saludo IMAP válido');
  }
  return /^\* PREAUTH\b/i.test(greeting);
}

async function runCommand(
  socket: Socket,
  reader: ImapLineReader,
  tag: string,
  command: string,
) {
  socket.write(`${tag} ${command}\r\n`, 'utf8');
  const response = await reader.taggedResponse(tag);
  if (!new RegExp(`^${tag} OK\\b`, 'i').test(response)) {
    throw new Error('El servidor IMAP rechazó la autenticación');
  }
}

@Injectable()
export class ImapConnectionService {
  async verify(config: ImapConnectionConfig): Promise<void> {
    let socket: Socket | undefined;
    let reader: ImapLineReader | undefined;
    try {
      if (config.secure) {
        const tlsSocket = connectTls({
          host: config.host,
          port: config.port,
          servername: config.host,
          rejectUnauthorized: true,
        });
        socket = tlsSocket;
        reader = new ImapLineReader(tlsSocket);
        await waitForConnection(tlsSocket, 'secureConnect');
      } else {
        const plainSocket = connectNet({
          host: config.host,
          port: config.port,
        });
        socket = plainSocket;
        reader = new ImapLineReader(plainSocket);
        await waitForConnection(plainSocket, 'connect');
      }

      socket.setTimeout(CONNECTION_TIMEOUT_MS, () => socket?.destroy());
      const preauthenticated = await expectGreeting(reader);

      if (!config.secure) {
        await runCommand(socket, reader, 'A001', 'STARTTLS');
        reader.dispose();
        const tlsSocket = connectTls({
          socket,
          servername: config.host,
          rejectUnauthorized: true,
        });
        socket = tlsSocket;
        reader = new ImapLineReader(tlsSocket);
        await waitForConnection(tlsSocket, 'secureConnect');
      }

      if (!preauthenticated) {
        if (!config.password) {
          throw new Error('La contraseña IMAP no está configurada');
        }
        const tag = config.secure ? 'A001' : 'A002';
        await runCommand(
          socket,
          reader,
          tag,
          `LOGIN ${quoteImap(config.user)} ${quoteImap(config.password)}`,
        );
        socket.write(`${config.secure ? 'A002' : 'A003'} LOGOUT\r\n`, 'utf8');
      }
    } finally {
      reader?.dispose();
      socket?.end();
      socket?.destroy();
    }
  }

  async fetchInbox(
    config: ImapConnectionConfig,
    limit = 100,
  ): Promise<FetchedImapInbox> {
    if (!config.password) {
      throw new Error('La contraseña IMAP no está configurada');
    }

    const client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      doSTARTTLS: config.secure ? undefined : true,
      auth: { user: config.user, pass: config.password },
      logger: false,
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: CONNECTION_TIMEOUT_MS,
      socketTimeout: 30_000,
      tls: { rejectUnauthorized: true },
    });

    let lock: { release: () => void } | undefined;
    try {
      await client.connect();
      lock = await client.getMailboxLock('INBOX');
      const uidValidity = client.mailbox
        ? String(client.mailbox.uidValidity)
        : '';
      if (!/^[1-9]\d*$/.test(uidValidity)) {
        throw new Error('El servidor IMAP no informó un UIDVALIDITY válido');
      }
      const exists = client.mailbox ? client.mailbox.exists : 0;
      if (!exists) return { uidValidity, messages: [] };

      const start = Math.max(1, exists - Math.max(1, limit) + 1);
      const messages: IncomingImapMessage[] = [];
      for await (const message of client.fetch(`${start}:*`, {
        uid: true,
        source: true,
        flags: true,
        internalDate: true,
      })) {
        if (!message.source) continue;
        const parsed = await simpleParser(message.source);
        const sender = parsed.from?.value[0];
        const recipients = Array.isArray(parsed.to)
          ? parsed.to.map((address) => address.text).join(', ')
          : parsed.to?.text;
        const receivedAt = new Date(
          parsed.date || message.internalDate || Date.now(),
        );
        const html = typeof parsed.html === 'string' ? parsed.html : '';
        const bodyText =
          parsed.text?.trim() ||
          html
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/\s{2,}/g, ' ')
            .trim();

        messages.push({
          uid: String(message.uid),
          messageId: parsed.messageId || undefined,
          senderName: sender?.name || undefined,
          senderEmail: sender?.address || 'remitente-desconocido',
          recipients: recipients || config.user,
          subject: parsed.subject?.trim() || '(Sin asunto)',
          bodyText: bodyText || '(Mensaje sin contenido de texto)',
          receivedAt: Number.isNaN(receivedAt.getTime())
            ? new Date()
            : receivedAt,
          isRead: message.flags?.has('\\Seen') ?? false,
          starred: message.flags?.has('\\Flagged') ?? false,
        });
      }
      return { uidValidity, messages };
    } finally {
      lock?.release();
      try {
        await client.logout();
      } catch {
        client.close();
      }
    }
  }
}
