import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../theme';
import RaidsScreen from '../screens/admin/RaidsScreen';
import InspectorsScreen from '../screens/admin/InspectorsScreen';
import RecordsScreen from '../screens/admin/RecordsScreen';
import ReportsScreen from '../screens/admin/ReportsScreen';
import MoreScreen from '../screens/admin/MoreScreen';

const Tab = createBottomTabNavigator();

function TabIcon({ focused, icon }) {
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
          tabBarIcon: ({ focused }) => <TabIcon icon="🎯" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Inspectors"
        component={InspectorsScreen}
        options={{
          tabBarLabel: 'Inspectors',
          tabBarIcon: ({ focused }) => <TabIcon icon="👥" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Records"
        component={RecordsScreen}
        options={{
          tabBarLabel: 'Records',
          tabBarIcon: ({ focused }) => <TabIcon icon="📋" focused={focused} />,
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
  );
}
