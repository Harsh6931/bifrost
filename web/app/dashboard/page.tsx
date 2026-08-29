import { CostQualityScatter } from "@/components/dashboard/cost-quality-scatter";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { ModelMixChart } from "@/components/dashboard/model-mix-chart";
import { ModelRegistryTable } from "@/components/dashboard/model-registry-table";
import { RequestsTable } from "@/components/dashboard/requests-table";
import { SavingsChart } from "@/components/dashboard/savings-chart";
import { StatsTiles } from "@/components/dashboard/stats-tiles";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <DashboardHeader />
      <StatsTiles />

      <section className="space-y-4">
        <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Where the money went
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <SavingsChart />
          <ModelMixChart />
        </div>
        <CostQualityScatter />
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Traffic
        </h2>
        <RequestsTable />
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Configuration
        </h2>
        <ModelRegistryTable />
      </section>
    </div>
  );
}
