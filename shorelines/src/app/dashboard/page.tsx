import { DashboardGate } from "@/components/dashboard/DashboardGate";
import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { StaffAuthProvider } from "@/components/dashboard/StaffAuthProvider";

/**
 * The couple's dashboard. A separate world from the guest app: staff sign in
 * with an email account carrying a `role` claim, guests never do.
 */
export default function DashboardPage() {
  return (
    <StaffAuthProvider>
      <DashboardGate>
        <DashboardHome />
      </DashboardGate>
    </StaffAuthProvider>
  );
}
