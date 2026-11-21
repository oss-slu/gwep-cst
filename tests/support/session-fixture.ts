/**
 * A valid session object for tests that use the test slide types in
 * test-slides.ts; override any top-level field.
 */
export function validSession(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    slug: "orientation",
    number: 9,
    title: "Fixture: Orientation",
    slides: [
      { type: "test-text", id: "welcome", text: "Fixture text" },
      {
        type: "test-media",
        id: "landmark-1",
        notes: "Fixture facilitator note",
        image: {
          src: "/media/orientation/landmark-1.jpg",
          alt: "Fixture image description",
          width: 1600,
          height: 1200,
        },
        sound: {
          src: "/media/orientation/birdsong.mp3",
          description: "Fixture sound description",
        },
      },
    ],
    ...overrides,
  };
}
