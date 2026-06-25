import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const C = Colors.light;

  return (
    <NativeTabs
      backgroundColor={C.backgroundElement}
      indicatorColor={C.backgroundSelected}
      labelStyle={{ selected: { color: C.tint } }}>
      <NativeTabs.Trigger name="index">
        <Label>Home</Label>
        <Icon src={require('@/assets/images/tabIcons/home.png')} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="hands">
        <Label>Hands</Label>
        <Icon src={require('@/assets/images/tabIcons/hands.png')} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="bankroll">
        <Label>Bankroll</Label>
        <Icon src={require('@/assets/images/tabIcons/bankroll.png')} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="goals">
        <Label>Goals</Label>
        <Icon src={require('@/assets/images/tabIcons/goals.png')} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="groups">
        <Label>Groups</Label>
        <Icon src={require('@/assets/images/tabIcons/groups.png')} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
