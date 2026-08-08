import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only auto-cleans when Vitest globals are enabled, which this
// project does not use — without this, renders leak between tests in a file.
afterEach(cleanup);
