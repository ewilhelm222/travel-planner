import { requireChatGPTUser } from "./chatgpt-auth";
import PlannerShell from "./planner-shell";
export const dynamic = "force-dynamic";
export default async function Home() {
  await requireChatGPTUser("/");
  return <>
    <link rel="stylesheet" href="/planner.css" />
    <PlannerShell />
    <noscript>This planner needs JavaScript to save changes and keep an offline reading copy.</noscript>
  </>;
}
