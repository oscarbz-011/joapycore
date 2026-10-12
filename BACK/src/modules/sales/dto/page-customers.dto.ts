import { BaseFilterDto } from '../../../common/dto/base-filter.dto';

/**
 * Lista paginada de clientes. `q` busca por nombre, documento, código, email
 * o teléfono; `sortBy` acepta: code, name, documentType, document, phone,
 * email, city, status.
 */
export class PageCustomersDto extends BaseFilterDto {}
