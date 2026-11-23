import { Link } from "wouter";
import { ui } from "./copy.ts";
import { ArrowLeft } from "../ui/icons.tsx";
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
      <ArrowLeft />
      {ui.backToSessions}
    </Link>
  );
}
