import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { NoteView } from './notes.dto';

const NOTE = {
  id: true,
  title: true,
  body: true,
  priority: true,
  starred: true,
  trashedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserNoteSelect;

/** Toda consulta lleva empresa y usuario: una nota es de quien la escribió. */
@Injectable()
export class NotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, userId: string, view: NoteView) {
    return this.prisma.userNote.findMany({
      where: {
        tenantId,
        userId,
        trashedAt: view === 'trash' ? { not: null } : null,
        ...(view === 'starred' ? { starred: true } : {}),
      },
      select: NOTE,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 1000,
    });
  }

  find(tenantId: string, userId: string, id: string) {
    return this.prisma.userNote.findFirst({
      where: { tenantId, userId, id },
      select: NOTE,
    });
  }

  create(
    tenantId: string,
    userId: string,
    data: { title: string; body: string; priority: string; starred: boolean },
  ) {
    return this.prisma.userNote.create({
      data: { tenantId, userId, ...data },
      select: NOTE,
    });
  }

  update(
    tenantId: string,
    userId: string,
    id: string,
    data: Prisma.UserNoteUpdateManyMutationInput,
  ) {
    return this.prisma.userNote.updateMany({
      where: { tenantId, userId, id },
      data,
    });
  }

  remove(tenantId: string, userId: string, id: string) {
    return this.prisma.userNote.deleteMany({
      where: { tenantId, userId, id, trashedAt: { not: null } },
    });
  }
}
