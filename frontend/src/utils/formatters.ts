export const formatDateDDMMYYYY = (dateStr: string | null | undefined): string => {
  if (!dateStr || dateStr === 'N/A' || dateStr === '—' || dateStr === 'None' || dateStr === 'undefined' || dateStr === 'null') {
    return 'N/A';
  }
  const str = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const parts = str.split('T')[0].split('-');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};
