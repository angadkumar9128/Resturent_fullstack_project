/** All money in this app is integer paise (₹1 = 100 paise). Format only at the UI edge. */
export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function toRupeesString(paise: number): string {
  return (paise / 100).toFixed(2);
}
