function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatCompactCrore(value: number): string {
  const crore = value / 10_000_000;
  return `₹${formatCompactNumber(crore)} Cr`;
}

function formatCompactLakh(value: number): string {
  const lakh = value / 100_000;
  return `₹${formatCompactNumber(lakh)} Lakh`;
}

export function formatInrCompact(value: number): string {
  if (value >= 10_000_000) {
    return formatCompactCrore(value);
  }

  if (value >= 100_000) {
    return formatCompactLakh(value);
  }

  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}
