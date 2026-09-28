import { defineConfig } from "astro/config";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "productivity-os";

export default defineConfig({
  site: "https://producitivity-os.github.io",
  base: `/${repository}`,
  output: "static",
});
