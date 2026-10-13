import type { ThemeId } from '../types/models';
import { classicTheme } from './classic/ClassicTheme';
import { presentTheme } from './present/PresentTheme';
import { adventTheme } from './advent/AdventTheme';
import { elegantTheme } from './elegant/ElegantTheme';
import type { ThemeModule } from './shared';

export const THEMES: Record<ThemeId, ThemeModule> = {
  classic: classicTheme,
  present: presentTheme,
  advent: adventTheme,
  elegant: elegantTheme,
};

export const getTheme = (id: ThemeId | string | undefined): ThemeModule => THEMES[(id as ThemeId) ?? 'classic'] ?? classicTheme;
