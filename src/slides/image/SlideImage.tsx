import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ui } from "../../app/copy.ts";
import type { Image } from "../../content/schema.ts";
import { IMAGE_SIZES, srcSet } from "./sources.ts";
import "./slide-image.css";

type Status = "loading" | "loaded" | "failed" | "retrying";

/**
 * A slide picture. Its frame keeps the picture's shape from the content's
 * width and height, so nothing moves while it loads, fails or comes back.
 * If it fails, the frame shows the picture's description and a button to
 * load it again; the rest of the slide keeps working.
 */
export function SlideImage({ image }: { readonly image: Image }) {
  const [status, setStatus] = useState<Status>("loading");
  // Each attempt renders a new <img>, so the browser requests the file again.
  const [attempt, setAttempt] = useState(0);
  const failurePanel = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  // True when the picture came back while focus was still in the failure
  // panel (on Retry, or on the panel while reading the description). The
  // panel then disappears, so focus moves to the picture. If the
  // facilitator had moved on (to Reveal or the player controls), focus
  // stays where they put it.
  const focusPicture = useRef(false);

  useEffect(() => {
    if (status !== "loaded" || !focusPicture.current) return;
    focusPicture.current = false;
    picture.current?.focus();
  }, [status]);

  const failed = status === "failed" || status === "retrying";
  const frame = {
    "--image-width": `${String(image.width)}px`,
    "--image-shape": image.width / image.height,
  } as CSSProperties;

  return (
    <div className="slide-image-area">
      <div className="slide-image" style={frame}>
        {status !== "failed" && (
          <img
            key={attempt}
            ref={picture}
            className={
              status === "retrying"
                ? "slide-image__picture slide-image__picture--pending"
                : "slide-image__picture"
            }
            src={image.src}
            srcSet={image.variants === undefined ? undefined : srcSet(image)}
            sizes={IMAGE_SIZES}
            width={image.width}
            height={image.height}
            alt={image.alt}
            tabIndex={-1}
            onLoad={() => {
              if (status === "retrying") {
                focusPicture.current =
                  failurePanel.current?.contains(document.activeElement) ??
                  false;
              }
              setStatus("loaded");
            }}
            onError={() => {
              setStatus("failed");
            }}
          />
        )}
        {failed && (
          // Focusable, so a long description can be scrolled with the up and
          // down arrows or End (the player only uses left, right and the page
          // keys).
          <div
            ref={failurePanel}
            className="slide-image__failed"
            role="region"
            aria-label={ui.slides.image.failed}
            tabIndex={0}
          >
            <p className="slide-image__message">{ui.slides.image.failed}</p>
            <button
              type="button"
              className="button"
              aria-disabled={status === "retrying"}
              onClick={() => {
                if (status === "retrying") return;
                setStatus("retrying");
                setAttempt((count) => count + 1);
              }}
            >
              {status === "retrying"
                ? ui.slides.image.retrying
                : ui.slides.image.retry}
            </button>
            {image.alt !== "" && (
              <p className="slide-image__alt">{image.alt}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
