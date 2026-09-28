// Masks RUT digits for on-screen samples, keeping the format, the first two digits and the verifier.
export function maskRut(value) {
  if (value === null || value === undefined) return value;
  const text = String(value);
  const digitPositions = [...text].flatMap((char, index) => (/\d/.test(char) ? [index] : []));
  const lastIndex = text.length - 1;
  const visible = new Set([...digitPositions.slice(0, 2), lastIndex]);

  return [...text].map((char, index) => (/\d/.test(char) && !visible.has(index) ? '•' : char)).join('');
}
