export function BrandName({ className = "" }: { className?: string }) {
  return <span className={`brand-word ${className}`.trim()}>MetaMed</span>;
}
