interface SeverityBadgeProps {
  severity: 'high' | 'medium' | 'low';
}

const styles = {
  high: 'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-blue-50 text-blue-700 border-blue-200',
};

export default function SeverityBadge({ severity }: SeverityBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${styles[severity]}`}>
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
}

export function EffortBadge({ effort }: { effort: 'easy' | 'medium' | 'harder' }) {
  const effortStyles = {
    easy: 'bg-green-50 text-green-700 border-green-200',
    medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    harder: 'bg-gray-50 text-gray-600 border-gray-200',
  };

  const labels = { easy: 'Quick fix', medium: 'Moderate effort', harder: 'Larger effort' };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${effortStyles[effort]}`}>
      {labels[effort]}
    </span>
  );
}
