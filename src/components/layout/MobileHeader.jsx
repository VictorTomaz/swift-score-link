import { useLocation, Link, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import HeaderSetupButton from "@/components/HeaderSetupButton";

const rootRoutes = ["/Dashboard", "/SetupWizard", "/History", "/PlayersManagement", "/Settings"];

export default function MobileHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const isRoot = rootRoutes.some(route => location.pathname === route);

  return (
    <div className="md:hidden sticky top-0 z-40 bg-card border-b border-border flex items-center justify-between"
         style={{
           paddingTop: `max(0.75rem, env(safe-area-inset-top))`,
           paddingBottom: '0.75rem',
           paddingLeft: `max(1rem, env(safe-area-inset-left))`,
           paddingRight: `max(1rem, env(safe-area-inset-right))`,
         }}>
      {!isRoot ? (
        <button
          onClick={() => navigate("/Dashboard")}
          className="flex items-center gap-1 text-primary transition-colors min-h-[44px] -ml-1 pl-1"
          aria-label="Back to Dashboard"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Dashboard</span>
        </button>
      ) : (
        <Link to="/Dashboard" className="flex items-center gap-2">
          <img
            src="https://media.base44.com/images/public/69bb019558d96a11fbfbddce/6b353b4ba_B3883F9A-91A9-45CA-AFE4-AD5934ACC009.png"
            alt="Swift Score Golf"
            className="w-8 h-8 rounded-lg object-cover"
          />
          <span className="text-sm font-bold text-foreground">Swift Score Golf</span>
        </Link>
      )}
      <HeaderSetupButton />
    </div>
  );
}