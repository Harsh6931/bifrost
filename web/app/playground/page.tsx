import { PlaygroundForm } from "@/components/playground-form";

export default function PlaygroundPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          Playground
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Point a prompt at Bifrost. The router picks the cheapest model that
          still answers well.
        </p>
      </div>
      <PlaygroundForm />
    </div>
  );
}
