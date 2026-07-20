import { AppShell } from "@/components/app-shell";
import { WalletCenter } from "@/components/wallet-center";

export default function PurchasesPage() {
  return (
    <AppShell section="pm" eyebrow="Wallet" title="Wallet e transazioni">
      <WalletCenter />
    </AppShell>
  );
}
