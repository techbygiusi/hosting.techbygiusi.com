/**
 * Input hardening.
 *
 * The data layer is fully parameterised (every query passes values as bound `?`
 * placeholders, never string concatenation), so SQL injection is already
 * structurally impossible. What this module adds is the layer above that:
 *
 *  - reject payload shapes the route handlers do not expect, so a body like
 *    `{"email": {"trim": 1}}` fails as a clean 400 instead of throwing a
 *    TypeError deep inside a handler and surfacing as a 500,
 *  - block prototype-pollution keys before any object reaches application code,
 *  - cap object depth and key counts so a deeply nested body cannot burn CPU,
 *  - give routes typed accessors (asString/asInt/asEnum/...) that coerce and
 *    bound every value at the edge.
 *
 * Anywhere an SQL *identifier* (a column or a fixed clause) genuinely has to be
 * dynamic, use `safeIdentifier` with an explicit allowlist. Identifiers can
 * never be bound as parameters, so an allowlist is the only safe construction.
 */

const { HTTP_STATUS } = require('../config/constants');
const { AppError } = require('./errorHandler');

const MAX_DEPTH = 12;
const MAX_KEYS_PER_OBJECT = 200;
const MAX_ARRAY_LENGTH = 1000;
const MAX_STRING_LENGTH = 200000; // generous: wiki article bodies live in here
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/* ------------------------------------------------------------- SANITISER */

/**
 * Walk a parsed JSON body and reject anything structurally hostile.
 * Runs once per request, before any route sees the payload.
 */
function assertSafeShape(value, depth = 0) {
  if (depth > MAX_DEPTH) {
    throw new AppError('Request payload is nested too deeply', HTTP_STATUS.BAD_REQUEST);
  }

  if (value === null || value === undefined) return;

  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) {
      throw new AppError('A field in the request is too long', HTTP_STATUS.BAD_REQUEST);
    }
    return;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return;

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) {
      throw new AppError('A list in the request has too many entries', HTTP_STATUS.BAD_REQUEST);
    }
    for (const entry of value) assertSafeShape(entry, depth + 1);
    return;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length > MAX_KEYS_PER_OBJECT) {
      throw new AppError('An object in the request has too many fields', HTTP_STATUS.BAD_REQUEST);
    }
    for (const key of keys) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new AppError('Request contains a forbidden field name', HTTP_STATUS.BAD_REQUEST);
      }
      assertSafeShape(value[key], depth + 1);
    }
    return;
  }

  throw new AppError('Unsupported value type in request', HTTP_STATUS.BAD_REQUEST);
}

function sanitizeRequest(req, res, next) {
  try {
    if (req.body !== undefined) assertSafeShape(req.body);
    if (req.query !== undefined) assertSafeShape(req.query);
    next();
  } catch (err) {
    next(err);
  }
}

/* --------------------------------------------------------- TYPED READERS */

/**
 * Coerce to a trimmed string. Objects and arrays are rejected rather than
 * stringified, so `{"email":{}}` can never become the string "[object Object]".
 */
function asString(value, { field = 'value', max = 2000, min = 0, required = false, allowEmpty = true } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new AppError(`${field} is required`, HTTP_STATUS.BAD_REQUEST);
    return '';
  }
  if (typeof value === 'number' || typeof value === 'boolean') value = String(value);
  if (typeof value !== 'string') {
    throw new AppError(`${field} must be a text value`, HTTP_STATUS.BAD_REQUEST);
  }

  const trimmed = value.trim();
  if (!trimmed && !allowEmpty) throw new AppError(`${field} must not be empty`, HTTP_STATUS.BAD_REQUEST);
  if (required && !trimmed) throw new AppError(`${field} is required`, HTTP_STATUS.BAD_REQUEST);
  if (trimmed.length > max) throw new AppError(`${field} is too long (max. ${max} characters)`, HTTP_STATUS.BAD_REQUEST);
  if (trimmed.length < min) throw new AppError(`${field} is too short (min. ${min} characters)`, HTTP_STATUS.BAD_REQUEST);
  return trimmed;
}

