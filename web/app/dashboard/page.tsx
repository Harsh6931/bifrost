import { CostQualityScatter } from "@/components/dashboard/cost-quality-scatter";
import { ModelMixChart } from "@/components/dashboard/model-mix-chart";
import { ModelRegistryTable } from "@/components/dashboard/model-registry-table";
import { RequestsTable } from "@/components/dashboard/requests-table";
import { SavingsChart } from "@/components/dashboard/savings-chart";
import { StatsTiles } from "@/components/dashboard/stats-tiles";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Cost, quality and savings across every routed request.
        </p>
      </div>
      <StatsTiles />
      <div className="grid gap-6 lg:grid-cols-2">
        <SavingsChart />
        <ModelMixChart />
      </div>
      <CostQualityScatter />
      <RequestsTable />
      <ModelRegistryTable />
    </div>
  );
}
