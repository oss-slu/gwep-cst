import site from "../../content/site.json";

export function App() {
  return (
    <>
      <title>{site.name}</title>
      <main>
        <h1>{site.name}</h1>
      </main>
    </>
  );
}
