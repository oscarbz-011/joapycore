import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PosTerminalsRepository } from '../repositories/pos-terminals.repository';
import { CreatePosTerminalDto } from '../dto/create-pos-terminal.dto';
import { UpdatePosTerminalDto } from '../dto/update-pos-terminal.dto';

@Injectable()
export class PosTerminalsService {
  constructor(
    private readonly posTerminalsRepository: PosTerminalsRepository,
  ) {}

  findAll(tenantId: string) {
    return this.posTerminalsRepository.findAll(tenantId);
  }

  async findOne(tenantId: string, id: string) {
    const terminal = await this.posTerminalsRepository.findById(tenantId, id);
    if (!terminal) throw new NotFoundException('Caja no encontrada');
    return terminal;
  }

  async create(tenantId: string, dto: CreatePosTerminalDto) {
    try {
      return await this.posTerminalsRepository.create(tenantId, dto);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe una caja con ese nombre en esta sucursal',
        );
      }
      throw e;
    }
  }

  async update(tenantId: string, id: string, dto: UpdatePosTerminalDto) {
    await this.findOne(tenantId, id);
    return this.posTerminalsRepository.update(tenantId, id, dto);
  }
}
