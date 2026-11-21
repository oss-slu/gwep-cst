import { StatusMessage } from "../ui/StatusMessage.tsx";
import { BackToSessions } from "./BackToSessions.tsx";
import { ui } from "./copy.ts";

export function PageNotFound() {
  return (
    <main className="page">
      <StatusMessage {...ui.errors.pageNotFound}>
        <BackToSessions primary />
      </StatusMessage>
    </main>
  );
}
