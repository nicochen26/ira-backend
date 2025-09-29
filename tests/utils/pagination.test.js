const {
  PaginationValidationError,
  validatePaginationParams,
  validateSortParams,
  createPaginationResponse,
  getPaginationMeta,
  validateCursorParams,
  createCursorResponse,
  parseQueryParams
} = require('../../src/utils/pagination');

describe('Pagination Utilities', () => {
  describe('validatePaginationParams', () => {
    test('should return default values when no params provided', () => {
      const result = validatePaginationParams();
      expect(result).toEqual({
        page: 1,
        limit: 20,
        offset: 0
      });
    });

    test('should validate and normalize valid params', () => {
      const result = validatePaginationParams({ page: '2', limit: '10' });
      expect(result).toEqual({
        page: 2,
        limit: 10,
        offset: 10
      });
    });

    test('should throw error for invalid page', () => {
      expect(() => validatePaginationParams({ page: '0' }))
        .toThrow(PaginationValidationError);
      expect(() => validatePaginationParams({ page: '-1' }))
        .toThrow(PaginationValidationError);
      expect(() => validatePaginationParams({ page: 'invalid' }))
        .toThrow(PaginationValidationError);
    });

    test('should throw error for invalid limit', () => {
      expect(() => validatePaginationParams({ limit: '0' }))
        .toThrow(PaginationValidationError);
      expect(() => validatePaginationParams({ limit: '-1' }))
        .toThrow(PaginationValidationError);
      expect(() => validatePaginationParams({ limit: 'invalid' }))
        .toThrow(PaginationValidationError);
    });

    test('should enforce maximum limit', () => {
      expect(() => validatePaginationParams({ limit: '150' }))
        .toThrow(PaginationValidationError);
      expect(() => validatePaginationParams({ limit: '50' }, 40))
        .toThrow(PaginationValidationError);
    });

    test('should calculate correct offset', () => {
      const result = validatePaginationParams({ page: '3', limit: '15' });
      expect(result.offset).toBe(30);
    });
  });

  describe('validateSortParams', () => {
    test('should return default sort when no param provided', () => {
      const result = validateSortParams();
      expect(result).toEqual({
        field: 'createdAt',
        direction: 'desc'
      });
    });

    test('should parse valid sort param', () => {
      const result = validateSortParams('name:asc');
      expect(result).toEqual({
        field: 'name',
        direction: 'asc'
      });
    });

    test('should use desc as default direction', () => {
      const result = validateSortParams('name');
      expect(result).toEqual({
        field: 'name',
        direction: 'desc'
      });
    });

    test('should validate allowed fields', () => {
      const allowedFields = ['name', 'createdAt'];
      expect(() => validateSortParams('invalidField:asc', allowedFields))
        .toThrow(PaginationValidationError);
    });

    test('should validate sort direction', () => {
      expect(() => validateSortParams('name:invalid'))
        .toThrow(PaginationValidationError);
    });

    test('should accept case-insensitive direction', () => {
      const result = validateSortParams('name:ASC');
      expect(result.direction).toBe('asc');
    });
  });

  describe('createPaginationResponse', () => {
    const testData = [{ id: 1 }, { id: 2 }, { id: 3 }];

    test('should create correct pagination response', () => {
      const result = createPaginationResponse(testData, 1, 10, 25);
      expect(result).toEqual({
        data: testData,
        pagination: {
          page: 1,
          limit: 10,
          total: 25,
          totalPages: 3,
          hasNext: true,
          hasPrev: false
        },
        meta: {}
      });
    });

    test('should handle last page correctly', () => {
      const result = createPaginationResponse(testData, 3, 10, 25);
      expect(result.pagination).toEqual({
        page: 3,
        limit: 10,
        total: 25,
        totalPages: 3,
        hasNext: false,
        hasPrev: true
      });
    });

    test('should handle single page correctly', () => {
      const result = createPaginationResponse(testData, 1, 10, 3);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 3,
        totalPages: 1,
        hasNext: false,
        hasPrev: false
      });
    });

    test('should include meta data', () => {
      const meta = { sortBy: 'name', filters: {} };
      const result = createPaginationResponse(testData, 1, 10, 25, meta);
      expect(result.meta).toEqual(meta);
    });
  });

  describe('getPaginationMeta', () => {
    test('should calculate pagination metadata correctly', () => {
      const result = getPaginationMeta(2, 10, 25);
      expect(result).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3,
        hasNext: true,
        hasPrev: true
      });
    });
  });

  describe('validateCursorParams', () => {
    test('should validate cursor params', () => {
      const result = validateCursorParams('cursor123', 15);
      expect(result).toEqual({
        cursor: 'cursor123',
        limit: 15
      });
    });

    test('should use default limit', () => {
      const result = validateCursorParams('cursor123');
      expect(result.limit).toBe(20);
    });

    test('should validate limit', () => {
      expect(() => validateCursorParams('cursor', '150'))
        .toThrow(PaginationValidationError);
      expect(() => validateCursorParams('cursor', '0'))
        .toThrow(PaginationValidationError);
    });
  });

  describe('createCursorResponse', () => {
    const testData = [{ id: 1 }, { id: 2 }];

    test('should create cursor response', () => {
      const result = createCursorResponse(
        testData,
        'next123',
        'prev456',
        true,
        true,
        { sortBy: 'id' }
      );

      expect(result).toEqual({
        data: testData,
        pagination: {
          nextCursor: 'next123',
          prevCursor: 'prev456',
          hasNext: true,
          hasPrev: true
        },
        meta: { sortBy: 'id' }
      });
    });
  });

  describe('parseQueryParams', () => {
    test('should parse complete query params', () => {
      const queryParams = {
        page: '2',
        limit: '15',
        sort: 'name:asc',
        status: 'active',
        from: '2024-01-01',
        to: '2024-12-31'
      };

      const result = parseQueryParams(queryParams, {
        allowedSortFields: ['name', 'createdAt'],
        defaultSort: 'createdAt:desc',
        maxLimit: 50
      });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(15);
      expect(result.offset).toBe(15);
      expect(result.sort).toEqual({ field: 'name', direction: 'asc' });
      expect(result.filters.status).toBe('active');
      expect(result.filters.from).toBeInstanceOf(Date);
      expect(result.filters.to).toBeInstanceOf(Date);
    });

    test('should use defaults for missing params', () => {
      const result = parseQueryParams({}, {
        allowedSortFields: ['name'],
        defaultSort: 'name:desc'
      });

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.sort).toEqual({ field: 'name', direction: 'desc' });
    });

    test('should filter out undefined query params', () => {
      const result = parseQueryParams({
        page: '1',
        undefinedParam: undefined
      });

      expect(result.filters).toEqual({});
    });

    test('should handle date parsing', () => {
      const result = parseQueryParams({
        from: '2024-01-01T00:00:00Z',
        to: '2024-12-31T23:59:59Z'
      });

      expect(result.filters.from).toBeInstanceOf(Date);
      expect(result.filters.to).toBeInstanceOf(Date);
      expect(result.filters.from.getFullYear()).toBe(2024);
    });
  });
});