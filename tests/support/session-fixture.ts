/** A valid session object for tests; override any top-level field. */
export function validSession(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    slug: "orientation",
    number: 9,
    title: "Fixture: Orientation",
    slides: [
      { type: "title", id: "welcome", heading: "Fixture heading" },
      {
        type: "reveal",
        id: "landmark-1",
        image: {
          src: "/media/orientation/landmark-1.jpg",
          alt: "Fixture image description",
        },
      },
    ],
    ...overrides,
  };
}
