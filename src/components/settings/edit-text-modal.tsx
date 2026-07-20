import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';

const C = Colors.light;

export interface EditTextModalProps {
  visible: boolean;
  title: string;
  value: string;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address';
  onClose: () => void;
  onSave: (value: string) => void;
}

export function EditTextModal({ visible, title, value, placeholder, keyboardType, onClose, onSave }: EditTextModalProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  function handleSave() {
    onSave(draft.trim());
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
        pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={placeholder}
            placeholderTextColor={C.textSecondary}
            keyboardType={keyboardType}
            autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          <Pressable onPress={handleSave} style={({ pressed }) => [styles.saveBtn, pressed && styles.dimmed]}>
            <Text style={styles.saveBtnText}>Save</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26,26,20,0.4)',
  },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    backgroundColor: C.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.four,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.backgroundSelected,
    alignSelf: 'center',
    marginBottom: Spacing.three,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    marginBottom: Spacing.three,
  },
  input: {
    backgroundColor: C.backgroundElement,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: C.text,
    marginBottom: Spacing.three,
  },
  saveBtn: {
    backgroundColor: C.tint,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.tintText,
  },
  dimmed: {
    opacity: 0.7,
  },
});
