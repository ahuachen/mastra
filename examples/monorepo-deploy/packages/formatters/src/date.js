export function formatDate(isoString) {
  return new Date(isoString).toISOString().slice(0, 10);
}
