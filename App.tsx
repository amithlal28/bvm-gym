import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text } from 'react-native';
import { Home, Users, Calendar, CreditCard, Clock } from 'lucide-react-native';

import DashboardScreen from './src/screens/Dashboard';
import SessionManagementScreen from './src/screens/SessionManagement';
import UserManagementScreen from './src/screens/UserManagement';
import UserDetailScreen from './src/screens/UserDetail';
import AttendanceScreen from './src/screens/Attendance';
import BillingScreen from './src/screens/Billing';
import UserBillingScreen from './src/screens/UserBilling';

export type RootStackParamList = {
    MainTabs: undefined;
    UserDetail: { userId: string };
    UserBilling: { userId: string; userName: string };
    SessionManagement: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

const ORANGE = '#FC8019';
const DARK = '#1A1A2E';
const SUB = '#93959F';
const BG = '#F8F9FA';

function TabIcon({ Icon, focused, label }: { Icon: any; focused: boolean; label: string }) {
    return (
        <View style={{ alignItems: 'center', gap: 3, paddingTop: 4 }}>
            <Icon size={22} color={focused ? ORANGE : SUB} strokeWidth={focused ? 2.5 : 1.8} />
            <Text style={{ fontSize: 10, color: focused ? ORANGE : SUB, fontWeight: focused ? '700' : '500' }}>{label}</Text>
        </View>
    );
}

function MainTabs() {
    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: '#FFFFFF',
                    borderTopWidth: 1,
                    borderTopColor: '#F0F0F0',
                    height: 70,
                    paddingBottom: 8,
                    paddingTop: 6,
                    elevation: 20,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: -4 },
                    shadowOpacity: 0.06,
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

export default function App() {
    return (
        <SafeAreaProvider>
            <NavigationContainer>
                <Stack.Navigator
                    screenOptions={{
                        headerStyle: { backgroundColor: '#FFFFFF' },
                        headerTintColor: ORANGE,
                        headerTitleStyle: { fontWeight: '800', fontSize: 17, color: '#1A1A2E' },
                        headerShadowVisible: false,
                        contentStyle: { backgroundColor: BG },
                        animation: 'slide_from_right',
                    }}
                >
                    <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
                    <Stack.Screen name="UserDetail" component={UserDetailScreen} options={{ title: 'Member Profile' }} />
                    <Stack.Screen name="UserBilling" component={UserBillingScreen} options={({ route }) => ({ title: (route.params as any).userName })} />
                    <Stack.Screen name="SessionManagement" component={SessionManagementScreen} options={{ title: 'Sessions & Batches' }} />
                </Stack.Navigator>
            </NavigationContainer>
            <StatusBar style="dark" />
        </SafeAreaProvider>
    );
}
