export function PageCard({ title, children, className = '' }) {
  return (
    <div className={`bg-card rounded-xl border border-border shadow-sm p-6 ${className}`}>
      {title && <h2 className="text-lg font-bold mb-4">{title}</h2>}
      {children}
    </div>
  );
}
