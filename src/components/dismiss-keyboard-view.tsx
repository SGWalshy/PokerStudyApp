import { ReactNode } from 'react';
import { Keyboard, Pressable } from 'react-native';

// Wraps the whole app so a tap anywhere not claimed by an input, button, or
// scroll view dismisses the keyboard — inner Pressables/TextInputs still
// claim their own touch first, so normal taps are unaffected.
export function DismissKeyboardView({ children }: { children: ReactNode }) {
  return (
    <Pressable style={{ flex: 1 }} onPress={() => Keyboard.dismiss()} accessible={false}>
      {children}
    </Pressable>
  );
}
