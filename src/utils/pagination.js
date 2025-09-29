/**
 * Pagination utilities for standardized API responses
 */

class PaginationValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PaginationValidationError';
  }
}

/**
 * Validate and normalize pagination parameters
 * @param {Object} params - Raw pagination parameters from query
 * @param {number} params.page - Page number (1-based)
 * @param {number} params.limit - Items per page
 * @param {number} maxLimit - Maximum allowed limit (default: 100)
 * @returns {Object} Normalized pagination parameters
 */
function validatePaginationParams(params = {}, maxLimit = 100) {
  let { page = 1, limit = 20 } = params;

  // Convert to numbers and validate
  page = parseInt(page, 10);
  limit = parseInt(limit, 10);

  if (isNaN(page) || page < 1) {
    throw new PaginationValidationError('Page must be a positive integer');
  }

  if (isNaN(limit) || limit < 1) {
    throw new PaginationValidationError('Limit must be a positive integer');
  }

  if (limit > maxLimit) {
    throw new PaginationValidationError(`Limit cannot exceed ${maxLimit}`);
  }

  const offset = (page - 1) * limit;

  return {
    page,
    limit,
    offset
  };
}

/**
 * Validate and normalize sort parameters
 * @param {string} sortParam - Sort parameter in format "field:direction"
 * @param {Array<string>} allowedFields - List of allowed sort fields
 * @param {string} defaultSort - Default sort parameter
 * @returns {Object} Normalized sort parameters
 */
function validateSortParams(sortParam, allowedFields = [], defaultSort = 'createdAt:desc') {
  const sort = sortParam || defaultSort;
  const [field, direction = 'desc'] = sort.split(':');

  if (allowedFields.length > 0 && !allowedFields.includes(field)) {
    throw new PaginationValidationError(`Invalid sort field. Allowed fields: ${allowedFields.join(', ')}`);
  }

  if (!['asc', 'desc'].includes(direction.toLowerCase())) {
    throw new PaginationValidationError('Sort direction must be "asc" or "desc"');
  }

  return {
    field,
    direction: direction.toLowerCase()
  };
}

/**
 * Create standardized pagination response
 * @param {Array} data - The data items for current page
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {number} total - Total number of items
 * @param {Object} meta - Additional metadata
 * @returns {Object} Standardized pagination response
 */
function createPaginationResponse(data, page, limit, total, meta = {}) {
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    },
    meta
  };
}

/**
 * Calculate pagination metadata without creating full response
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {number} total - Total number of items
 * @returns {Object} Pagination metadata
 */
function getPaginationMeta(page, limit, total) {
  const totalPages = Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
}

/**
 * Generate cursor-based pagination parameters for large datasets
 * @param {string} cursor - Current cursor position
 * @param {number} limit - Items per page
 * @returns {Object} Cursor pagination parameters
 */
function validateCursorParams(cursor, limit = 20) {
  limit = parseInt(limit, 10);

  if (isNaN(limit) || limit < 1) {
    throw new PaginationValidationError('Limit must be a positive integer');
  }

  if (limit > 100) {
    throw new PaginationValidationError('Limit cannot exceed 100');
  }

  return {
    cursor,
    limit
  };
}

/**
 * Create cursor-based pagination response
 * @param {Array} data - The data items
 * @param {string} nextCursor - Cursor for next page
 * @param {string} prevCursor - Cursor for previous page
 * @param {boolean} hasNext - Whether there are more items
 * @param {boolean} hasPrev - Whether there are previous items
 * @param {Object} meta - Additional metadata
 * @returns {Object} Cursor pagination response
 */
function createCursorResponse(data, nextCursor, prevCursor, hasNext, hasPrev, meta = {}) {
  return {
    data,
    pagination: {
      nextCursor,
      prevCursor,
      hasNext,
      hasPrev
    },
    meta
  };
}

/**
 * Parse query parameters for pagination and sorting
 * @param {Object} query - URL query parameters
 * @param {Object} options - Parsing options
 * @param {Array<string>} options.allowedSortFields - Allowed sort fields
 * @param {string} options.defaultSort - Default sort parameter
 * @param {number} options.maxLimit - Maximum allowed limit
 * @returns {Object} Parsed parameters
 */
function parseQueryParams(query = {}, options = {}) {
  const {
    allowedSortFields = [],
    defaultSort = 'createdAt:desc',
    maxLimit = 100
  } = options;

  const pagination = validatePaginationParams({
    page: query.page,
    limit: query.limit
  }, maxLimit);

  const sort = validateSortParams(query.sort, allowedSortFields, defaultSort);

  // Parse additional filters
  const filters = {};
  if (query.status) {
    filters.status = query.status;
  }
  if (query.from) {
    filters.from = new Date(query.from);
  }
  if (query.to) {
    filters.to = new Date(query.to);
  }

  return {
    ...pagination,
    sort,
    filters
  };
}

module.exports = {
  PaginationValidationError,
  validatePaginationParams,
  validateSortParams,
  createPaginationResponse,
  getPaginationMeta,
  validateCursorParams,
  createCursorResponse,
  parseQueryParams
};