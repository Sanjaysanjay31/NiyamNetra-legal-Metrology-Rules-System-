import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import SyncStrip from '../components/SyncStrip';
import LowStorageGuard from '../components/LowStorageGuard';
import { colors, spacing, typography } from '../theme';
import ScanScreen from '../screens/inspector/ScanScreen';
import PassScreen from '../screens/inspector/PassScreen';
import ViolationsScreen from '../screens/inspector/ViolationsScreen';
import ReportsScreen from '../screens/inspector/ReportsScreen';
import MoreScreen from '../screens/inspector/MoreScreen';

const Tab = createBottomTabNavigator();

// Tab icon component
function TabIcon({ label, focused, icon }) {
  return (
    <View style={styles.tabIconContainer}>
      <Text style={[styles.tabIcon, { color: focused ? colors.netraTeal : colors.textMuted }]}>{icon}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: { alignItems: 'center', justifyContent: 'center' },
  tabIcon: { fontSize: 20 },
});

export default function InspectorTabs() {
  return (
    <LowStorageGuard>
      <SyncStrip />
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.netraTeal,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: {
            backgroundColor: colors.white,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: 60,
            paddingBottom: 6,
            paddingTop: 6,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '500',
          },
        }}
      >
        <Tab.Screen
          name="Scan"
          component={ScanScreen}
          options={{
            tabBarLabel: 'Scan',
            tabBarIcon: ({ focused }) => <TabIcon icon="📷" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Pass"
          component={PassScreen}
          options={{
            tabBarLabel: 'Success',
            tabBarIcon: ({ focused }) => <TabIcon icon="✓" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Violations"
          component={ViolationsScreen}
          options={{
            tabBarLabel: 'Violations',
            tabBarIcon: ({ focused }) => <TabIcon icon="!" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Reports"
          component={ReportsScreen}
          options={{
            tabBarLabel: 'Reports',
            tabBarIcon: ({ focused }) => <TabIcon icon="📊" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="More"
          component={MoreScreen}
          options={{
            tabBarLabel: 'More',
            tabBarIcon: ({ focused }) => <TabIcon icon="≡" focused={focused} />,
          }}
        />
      </Tab.Navigator>
    </LowStorageGuard>
  );
}
