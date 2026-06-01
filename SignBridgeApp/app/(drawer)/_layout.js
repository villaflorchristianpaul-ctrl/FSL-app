import React from 'react';
import { Drawer } from 'expo-router/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function DrawerLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        screenOptions={{
          headerShown: false,
          headerStyle: {
            backgroundColor: isDark ? '#111827' : '#ffffff',
            shadowColor: 'transparent',
          },
          headerTintColor: isDark ? '#f8fafc' : '#0f172a',
          headerTitleStyle: {
            fontWeight: '700',
          },
          drawerActiveTintColor: '#6c00ff',
          drawerInactiveTintColor: isDark ? '#94a3b8' : '#475569',
          drawerStyle: {
            backgroundColor: isDark ? '#020617' : '#f8fafc',
            width: 300,
          },
          drawerContentStyle: {
            backgroundColor: isDark ? '#020617' : '#f8fafc',
          },
          drawerLabelStyle: {
            marginLeft: -8,
            fontSize: 15,
          },
          sceneContainerStyle: {
            backgroundColor: isDark ? '#020617' : '#eef2ff',
          },
          drawerType: 'front',
          swipeEdgeWidth: 60,
        }}
      >
        <Drawer.Screen
          name="index"
          options={{
            title: 'Home',
            drawerIcon: ({ color }) => <Ionicons name="home-outline" size={20} color={color} />,
          }}
        />
        <Drawer.Screen
          name="translate"
          options={{
            title: 'Translate',
            drawerIcon: ({ color }) => <Ionicons name="camera-outline" size={20} color={color} />,
            swipeEnabled: false,
          }}
        />
        <Drawer.Screen
          name="video"
          options={{
            title: 'Video',
            drawerIcon: ({ color }) => <Ionicons name="videocam-outline" size={20} color={color} />,
            swipeEnabled: false,
          }}
        />
        <Drawer.Screen
          name="settings"
          options={{
            title: 'Settings',
            drawerIcon: ({ color }) => <Ionicons name="settings-outline" size={20} color={color} />,
            swipeEnabled: false,
          }}
        />
        <Drawer.Screen
          name="profile"
          options={{
            drawerItemStyle: { display: 'none' },
            swipeEnabled: false,
          }}
        />
        <Drawer.Screen
          name="help"
          options={{
            drawerItemStyle: { display: 'none' },
            swipeEnabled: false,
          }}
        />
        <Drawer.Screen
          name="explore"
          options={{
            drawerItemStyle: { display: 'none' },
            swipeEnabled: false,
          }}
        />
        <Drawer.Screen
          name="text-to-fsl"
          options={{
            drawerItemStyle: { display: 'none' },
            swipeEnabled: false,
          }}
        />
      </Drawer>
    </GestureHandlerRootView>
  );
}