function asInt(value, { field = 'value', min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, required = false, fallback = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new AppError(`${field} is required`, HTTP_STATUS.BAD_REQUEST);
    return fallback;
  }
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new AppError(`${field} must be a number`, HTTP_STATUS.BAD_REQUEST);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new AppError(`${field} must be a whole number`, HTTP_STATUS.BAD_REQUEST);
  if (parsed < min || parsed > max) throw new AppError(`${field} must be between ${min} and ${max}`, HTTP_STATUS.BAD_REQUEST);
  return parsed;
}

function asId(value, field = 'id') {
  return asInt(value, { field, min: 1, max: Number.MAX_SAFE_INTEGER, required: true });
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function asEnum(value, allowed, { field = 'value', fallback = null, required = false } = {}) {
  const normalized = asString(value, { field, max: 200 }).toLowerCase();
  if (!normalized) {
    if (required) throw new AppError(`${field} is required`, HTTP_STATUS.BAD_REQUEST);
    return fallback;
  }
  const match = allowed.find(entry => String(entry).toLowerCase() === normalized);
  if (match === undefined) {
    throw new AppError(`${field} must be one of: ${allowed.join(', ')}`, HTTP_STATUS.BAD_REQUEST);
  }
  return match;
}

/** RFC-pragmatic e-mail check: shape only, no DNS. Always lowercased. */
function asEmail(value, { field = 'email', required = true } = {}) {
  const email = asString(value, { field, max: 254, required }).toLowerCase();
  if (!email) return '';
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) {
    throw new AppError('Please enter a valid email address', HTTP_STATUS.BAD_REQUEST);
  }
  return email;
}

/**
 * Password policy for anything that sets a password. Deliberately length-first
 * (length beats character-class rules) with a small deny list for the passwords
 * that show up in every credential-stuffing corpus.
 */
const WEAK_PASSWORDS = new Set([
  'password', 'passwort', '12345678', '123456789', '1234567890',
  'qwertzuiop', 'qwertyuiop', 'admin123', 'password1', 'changeme',
  'letmein1', 'welcome1', 'hosting1'
]);

function assertPasswordPolicy(password, field = 'password') {
  if (typeof password !== 'string') {
    throw new AppError('The password must be a text value', HTTP_STATUS.BAD_REQUEST);
  }
  if (password.length < 10) {
    throw new AppError('The password must be at least 10 characters long', HTTP_STATUS.BAD_REQUEST);
  }
  if (password.length > 200) {
    throw new AppError('The password must not exceed 200 characters', HTTP_STATUS.BAD_REQUEST);
  }
  if (WEAK_PASSWORDS.has(password.toLowerCase())) {
    throw new AppError('This password is too common. Please choose a different one.', HTTP_STATUS.BAD_REQUEST);
  }
  return password;
}

/* --------------------------------------------------------- ROUTE PARAMS */

/**
 * Register numeric-id validation on a router. Any route carrying one of these
 * parameters gets the value checked (and normalised to an integer) before the
 * handler runs, so a malformed id is a 400 rather than a query that silently
 * matches nothing.
 */
function registerIdParams(router, names = ['id', 'credId', 'publicationId', 'publication']) {
  for (const name of names) {
    router.param(name, (req, res, next, rawValue) => {
      try {
        req.params[name] = String(asId(rawValue, name));
        next();
      } catch (err) {
        next(err);
      }
    });
  }
}

/* ------------------------------------------------------ SQL IDENTIFIERS */

/**
 * Bound parameters cover values but never identifiers - a column name cannot be
 * passed as `?`. Where one has to be chosen at runtime, resolve it through this
 * allowlist so the only strings that can ever reach the SQL text are ones this
 * file spells out literally.
 */
function safeIdentifier(candidate, allowed, field = 'column') {
  const value = typeof candidate === 'string' ? candidate : '';
  if (!allowed.includes(value)) {
    throw new AppError(`Unsupported ${field}`, HTTP_STATUS.BAD_REQUEST);
  }
  return value;
}

module.exports = {
  sanitizeRequest,
  assertSafeShape,
  asString,
  asInt,
  asId,
  asBool,
  asEnum,
  asEmail,
  assertPasswordPolicy,
  registerIdParams,
  safeIdentifier
};
