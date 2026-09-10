interface SectionHeadingProps {
  title: string
  description?: string
}

export function SectionHeading({ title, description }: SectionHeadingProps) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="h-px flex-1 bg-border" />
      {description && <span className="text-xs text-muted-foreground">{description}</span>}
    </div>
  )
}
