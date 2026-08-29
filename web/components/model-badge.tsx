import { Badge } from "@/components/ui/badge";

type ModelBadgeProps = {
  model: string;
  mock?: boolean;
};

function displayName(model: string) {
  const slug = model.trim();
  if (!slug) {
    return "unknown";
  }
  const parts = slug.split("/");
  return parts[parts.length - 1] || slug;
}

export function ModelBadge({ model, mock = false }: ModelBadgeProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary" title={model} className="max-w-full font-mono">
        {displayName(model)}
      </Badge>
      {mock ? <Badge variant="outline">mock</Badge> : null}
    </div>
  );
}
