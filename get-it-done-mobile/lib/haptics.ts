import * as Haptics from 'expo-haptics';

export const hapticLight = () => {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
    // silently swallow — some devices / web don't support haptics
  });
};

export const hapticSelection = () => {
  void Haptics.selectionAsync().catch(() => {});
};

export const hapticSuccess = () => {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => {},
  );
};
