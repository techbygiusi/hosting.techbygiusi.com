const { HTTP_STATUS, ERROR_MESSAGES } = require('../config/constants');

/**
 * Errors deliberately raised by application code. Their messages are written
 * for the user and are safe to return verbatim.
 */
class AppError extends Error {
  constructor(message, status = HTTP_STATUS.INTERNAL_SERVER_ERROR) {
    super(message);
    this.status = status;
    this.error = 'AppError';
    this.expose = true;
  }
}

/**
 * Global error handler.
 *
 * The guiding rule: never let an internal message reach the client. A raw
 * SQLite error ("no such column: foo") or a driver stack trace hands an
 * attacker a free map of the schema, so anything that is not an explicit
 * AppError is logged in full server-side and answered with a generic message.
 */
function errorHandler(err, req, res, next) {
  let status = err?.status || err?.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    status = HTTP_STATUS.INTERNAL_SERVER_ERROR;
  }

  let error = 'Internal Server Error';
  let message = ERROR_MESSAGES.SERVER_ERROR;
  let exposed = false;

  // Application errors carry user-facing text by construction.
  if (err instanceof AppError || err?.expose === true) {
    error = err.error || 'AppError';
    message = err.message || ERROR_MESSAGES.SERVER_ERROR;
    exposed = true;
  }

  // Malformed JSON from body-parser: a client mistake, not a server fault.
  if (err?.type === 'entity.parse.failed') {
    status = HTTP_STATUS.BAD_REQUEST;
    error = 'Bad Request';
    message = 'The request body is not valid JSON';
    exposed = true;
  }

  if (err?.type === 'entity.too.large') {
    status = HTTP_STATUS.BAD_REQUEST;
    error = 'Payload Too Large';
    message = 'The request payload is too large';
    exposed = true;
  }

  // Database faults are summarised, never echoed.
  if (err?.code === 'SQLITE_CONSTRAINT') {
    status = HTTP_STATUS.CONFLICT;
    error = 'Conflict';
    message = 'This entry already exists or references a missing record';
    exposed = true;
  } else if (typeof err?.code === 'string' && err.code.startsWith('SQLITE_')) {
    status = HTTP_STATUS.INTERNAL_SERVER_ERROR;
    error = 'Internal Server Error';
    message = ERROR_MESSAGES.SERVER_ERROR;
    exposed = true;
  }

  if (err?.validationErrors) {
    // express-validator style results are safe: they describe the caller's own input.
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Validation Error',
      validationErrors: err.validationErrors
    });
  }

  // Log the real cause with enough request context to trace it, always.
  const requestContext = `${req?.method || '-'} ${req?.originalUrl || req?.path || '-'}`;
  if (status >= 500) {
    console.error(`Error [${requestContext}]:`, err);
  } else if (!exposed) {
    console.warn(`Handled error [${requestContext}]:`, err?.message || err);
  }

  const body = { error, message };
  // Stack traces only outside production, and only for genuine server faults.
  if (process.env.NODE_ENV === 'development' && err?.stack) {
    body.stack = err.stack;
  }

  res.status(status).json(body);
}

module.exports = {
  errorHandler,
  AppError
};
