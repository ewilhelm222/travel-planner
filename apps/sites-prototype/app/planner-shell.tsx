"use client";
import { useEffect } from "react";

export default function PlannerShell() {
  useEffect(() => {
    if (document.querySelector("#planner-script")) return;
    const script = document.createElement("script");
    script.id = "planner-script";
    script.src = "/planner.js";
    document.body.appendChild(script);
  }, []);
  return <div id="app"><main className="loading"><span className="wordmark">WAYPOINT</span><h1>Opening your trip…</h1><p>Loading the latest saved itinerary.</p></main></div>;
}
