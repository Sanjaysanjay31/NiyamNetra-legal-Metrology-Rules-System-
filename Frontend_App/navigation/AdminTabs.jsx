import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';
import RaidsScreen from '../screens/admin/RaidsScreen';
import InspectorsScreen from '../screens/admin/InspectorsScreen';
import RecordsScreen from '../screens/admin/RecordsScreen';
import ReportsScreen from '../screens/admin/ReportsScreen';
import MoreScreen from '../screens/admin/MoreScreen';

const Tab = createBottomTabNavigator();

// Emoji kept (lucide-react-native is not installed). Active 2px indicator bar
// + accessibility labels so selection is perceivable without colour alone.
function TabIcon({ focused, icon, label }) {
  return (
    <View style={styles.tabIconContainer} accessible accessibilityRole="image" accessibilityLabel={label}>
      {focused && (
        <View style={{ height: 2, width: 28, backgroundColor: colors.netraTeal, borderRadius: 1, marginBottom: 2 }} />
      )}
      <Text style={[styles.tabIcon, { color: focused ? colors.netraTeal : colors.textMuted }]}>{icon}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: { alignItems: 'center', justifyContent: 'center' },
  tabIcon: { fontSize: 20 },
});

export default function AdminTabs() {
  return (
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
        name="Raids"
        component={RaidsScreen}
        options={{
          tabBarLabel: 'Raids',
          tabBarAccessibilityLabel: 'Raids, live inspection tracking',
          tabBarIcon: ({ focused }) => <TabIcon icon="🎯" focused={focused} label="Raids" />,
        }}
      />
      <Tab.Screen
        name="Inspectors"
        component={InspectorsScreen}
        options={{
          tabBarLabel: 'Inspectors',
          tabBarAccessibilityLabel: 'Inspectors, officer roster',
          tabBarIcon: ({ focused }) => <TabIcon icon="👥" focused={focused} label="Inspectors" />,
        }}
      />
      <Tab.Screen
        name="Records"
        component={RecordsScreen}
        options={{
          tabBarLabel: 'Records',
          tabBarAccessibilityLabel: 'Records, store-wise inspection data',
          tabBarIcon: ({ focused }) => <TabIcon icon="📋" focused={focused} label="Records" />,
        }}
      />
      <Tab.Screen
        name="Reports"
        component={ReportsScreen}
        options={{
          tabBarLabel: 'Reports',
          tabBarAccessibilityLabel: 'Reports, compliance analytics',
          tabBarIcon: ({ focused }) => <TabIcon icon="📊" focused={focused} label="Reports" />,
        }}
      />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{
          tabBarLabel: 'More',
          tabBarAccessibilityLabel: 'More, profile and settings',
          tabBarIcon: ({ focused }) => <TabIcon icon="≡" focused={focused} label="More" />,
        }}
      />
    </Tab.Navigator>
  );
}
