import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  accentVariants,
  normalizeSearch,
} from '../common/pagination/pagination';
import { PrismaService } from '../prisma/prisma.service';

export type ContactType = 'CUSTOMER';
export type ConversationRow = {
  contactType: ContactType;
  contactId: string;
  messages: number;
  notes: number;
  problems: number;
  lastAt: Date;
  total: number;
};
export type ThreadRef = { id: string; kind: 'MESSAGE' | 'NOTE' };

const PROBLEM_STATUSES = ['FAILED', 'UNKNOWN'] as const;
const CUSTOMER_SUMMARY = {
  id: true,
  customerCode: true,
  firstName: true,
  secondFirstName: true,
  lastName: true,
  secondLastName: true,
  email: true,
  phone: true,
} satisfies Prisma.CustomerSelect;
const THREAD_MESSAGE = {
  id: true,
  entityType: true,
  entityId: true,
  recipient: true,
  subject: true,
  bodyText: true,
  fromEmail: true,
  fromName: true,
  status: true,
  sentAt: true,
  lastError: true,
  requestedBy: true,
  createdAt: true,
} satisfies Prisma.CommunicationMessageSelect;

@Injectable()
export class ConversationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  settings(tenantId: string) {
    return this.prisma.communicationSettings.findUnique({
      where: { tenantId },
    });
  }

  list(
    tenantId: string,
    filter: {
      contactType?: ContactType;
      onlyProblems: boolean;
      search?: string;
      matchingContactIds: string[];
      page: number;
      limit: number;
    },
  ) {
    const like = filter.search ? `%${filter.search}%` : null;
    return this.prisma.$queryRaw<ConversationRow[]>`
      WITH events AS (
        SELECT contact_type, contact_id, created_at, 1 AS is_message,
               status IN ('FAILED', 'UNKNOWN') AS problem,
               (${like}::text IS NOT NULL AND (recipient ILIKE ${like} OR subject ILIKE ${like})) AS matches
        FROM communication_messages
        WHERE tenant_id = ${tenantId} AND contact_id IS NOT NULL
        UNION ALL
        SELECT contact_type, contact_id, created_at, 0, false, false
        FROM communication_notes
        WHERE tenant_id = ${tenantId} AND contact_id IS NOT NULL
      ), grouped AS (
        SELECT contact_type, contact_id,
               SUM(is_message)::int AS messages,
               (COUNT(*) - SUM(is_message))::int AS notes,
               (COUNT(*) FILTER (WHERE problem))::int AS problems,
               MAX(created_at) AS last_at,
               BOOL_OR(matches) AS matches
        FROM events
        GROUP BY contact_type, contact_id
      )
      SELECT contact_type AS "contactType", contact_id AS "contactId",
             messages, notes, problems, last_at AS "lastAt",
             (COUNT(*) OVER ())::int AS total
      FROM grouped
      WHERE (${filter.contactType ?? null}::text IS NULL OR contact_type = ${filter.contactType ?? null})
        AND (${filter.onlyProblems} = false OR problems > 0)
        AND (${like}::text IS NULL OR matches OR contact_id = ANY(${filter.matchingContactIds}::text[]))
      ORDER BY last_at DESC, contact_id
      LIMIT ${filter.limit} OFFSET ${(filter.page - 1) * filter.limit}`;
  }

  lastMessages(tenantId: string, contactIds: string[]) {
    return this.prisma.communicationMessage.findMany({
      where: { tenantId, contactId: { in: contactIds } },
      distinct: ['contactType', 'contactId'],
      orderBy: [
        { contactType: 'asc' },
        { contactId: 'asc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      select: {
        id: true,
        contactType: true,
        contactId: true,
        subject: true,
        status: true,
        createdAt: true,
      },
    });
  }

  problemGroups(tenantId: string) {
    return this.prisma.communicationMessage.groupBy({
      by: ['contactType', 'contactId'],
      where: {
        tenantId,
        contactId: { not: null },
        status: { in: [...PROBLEM_STATUSES] },
      },
      _count: { _all: true },
    });
  }

  customer(tenantId: string, id: string) {
    return this.prisma.customer.findFirst({
      where: { tenantId, id },
      select: CUSTOMER_SUMMARY,
    });
  }

  customers(tenantId: string, ids: string[]) {
    return this.prisma.customer.findMany({
      where: { tenantId, id: { in: ids } },
      select: CUSTOMER_SUMMARY,
    });
  }

  async customerIdsMatching(tenantId: string, search: string) {
    const words = search.split(/\s+/).filter(Boolean);
    const rows = await this.prisma.customer.findMany({
      where: {
        tenantId,
        AND: words.map((word) => ({
          OR: [
            { searchText: { contains: normalizeSearch(word) } },
            // Base creada sin migraciones: no tiene ese texto.
            {
              searchText: null,
              OR: accentVariants(word).flatMap((variant) => [
                {
                  firstName: {
                    contains: variant,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  lastName: { contains: variant, mode: 'insensitive' as const },
                },
              ]),
            },
          ],
        })),
      },
      select: { id: true },
      take: 500,
    });
    return rows.map((row) => row.id);
  }

  threadRefs(
    tenantId: string,
    contactType: ContactType,
    contactId: string,
    page: number,
    limit: number,
  ) {
    return this.prisma.$queryRaw<ThreadRef[]>`
      SELECT id, kind FROM (
        SELECT id, 'MESSAGE' AS kind, created_at FROM communication_messages
        WHERE tenant_id = ${tenantId} AND contact_type = ${contactType} AND contact_id = ${contactId}
        UNION ALL
        SELECT id, 'NOTE' AS kind, created_at FROM communication_notes
        WHERE tenant_id = ${tenantId} AND contact_type = ${contactType} AND contact_id = ${contactId}
      ) events ORDER BY created_at DESC, id DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}`;
  }

  async threadTotal(
    tenantId: string,
    contactType: ContactType,
    contactId: string,
  ) {
    const where = { tenantId, contactType, contactId };
    const [messages, notes] = await Promise.all([
      this.prisma.communicationMessage.count({ where }),
      this.prisma.communicationNote.count({ where }),
    ]);
    return messages + notes;
  }

  messages(tenantId: string, ids: string[]) {
    return this.prisma.communicationMessage.findMany({
      where: { tenantId, id: { in: ids } },
      select: THREAD_MESSAGE,
    });
  }

  notes(tenantId: string, ids: string[]) {
    return this.prisma.communicationNote.findMany({
      where: { tenantId, id: { in: ids } },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        body: true,
        createdBy: true,
        createdAt: true,
      },
    });
  }

  users(tenantId: string, ids: string[]) {
    return this.prisma.user.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true, firstName: true, lastName: true },
    });
  }

  createNote(data: {
    tenantId: string;
    contactType: ContactType;
    contactId: string;
    body: string;
    createdBy: string;
  }) {
    return this.prisma.communicationNote.create({
      data: {
        ...data,
        entityType: data.contactType,
        entityId: data.contactId,
      },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        body: true,
        createdBy: true,
        createdAt: true,
      },
    });
  }
}
