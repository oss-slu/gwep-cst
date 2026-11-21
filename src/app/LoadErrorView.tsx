import {
  ContentValidationError,
  SessionNotFoundError,
} from "../content/errors.ts";
import type { FallbackProps } from "../ui/ErrorBoundary.tsx";
import { StatusMessage } from "../ui/StatusMessage.tsx";
import { BackToSessions } from "./BackToSessions.tsx";
import { ui } from "./copy.ts";

function reloadPage() {
  window.location.reload();
}

/**
 * Explains why a session, slide or part of the app could not be shown.
 * Download failures offer "Try again" first. If that fails too, the browser
 * may be holding on to the failed download, so the next offer is "Reload
 * page", which keeps the current address.
 */
export function LoadErrorView({
  error,
  retry,
  retried,
  level = 1,
  backLink = true,
}: FallbackProps & {
  readonly level?: 1 | 2;
  readonly backLink?: boolean;
}) {
  const back = backLink ? <BackToSessions /> : undefined;
  const { errors } = ui;

  if (error instanceof SessionNotFoundError) {
    return (
      <StatusMessage level={level} {...errors.sessionNotFound}>
        {back}
      </StatusMessage>
    );
  }
  if (error instanceof ContentValidationError) {
    return (
      <StatusMessage level={level} {...errors.invalidContent}>
        {back}
      </StatusMessage>
    );
  }
  const { heading, text, retry: retryLabel, reload } = errors.loadFailed;
  return (
    <StatusMessage level={level} heading={heading} text={text}>
      {retried ? (
        <button type="button" className="button" onClick={reloadPage}>
          {reload}
        </button>
      ) : (
        <button type="button" className="button" onClick={retry}>
          {retryLabel}
        </button>
      )}
      {back}
    </StatusMessage>
  );
}
