import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Icon, Label, NativeTabs, VectorIcon } from 'expo-router/unstable-native-tabs';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const C = Colors.light;

  return (
    <NativeTabs
      backgroundColor={C.backgroundElement}
      indicatorColor={C.backgroundSelected}
      iconColor={{ default: C.textSecondary, selected: C.tint }}
      labelStyle={{ selected: { color: C.tint } }}>
      <NativeTabs.Trigger name="hands">
        <Label>Hands</Label>
        <Icon
          src={{
            default: <VectorIcon family={MaterialCommunityIcons} name="cards-playing-outline" />,
            selected: <VectorIcon family={MaterialCommunityIcons} name="cards-playing" />,
          }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="goals">
        <Label>Goals</Label>
        <Icon
          src={{
            default: <VectorIcon family={Ionicons} name="trophy-outline" />,
            selected: <VectorIcon family={Ionicons} name="trophy" />,
          }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="index">
        <Label>Home</Label>
        <Icon
          src={{
            default: <VectorIcon family={Ionicons} name="home-outline" />,
            selected: <VectorIcon family={Ionicons} name="home" />,
          }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="bankroll">
        <Label>Bankroll</Label>
        <Icon
          src={{
            default: <VectorIcon family={Ionicons} name="trending-up-outline" />,
            selected: <VectorIcon family={Ionicons} name="trending-up" />,
          }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="groups">
        <Label>Groups</Label>
        <Icon
          src={{
            default: <VectorIcon family={Ionicons} name="people-outline" />,
            selected: <VectorIcon family={Ionicons} name="people" />,
          }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
