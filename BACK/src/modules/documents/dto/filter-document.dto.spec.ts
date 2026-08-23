import { plainToInstance } from 'class-transformer';
import { FilterDocumentDto } from './filter-document.dto';

describe('FilterDocumentDto', () => {
  it('transforms the query string "false" to boolean false', () => {
    const dto = plainToInstance(FilterDocumentDto, { isTemplate: 'false' });
    expect(dto.isTemplate).toBe(false);
  });

  it('transforms the query string "true" to boolean true', () => {
    const dto = plainToInstance(FilterDocumentDto, { isTemplate: 'true' });
    expect(dto.isTemplate).toBe(true);
  });

  it('leaves isTemplate undefined when not provided', () => {
    const dto = plainToInstance(FilterDocumentDto, {});
    expect(dto.isTemplate).toBeUndefined();
  });
});
