import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, PlusCircle, History, Settings, Users, HelpCircle, UserCog, CalendarClock, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import PageHeader from "@/components/PageHeader";
import TourButton from "@/components/tour/TourButton";
import MobileHeader from "@/components/layout/MobileHeader";
import HeaderSetupButton from "@/components/HeaderSetupButton";
import { useCallback } from "react";

const publicNavItems = [
  { path: "/Dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/SetupWizard", label: "New Round / Setup", icon: PlusCircle },
  { path: "/PlayersManagement", label: "Players", icon: Users },
  { path: "/History", label: "History", icon: History },
  { path: "/CoursesManagement", label: "Courses", icon: Settings },
  { path: "/TeeSheet", label: "Tee Sheet", icon: CalendarClock },
  { path: "/Help", label: "How It Works", icon: HelpCircle },
  { path: "/Settings", label: "Settings", icon: UserCog },
];

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const navItems = publicNavItems;



  const mobileTabPaths = ["/Dashboard", "/SetupWizard", "/History", "/PlayersManagement", "/Settings"];

  const handleMobileNavTap = useCallback((e, path) => {
    if (location.pathname === path) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
  }, [location.pathname]);

  const mobileTabPathsSet = new Set(mobileTabPaths);
  const isTabRoute = mobileTabPathsSet.has(location.pathname);

  const mobileNavItems = [
    { path: "/Dashboard", label: "Home", icon: LayoutDashboard },
    { path: "/SetupWizard", label: "New Round", icon: PlusCircle },
    { path: "/History", label: "History", icon: History },
    { path: "/PlayersManagement", label: "Players", icon: Users },
    { path: "/Settings", label: "Settings", icon: UserCog },
  ];

  return (
    <div className="font-inter flex flex-col md:min-h-screen">
       <MobileHeader />

      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-xl hidden md:block flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link to="/Dashboard" className="flex items-center gap-2.5">
            <img
              src="https://media.base44.com/images/public/69bb019558d96a11fbfbddce/6b353b4ba_B3883F9A-91A9-45CA-AFE4-AD5934ACC009.png"
              alt="Swift Score Golf"
              className="w-10 h-10 rounded-xl object-cover"
            />
            <span className="text-lg font-bold tracking-tight text-foreground">Swift Score Golf</span>
          </Link>

          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-1">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all min-h-[44px]",
                    location.pathname === item.path
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              ))}
            </nav>
            <HeaderSetupButton />
          </div>
        </div>
      </header>

      {/* Content area */}
      <main className="flex-1" style={{ paddingBottom: isTabRoute ? 'calc(80px + max(20px, env(safe-area-inset-bottom)))' : '0px' }}>
           <PageHeader />

           {/* NOTE: Do NOT wrap <Outlet /> in <AnimatePresence> with key={location.pathname}.
               That forces a full unmount/remount on every tab switch, destroying scroll position
               and component state — fails the App Store "Bottom Tabs & Stack Preservation" scan.
               Tab switches must preserve state natively via React Router. */}
           <div
             className="w-full max-w-2xl md:max-w-7xl mx-auto px-4 py-6 md:py-8"
             style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))', boxSizing: 'border-box' }}
           >
             <Outlet />
           </div>
          <div className="md:hidden bg-card border-t border-border py-2.5 px-4 text-center text-xs font-medium text-muted-foreground mb-6"
                style={{
                  paddingLeft: `max(1rem, env(safe-area-inset-left))`,
                  paddingRight: `max(1rem, env(safe-area-inset-right))`,
                }}>
            <div className="mb-0.5">Swift Score Golf — Patent Pending</div>
            <Link to="/TermsAndPrivacy" className="text-primary hover:text-primary/80 underline underline-offset-2 text-xs">
              Terms & Privacy
            </Link>
          </div>
          <footer className="border-t border-border py-6 text-center mt-auto text-xs text-foreground space-y-2 md:space-y-0 hidden md:block">
            <div className="text-primary font-medium mb-2 md:mb-0">Swift Score Golf — Patent Pending</div>
            <Link to="/TermsAndPrivacy" className="text-foreground hover:text-primary underline underline-offset-2 transition-colors">
              Terms of Use &amp; Privacy Policy
            </Link>
          </footer>
      </main>

      {isTabRoute && (
      <nav className={cn("md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border")} style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))', paddingLeft: 'max(0px, env(safe-area-inset-left))', paddingRight: 'max(0px, env(safe-area-inset-right))' }}>
          <div className="flex w-full">
            {mobileNavItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={(e) => handleMobileNavTap(e, item.path)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 flex-1 transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                  style={{ minWidth: 0, minHeight: '44px', paddingTop: '6px', paddingBottom: '6px' }}
                  aria-current={isActive ? "page" : undefined}
                >
                  <item.icon className="flex-shrink-0 w-5 h-5" />
                  <span className={cn("text-center font-semibold text-xs leading-tight truncate px-0.5", isActive ? "text-primary" : "text-muted-foreground")}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}

    </div>
  );
}