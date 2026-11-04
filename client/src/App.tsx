import { useEffect, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { AtlasShell } from "./components/atlas/AtlasShell";
import CompanyProfileDrawer from "./components/atlas/CompanyProfileDrawer";
import AtlasOverview from "./pages/AtlasOverview";
import AtlasHub from "./pages/AtlasHub";
import AtlasMethodology from "./pages/AtlasMethodology";
import NotFound from "./pages/NotFound";
import AtlasMarketPrint from "./pages/AtlasMarketPrint";

export default function App() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [location] = useLocation();
  useEffect(() => {
    setCompanyId(null);
    window.scrollTo(0, 0);
  }, [location]);
  const printRegion = location.match(/^\/print\/([a-z0-9-]+)$/)?.[1];
  if (printRegion) return <ErrorBoundary><AtlasMarketPrint key={printRegion} regionId={printRegion} /></ErrorBoundary>;
  return (
    <ErrorBoundary>
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>
      <AtlasShell profileOpen={!!companyId}>
        <Switch>
          <Route path="/" component={AtlasOverview} />
          <Route path="/hub/:regionId">
            {params => (
              <AtlasHub
                key={params.regionId}
                regionId={params.regionId}
                onCompany={setCompanyId}
              />
            )}
          </Route>
          <Route path="/methodology" component={AtlasMethodology} />
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </AtlasShell>
      <CompanyProfileDrawer
        id={companyId}
        onClose={() => setCompanyId(null)}
        onCompany={setCompanyId}
      />
    </ErrorBoundary>
  );
}
