import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ui } from "../../app/copy.ts";
import type { Image } from "../../content/schema.ts";
import "./slide-image.css";

type Status = "loading" | "loaded" | "failed" | "retrying";

/** The image and its variants as a srcset, widest first: "/a.jpg 1600w, ...". */
export function srcSet(image: Image): string {
  return [{ src: image.src, width: image.width }, ...(image.variants ?? [])]
    .sort((a, b) => b.width - a.width)
    .map((entry) => `${entry.src} ${String(entry.width)}w`)
    .join(", ");
}

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
  const retryButton = useRef<HTMLButtonElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  // True when the picture came back while the facilitator was still on the
  // retry button. That button then disappears, so focus moves to the
  // picture. If they had moved on (to Reveal or the player controls),
  // focus stays where they put it.
  const focusPicture = useRef(false);

  useEffect(() => {
    if (status !== "loaded" || !focusPicture.current) return;
    focusPicture.current = false;
    picture.current?.focus();
  }, [status]);

  const failed = status === "failed" || status === "retrying";
  const frame = {
    "--image-width": `${String(image.width)}px`,
    "--image-ratio": `${String(image.width)} / ${String(image.height)}`,
    "--image-shape": image.width / image.height,
  } as CSSProperties;

  return (
    <div className="slide-image" style={frame}>
      {status !== "failed" && (
        <img
          key={attempt}
          ref={picture}
          className={
            status === "loaded"
              ? "slide-image__picture"
              : "slide-image__picture slide-image__picture--pending"
          }
          src={image.src}
          srcSet={image.variants === undefined ? undefined : srcSet(image)}
          sizes="(min-width: 64rem) 50vw, 90vw"
          width={image.width}
          height={image.height}
          alt={image.alt}
          tabIndex={-1}
          onLoad={() => {
            if (status === "retrying") {
              focusPicture.current =
                document.activeElement === retryButton.current;
            }
            setStatus("loaded");
          }}
          onError={() => {
            setStatus("failed");
          }}
        />
      )}
      {failed && (
        <div className="slide-image__failed">
          <p className="slide-image__message">{ui.slides.image.failed}</p>
          {image.alt !== "" && <p className="slide-image__alt">{image.alt}</p>}
          <button
            ref={retryButton}
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
        </div>
      )}
    </div>
  );
}
