import { DashboardGate } from "@/components/dashboard/DashboardGate";
import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { StaffAuthProvider } from "@/components/dashboard/StaffAuthProvider";
import { getLiveWeddingSnapshot } from "@/lib/wedding/live";

/**
 * The couple's dashboard. A separate world from the guest app: staff sign in
 * with an email account carrying a `role` claim, guests never do.
 *
 * Read fresh rather than from the shared 60-second cache. This is the one page
 * whose reader is also its writer — showing someone their own edit as not yet
 * applied reads as a failed save and invites a second one.
 */
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { config, overlay } = await getLiveWeddingSnapshot({ fresh: true });

  return (
    <StaffAuthProvider>
      <DashboardGate>
        <DashboardHome config={config} overlay={overlay} />
      </DashboardGate>
    </StaffAuthProvider>
  );
}
