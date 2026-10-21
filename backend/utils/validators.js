// utils/validators.js
// Small input-cleaning helpers shared by the controllers.

// returns a trimmed name, or null if it is empty / too long / has control characters
function cleanName(value) {
  const name = String(value === undefined || value === null ? "" : value).trim();
  if (!name || name.length > 60 || /[\u0000-\u001f]/.test(name)) return null;
  return name;
}

// returns a whole number from 0 to max, or null if the value isn't one
function parseCount(value, max) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
}

// "people affected" as typed in a form: a number or numeric text, 1 or more.
// A fraction is rounded down. Returns null if it isn't usable.
function parsePeople(value, max) {
  if (value === undefined || value === null || value === "") return null;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= max ? n : null;
}

module.exports = { cleanName, parseCount, parsePeople };
