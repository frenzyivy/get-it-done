import { MD3LightTheme, MD3DarkTheme, type MD3Theme } from 'react-native-paper';

export const focus: MD3Theme = {
  ...MD3LightTheme,
  dark: false,
  roundness: 4,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#4F3DCC',
    onPrimary: '#FFFFFF',
    primaryContainer: '#E4DFFF',
    onPrimaryContainer: '#14006E',

    secondary: '#5F5C71',
    onSecondary: '#FFFFFF',
    secondaryContainer: '#E5DFF9',
    onSecondaryContainer: '#1B192B',

    tertiary: '#785A00',
    onTertiary: '#FFFFFF',
    tertiaryContainer: '#FFDF9E',
    onTertiaryContainer: '#261A00',

    error: '#BA1A1A',
    onError: '#FFFFFF',
    errorContainer: '#FFDAD6',
    onErrorContainer: '#410002',

    background: '#FDFAFF',
    onBackground: '#1B1B21',
    surface: '#FDFAFF',
    onSurface: '#1B1B21',
    surfaceVariant: '#E4E1EC',
    onSurfaceVariant: '#47464F',
    outline: '#77767F',
    outlineVariant: '#C8C5D0',

    elevation: {
      level0: 'transparent',
      level1: '#F6F3F9',
      level2: '#F0EDF4',
      level3: '#EAE7EF',
      level4: '#E7E4ED',
      level5: '#E4E1E9',
    },
  },
};

export const momentum: MD3Theme = {
  ...MD3DarkTheme,
  dark: true,
  roundness: 4,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#C8BFFF',
    onPrimary: '#22119A',
    primaryContainer: '#3B27B5',
    onPrimaryContainer: '#E4DFFF',

    secondary: '#C8C3DC',
    onSecondary: '#302E41',
    secondaryContainer: '#474458',
    onSecondaryContainer: '#E5DFF9',

    tertiary: '#F4BD4F',
    onTertiary: '#3F2E00',
    tertiaryContainer: '#5B4300',
    onTertiaryContainer: '#FFDF9E',

    error: '#FFB4AB',
    onError: '#690005',
    errorContainer: '#93000A',
    onErrorContainer: '#FFDAD6',

    background: '#131317',
    onBackground: '#E4E1E9',
    surface: '#131317',
    onSurface: '#E4E1E9',
    surfaceVariant: '#47464F',
    onSurfaceVariant: '#C8C5D0',
    outline: '#918F99',
    outlineVariant: '#47464F',

    elevation: {
      level0: 'transparent',
      level1: '#1B1B21',
      level2: '#1F1F26',
      level3: '#2A2A30',
      level4: '#2E2D34',
      level5: '#35343B',
    },
  },
};

export const type = {
  displaySmall: { fontSize: 36, lineHeight: 44, fontWeight: '400' as const },
  headlineLarge: { fontSize: 32, lineHeight: 40, fontWeight: '400' as const },
  headlineMedium: { fontSize: 28, lineHeight: 36, fontWeight: '400' as const },
  headlineSmall: { fontSize: 24, lineHeight: 32, fontWeight: '400' as const },
  titleLarge: { fontSize: 22, lineHeight: 28, fontWeight: '500' as const },
  titleMedium: { fontSize: 16, lineHeight: 24, fontWeight: '500' as const, letterSpacing: 0.15 },
  titleSmall: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const, letterSpacing: 0.1 },
  bodyLarge: { fontSize: 16, lineHeight: 24, letterSpacing: 0.5 },
  bodyMedium: { fontSize: 14, lineHeight: 20, letterSpacing: 0.25 },
  bodySmall: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  labelLarge: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const, letterSpacing: 0.1 },
  labelMedium: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const, letterSpacing: 0.5 },
  labelSmall: { fontSize: 11, lineHeight: 16, fontWeight: '500' as const, letterSpacing: 0.5 },
};

export type ThemeName = 'focus' | 'momentum';

export const themes: Record<ThemeName, MD3Theme> = { focus, momentum };
