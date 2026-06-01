import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { UserProvider } from '@/contexts/UserContext';

const LightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#2E3192',
    background: '#f5f7fa',
    card: '#fff',
    text: '#333',
    border: '#e0e0e0',
  },
};

const DarkThemeConfig = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#00e5ff',
    background: '#1a1a1a',
    card: '#2a2a2a',
    text: '#e0e0e0',
    border: '#444',
  },
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <UserProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkThemeConfig : LightTheme}>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colorScheme === 'dark' ? '#2a2a2a' : '#2E3192' },
              headerTintColor: colorScheme === 'dark' ? '#00e5ff' : '#fff',
              headerTitleStyle: { fontWeight: 'bold', color: colorScheme === 'dark' ? '#fff' : '#fff' },
            }}
          >
            {/* 1. Login Screen */}
            <Stack.Screen name="index" options={{ headerShown: false }} />

            {/* 2. Register Screen */}
            <Stack.Screen name="register" options={{ title: 'Create Account' }} />

            {/* 3. The "drawer" group or screen */}
            {/* We set headerShown: false so that the drawer layout renders itself. */}
            <Stack.Screen
              name="(drawer)"
              options={{
                headerShown: false
              }}
            />

            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          </Stack>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        </ThemeProvider>
      </UserProvider>
    </GestureHandlerRootView>
  );
}
