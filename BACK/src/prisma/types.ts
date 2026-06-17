import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;
