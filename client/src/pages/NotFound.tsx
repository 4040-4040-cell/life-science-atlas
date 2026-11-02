import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  useEffect(() => {
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex";
    document.head.appendChild(robots);
    if (window.location.pathname.replace(/\/$/, "") !== "/404")
      window.location.replace("/404");
    return () => robots.remove();
  }, []);
  return (
    <div className="atlas-not-found">
      <span className="eyebrow">404 / OUTSIDE THE INDEX</span>
      <h1>This location is not in the atlas.</h1>
      <p>
        The page may have moved, or the requested route is not part of this
        release.
      </p>
      <Link href="/" className="button">
        <ArrowLeft size={15} />
        Return to the regional index
      </Link>
    </div>
  );
}
