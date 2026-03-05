import React from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Home, Users, Calendar, CreditCard, Clock } from 'lucide-react-native';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';

import DashboardScreen from './src/screens/Dashboard';
import SessionManagementScreen from './src/screens/SessionManagement';
import UserManagementScreen from './src/screens/UserManagement';
import UserDetailScreen from './src/screens/UserDetail';
import AttendanceScreen from './src/screens/Attendance';
import BillingScreen from './src/screens/Billing';
import UserBillingScreen from './src/screens/UserBilling';
import NotificationSettingsScreen from './src/screens/NotificationSettings';
import MonthlyAttendanceScreen from './src/screens/MonthlyAttendance';
import ReportsScreen from './src/screens/Reports';

export type RootStackParamList = {
    MainTabs: undefined;
    UserDetail: { userId: string };
    UserBilling: { userId: string; userName: string };
    SessionManagement: undefined;
    Attend: { tab?: 'Gym' | 'Badminton' };
    Settings: undefined;
    MonthlyAttendance: undefined;
    Reports: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

const ORANGE = '#FC8019';
const DARK = '#1A1A2E';
const SUB = '#93959F';
const BG = '#F8F9FA';

function TabIcon({ Icon, focused, label }: { Icon: any; focused: boolean; label: string }) {
    const { colors } = useTheme();
    return (
        <View style={{ alignItems: 'center', gap: 3, paddingTop: 4, paddingHorizontal: 2, minWidth: 60 }}>
            <Icon size={22} color={focused ? colors.orange : colors.sub} strokeWidth={focused ? 2.5 : 1.8} />
            <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{ fontSize: 9.5, color: focused ? colors.orange : colors.sub, fontWeight: focused ? '700' : '500', textAlign: 'center', width: '100%' }}
            >
                {label}
            </Text>
        </View>
    );
}

function MainTabs() {
    const { isDark, colors } = useTheme();
    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: colors.tabBg,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    height: 70,
                    paddingBottom: 8,
                    paddingTop: 6,
                    elevation: 20,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: -4 },
                    shadowOpacity: isDark ? 0.6 : 0.06,
                    shadowRadius: 12,
                },
                tabBarShowLabel: false,
            }}
        >
            <Tab.Screen name="Home" component={DashboardScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={Home} focused={focused} label="Home" /> }} />
            <Tab.Screen name="Members" component={UserManagementScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={Users} focused={focused} label="Members" /> }} />
            <Tab.Screen name="Attend" component={AttendanceScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={Calendar} focused={focused} label="Attendance" /> }} />
            <Tab.Screen name="Billing" component={BillingScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={CreditCard} focused={focused} label="Billing" /> }} />
            <Tab.Screen name="Sessions" component={SessionManagementScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={Clock} focused={focused} label="Sessions" /> }} />
        </Tab.Navigator>
    );
}

function AppInner() {
    const { isDark, colors } = useTheme();

    const navTheme = isDark ? {
        ...DarkTheme,
        colors: { ...DarkTheme.colors, background: colors.bg, card: colors.headerBg, border: colors.border, text: colors.text },
    } : {
        ...DefaultTheme,
        colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.headerBg, border: colors.border, text: colors.text },
    };

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <NavigationContainer theme={navTheme}>
                    <Stack.Navigator
                        screenOptions={{
                            headerStyle: { backgroundColor: colors.headerBg },
                            headerTintColor: colors.orange,
                            headerTitleStyle: { fontWeight: '800', fontSize: 17, color: colors.text },
                            headerShadowVisible: false,
                            contentStyle: { backgroundColor: colors.bg },
                            animation: 'slide_from_right',
                        }}
                    >
                        <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
                        <Stack.Screen name="UserDetail" component={UserDetailScreen} options={{ title: 'Member Profile' }} />
                        <Stack.Screen name="UserBilling" component={UserBillingScreen} options={({ route }) => ({ title: (route.params as any).userName })} />
                        <Stack.Screen name="SessionManagement" component={SessionManagementScreen} options={{ title: 'Sessions & Batches' }} />
                        <Stack.Screen name="Settings" component={NotificationSettingsScreen} options={{ headerShown: false }} />
                        <Stack.Screen name="MonthlyAttendance" component={MonthlyAttendanceScreen} options={{ headerShown: false }} />
                        <Stack.Screen name="Reports" component={ReportsScreen} options={{ headerShown: false }} />
                    </Stack.Navigator>
                </NavigationContainer>
                <StatusBar style={isDark ? 'light' : 'dark'} />
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}

export default function App() {
    return (
        <ThemeProvider>
            <AppInner />
        </ThemeProvider>
    );
}
