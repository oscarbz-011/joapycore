import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ContactType,
  ConversationsRepository,
} from './conversations.repository';
import {
  CommunicationNoteDto,
  CommunicationPageDto,
  ConversationsQueryDto,
} from './hub.dto';

type CustomerRow = NonNullable<
  Awaited<ReturnType<ConversationsRepository['customer']>>
>;

type MessageRow = Awaited<
  ReturnType<ConversationsRepository['messages']>
>[number];
type NoteRow = Awaited<ReturnType<ConversationsRepository['notes']>>[number];
type ThreadItem =
  | ({ kind: 'MESSAGE' } & MessageRow)
  | ({
      kind: 'NOTE';
      author: { firstName: string; lastName: string } | null;
    } & NoteRow);

function contactOf(type: ContactType, customer: CustomerRow) {
  return {
    type,
    id: customer.id,
    code: customer.customerCode,
    name: [
      customer.firstName,
      customer.secondFirstName,
      customer.lastName,
      customer.secondLastName,
    ]
      .filter(Boolean)
      .join(' '),
    email: customer.email,
    phone: customer.phone,
  };
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly repository: ConversationsRepository,
    private readonly events: EventEmitter2,
  ) {}

  private async requireEnabled(tenantId: string) {
    const settings = await this.repository.settings(tenantId);
    if (!settings?.enabled) {
      throw new ServiceUnavailableException(
        'El Centro de Comunicaciones está desactivado',
      );
    }
  }

  private async contact(tenantId: string, type: ContactType, id: string) {
    const customer = await this.repository.customer(tenantId, id);
    if (!customer) throw new NotFoundException('Contacto no encontrado');
    return contactOf(type, customer);
  }

  async list(tenantId: string, query: ConversationsQueryDto) {
    await this.requireEnabled(tenantId);
    const { page, limit, contactType, onlyProblems } = query;
    const search = query.search || undefined;
    const rows = await this.repository.list(tenantId, {
      contactType,
      onlyProblems,
      search,
      matchingContactIds: search
        ? await this.repository.customerIdsMatching(tenantId, search)
        : [],
      page,
      limit,
    });
    const ids = rows.map((row) => row.contactId);
    const [customers, lastMessages] = ids.length
      ? await Promise.all([
          this.repository.customers(tenantId, ids),
          this.repository.lastMessages(tenantId, ids),
        ])
      : [[], []];
    const customerById = new Map(customers.map((row) => [row.id, row]));
    const lastByContact = new Map(
      lastMessages.map((row) => [`${row.contactType}:${row.contactId}`, row]),
    );
    const items = rows.flatMap((row) => {
      const customer = customerById.get(row.contactId);
      if (!customer) return [];
      const last = lastByContact.get(`${row.contactType}:${row.contactId}`);
      return [
        {
          contact: contactOf(row.contactType, customer),
          messages: row.messages,
          notes: row.notes,
          problems: row.problems,
          lastAt: row.lastAt,
          lastMessage: last
            ? {
                id: last.id,
                subject: last.subject,
                status: last.status,
                createdAt: last.createdAt,
              }
            : null,
        },
      ];
    });
    return { items, total: rows[0]?.total ?? 0, page, limit };
  }

  async summary(tenantId: string) {
    await this.requireEnabled(tenantId);
    const groups = await this.repository.problemGroups(tenantId);
    return {
      problemConversations: groups.length,
      problemMessages: groups.reduce(
        (total, group) => total + group._count._all,
        0,
      ),
    };
  }

  async thread(
    tenantId: string,
    contactType: ContactType,
    contactId: string,
    query: CommunicationPageDto,
  ) {
    await this.requireEnabled(tenantId);
    const contact = await this.contact(tenantId, contactType, contactId);
    const { page, limit } = query;
    const [refs, total] = await Promise.all([
      this.repository.threadRefs(tenantId, contactType, contactId, page, limit),
      this.repository.threadTotal(tenantId, contactType, contactId),
    ]);
    const idsOf = (kind: 'MESSAGE' | 'NOTE') =>
      refs.filter((ref) => ref.kind === kind).map((ref) => ref.id);
    const [messages, notes] = await Promise.all([
      this.repository.messages(tenantId, idsOf('MESSAGE')),
      this.repository.notes(tenantId, idsOf('NOTE')),
    ]);
    const authors = await this.repository.users(tenantId, [
      ...new Set(notes.map((note) => note.createdBy)),
    ]);
    const authorById = new Map(authors.map((user) => [user.id, user]));
    const messageById = new Map(messages.map((row) => [row.id, row]));
    const noteById = new Map(notes.map((row) => [row.id, row]));
    const items: ThreadItem[] = [];
    for (const ref of refs) {
      const message = ref.kind === 'MESSAGE' && messageById.get(ref.id);
      const note = ref.kind === 'NOTE' && noteById.get(ref.id);
      if (message) items.push({ kind: 'MESSAGE', ...message });
      if (note) {
        const author = authorById.get(note.createdBy);
        items.push({
          kind: 'NOTE',
          ...note,
          author: author
            ? { firstName: author.firstName, lastName: author.lastName }
            : null,
        });
      }
    }
    return { contact, items, total, page, limit };
  }

  async createNote(
    tenantId: string,
    userId: string,
    contactType: ContactType,
    contactId: string,
    dto: CommunicationNoteDto,
  ) {
    await this.requireEnabled(tenantId);
    await this.contact(tenantId, contactType, contactId);
    const note = await this.repository.createNote({
      tenantId,
      contactType,
      contactId,
      body: dto.body.trim(),
      createdBy: userId,
    });
    this.events.emit('audit.log', {
      tenantId,
      userId,
      module: 'communications',
      action: 'note.created',
      resourceId: note.id,
      after: { entityType: contactType, entityId: contactId },
    });
    return note;
  }
}
