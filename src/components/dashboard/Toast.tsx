import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { PaletteColors } from './types';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastState {
  visible: boolean;
  message: string;
  kind: ToastKind;
}

interface ToastProps {
  toast: ToastState;
  colors: PaletteColors;
  onHide: () => void;
}

export default function Toast({ toast, colors, onHide }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (!toast.visible) return;

    opacity.setValue(0);
    translateY.setValue(20);

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();

    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 12, duration: 160, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) onHide();
      });
    }, 2200);

    return () => clearTimeout(t);
  }, [toast.visible, toast.message]);

  if (!toast.visible) return null;

  const bg =
    toast.kind === 'success'
      ? colors.accentGreen
      : toast.kind === 'error'
      ? colors.accentRed
      : colors.accentBlue;

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View
        style={[
          styles.toast,
          {
            backgroundColor: bg,
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <Text style={styles.text}>{toast.message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 96,
    zIndex: 100,
    alignItems: 'center',
  },
  toast: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    maxWidth: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
