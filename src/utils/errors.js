/**
 * Error kustom agar pesan jelas dan dapat dibedakan saat penanganan.
 */

export class AppError extends Error {
  constructor(message, { code = 'APP_ERROR', cause } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

export class ConfigError extends AppError {
  constructor(message, opts) {
    super(message, { code: 'CONFIG_ERROR', ...opts });
  }
}

export class DatabaseError extends AppError {
  constructor(message, opts) {
    super(message, { code: 'DATABASE_ERROR', ...opts });
  }
}

export class ScraperError extends AppError {
  constructor(message, opts) {
    super(message, { code: 'SCRAPER_ERROR', ...opts });
  }
}

export class ParseError extends AppError {
  constructor(message, opts) {
    super(message, { code: 'PARSE_ERROR', ...opts });
  }
}

export class PdfError extends AppError {
  constructor(message, opts) {
    super(message, { code: 'PDF_ERROR', ...opts });
  }
}

export class NotFoundError extends AppError {
  constructor(message, opts) {
    super(message, { code: 'NOT_FOUND', ...opts });
  }
}
