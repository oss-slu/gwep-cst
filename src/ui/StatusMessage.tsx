import type { ReactNode } from "react";
import { useFocusOnMount } from "./focus.ts";

/**
 * A heading, a sentence and actions, for errors and other notices. Focus moves
 * to the heading when it appears.
 */
export function StatusMessage({
  heading,
  text,
  level = 1,
  children,
}: {
  readonly heading: string;
  readonly text: string;
  readonly level?: 1 | 2;
  readonly children?: ReactNode;
}) {
  const ref = useFocusOnMount<HTMLHeadingElement>();
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className="status">
      <Heading ref={ref} tabIndex={-1} className="status__heading">
        {heading}
      </Heading>
      <p className="status__text">{text}</p>
      {children !== undefined && (
        <div className="status__actions">{children}</div>
      )}
    </div>
  );
}
