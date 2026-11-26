/// <reference types="@testing-library/jest-dom/vitest" />
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

// Registered on this file's own `expect`: importing '@testing-library/jest-dom/vitest' can
// reach a second copy of vitest's registry when the package is loaded outside the test runner.
expect.extend(matchers);
afterEach(() => cleanup());
