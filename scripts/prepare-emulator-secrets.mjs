import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const localPath = fileURLToPath(
  new URL("../functions/.secret.local", import.meta.url),
);
const examplePath = fileURLToPath(
  new URL("../functions/.secret.local.example", import.meta.url),
);

if (existsSync(localPath)) {
  console.log("Using the existing ignored functions/.secret.local file.");
} else {
  copyFileSync(examplePath, localPath, 0);
  console.log(
    "Created ignored functions/.secret.local with emulator-only dummy values.",
  );
}
