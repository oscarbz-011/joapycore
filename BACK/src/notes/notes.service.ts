import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NoteDto, NoteView, UpdateNoteDto } from './notes.dto';
import { NotesRepository } from './notes.repository';

@Injectable()
export class NotesService {
  constructor(private readonly repository: NotesRepository) {}

  list(tenantId: string, userId: string, view: NoteView) {
    return this.repository.list(tenantId, userId, view);
  }

  async find(tenantId: string, userId: string, id: string) {
    const note = await this.repository.find(tenantId, userId, id);
    if (!note) throw new NotFoundException('Nota no encontrada');
    return note;
  }

  create(tenantId: string, userId: string, dto: NoteDto) {
    return this.repository.create(tenantId, userId, {
      title: dto.title,
      body: dto.body ?? '',
      priority: dto.priority ?? 'MEDIUM',
      starred: dto.starred ?? false,
    });
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateNoteDto,
  ) {
    const note = await this.find(tenantId, userId, id);
    if (note.trashedAt) {
      throw new BadRequestException(
        'La nota está en la papelera: restaurala para modificarla.',
      );
    }
    await this.repository.update(tenantId, userId, id, dto);
    return this.find(tenantId, userId, id);
  }

  async trash(tenantId: string, userId: string, id: string) {
    await this.find(tenantId, userId, id);
    await this.repository.update(tenantId, userId, id, {
      trashedAt: new Date(),
    });
    return this.find(tenantId, userId, id);
  }

  async restore(tenantId: string, userId: string, id: string) {
    await this.find(tenantId, userId, id);
    await this.repository.update(tenantId, userId, id, { trashedAt: null });
    return this.find(tenantId, userId, id);
  }

  /** Borrado definitivo: solo desde la papelera. */
  async remove(tenantId: string, userId: string, id: string) {
    const note = await this.find(tenantId, userId, id);
    if (!note.trashedAt) {
      throw new BadRequestException(
        'Enviá la nota a la papelera antes de eliminarla.',
      );
    }
    await this.repository.remove(tenantId, userId, id);
    return { deleted: true };
  }
}
