import { Link } from "wouter";
import { ui } from "./copy.ts";
import { HOME } from "./paths.ts";

export function BackToSessions({
  primary = false,
}: {
  readonly primary?: boolean;
}) {
  return (
    <Link
      href={HOME}
      className={primary ? "button" : "button button--secondary"}
    >
      {ui.backToSessions}
    </Link>
  );
}
