import { PROGRAM } from '@club/shared';
import type { ProgramConfig } from '@club/shared';
export const program = PROGRAM;
export function applyTheme(config: ProgramConfig, element = document.documentElement) {
  for (const [key, value] of Object.entries(config.theme))
    element.style.setProperty('--' + key, value);
}
