export function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not captured yet';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function formatCaptureFrequency(minutes: number) {
  if (minutes < 60) {
    return `Every ${minutes} min`;
  }

  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? 'Every hour' : `Every ${hours} hours`;
  }

  return `Every ${minutes} min`;
}

export function getAppDisplayTitle(input: {
  title: string | null;
  packageId: string;
}) {
  return input.title?.trim() || input.packageId;
}
