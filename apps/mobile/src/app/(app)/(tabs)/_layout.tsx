import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useTheme } from 'tamagui';

import { Activity, House, User } from '../../../components/icons';
import { haptics } from '../../../lib/haptics';
import { useIsWide } from '../../../lib/layout';

export default function TabsLayout() {
  const theme = useTheme();
  const wide = useIsWide();
  const active = theme.green10?.val as string;
  const inactive = theme.color10?.val as string;

  return (
    <Tabs
      screenListeners={{ tabPress: () => haptics.tap() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: active,
        tabBarInactiveTintColor: inactive,
        tabBarLabelStyle:
          Platform.OS === 'web'
            ? { fontFamily: 'Inter, system-ui, sans-serif', fontWeight: '600', fontSize: 12 }
            : { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
        tabBarStyle: wide
          ? { display: 'none' }
          : {
              backgroundColor: theme.background?.val as string,
              borderTopColor: theme.borderColor?.val as string,
            },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Groups', tabBarIcon: ({ color, size }) => <House color={color as string} size={size} /> }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color, size }) => <Activity color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: 'Account', tabBarIcon: ({ color, size }) => <User color={color as string} size={size} /> }}
      />
    </Tabs>
  );
}
