import site from "../../content/site.json" with { type: "json" };

export function App() {
  return (
    <main>
      <h1>{site.name}</h1>
    </main>
  );
}
