import React, { useState, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    ActivityIndicator, RefreshControl, StatusBar, Platform, Dimensions
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Zap, Users, ChevronRight, Activity, UserPlus,
    CreditCard, Settings2, Calendar, TrendingUp, Clock,
    LayoutGrid, Search, Bell, FileSpreadsheet
} from 'lucide-react-native';
import { getActiveUsers, getAttendanceByDate, setGymSessionDefault, GYM_DEFAULT_SESSION_ID } from '../lib/services';
import { format } from 'date-fns';
import { RootStackParamList } from '../types/navigation';
import { useTheme, ThemeColors } from '../contexts/ThemeContext';

const { width } = Dimensions.get('window');

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Activity Ring Component for Visual Stats
const ActivityRing = ({ percentage, color, icon: Icon, size = 110 }: any) => {
    const radius = 42;
    const strokeWidth = 8;

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ transform: [{ rotate: '-90deg' }], position: 'relative', width: radius * 2, height: radius * 2 }}>
                {/* Background Ring */}
                <View style={[innerStyles.ringBase, {
                    width: radius * 2,
                    height: radius * 2,
                    borderRadius: radius,
                    borderWidth: strokeWidth,
                    borderColor: 'rgba(255,255,255,0.05)'
                }]} />
                {/* Active Ring */}
                <View style={[innerStyles.ringFill, {
                    width: radius * 2,
                    height: radius * 2,
                    borderRadius: radius,
                    borderWidth: strokeWidth,
                    borderColor: color,
                    borderTopColor: 'transparent',
                    borderLeftColor: 'transparent',
                    opacity: 1
                }]} />
            </View>
            {/* Centered Content */}
            <View style={innerStyles.ringContent}>
                <Text style={[innerStyles.ringPercentage, { color }]}>{Math.round(percentage)}%</Text>
                <Icon size={12} color="rgba(255,255,255,0.4)" strokeWidth={2.5} />
            </View>
        </View>
    );
};

const innerStyles = StyleSheet.create({
    ringBase: { position: 'absolute' },
    ringFill: { position: 'absolute' },
    ringContent: { position: 'absolute', alignItems: 'center', justifyContent: 'center', top: 0, left: 0, right: 0, bottom: 0 },
    ringPercentage: { fontSize: 18, fontWeight: '900', marginBottom: -2 }
});

export default function DashboardScreen() {
    const navigation = useNavigation<Nav>();
    const insets = useSafeAreaInsets();
    const safeTop = insets.top > 0 ? insets.top : Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0;
    const { colors, isDark } = useTheme();

    const [stats, setStats] = useState({
        total: 0,
        gym: 0,
        badminton: 0,
        gymPresent: 0,
        badmintonPresent: 0,
    });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadStats = async () => {
        try {
            await setGymSessionDefault();
            const dateStr = format(new Date(), 'yyyy-MM-dd');
            const [users, atts] = await Promise.all([
                getActiveUsers(),
                getAttendanceByDate(dateStr),
            ]);

            const gymMembers = users.filter(u => u.isGymMember);
            const badmintonMembers = users.filter(u => u.isBadmintonMember);
            const gymPresent = atts.filter(a => a.sessionId === GYM_DEFAULT_SESSION_ID && a.isPresent).length;
            const badmintonPresent = atts.filter(a => a.sessionId !== GYM_DEFAULT_SESSION_ID && a.isPresent).length;

            setStats({
                total: users.length,
                gym: gymMembers.length,
                badminton: badmintonMembers.length,
                gymPresent,
                badmintonPresent,
            });
        } catch (e: any) {
            console.error(e);
        } finally { setLoading(false); setRefreshing(false); }
    };

    useFocusEffect(useCallback(() => { setLoading(true); loadStats(); }, []));
    const onRefresh = () => { setRefreshing(true); loadStats(); };

    const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

    // Cards Color in Dark Mode
    const cardColors: [string, string, ...string[]] = isDark ? ['#0F172A', '#1E293B'] : ['#f8fafc', '#f1f5f9'];

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Immersive Header (Fixed at top) */}
            <LinearGradient
                colors={isDark ? ['#020617', '#0F172A', '#0F172A'] : ['#0F172A', '#1E293B', '#111827']}
                style={[styles.header, { paddingTop: safeTop + 16, zIndex: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: isDark ? 0.3 : 0.1, shadowRadius: 20, elevation: 15 }]}
            >
                {/* Top Bar */}
                <View style={styles.topBar}>
                    <View style={styles.brand}>
                        <View style={styles.iconCircle}>
                            <Zap size={20} color={colors.orange} fill={colors.orange} />
                        </View>
                        <Text style={styles.brandName}>BVM <Text style={{ color: colors.orange }}>GYM</Text></Text>
                    </View>
                    <View style={styles.topActions}>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Settings')}>
                            <Search size={22} color="rgba(255,255,255,0.7)" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.settingsBtn} onPress={() => navigation.navigate('Settings')}>
                            <Settings2 size={22} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Greeting Row */}
                <View style={styles.greetingRow}>
                    <View>
                        <Text style={styles.welcomeDate}>{format(new Date(), 'EEEE, do MMMM')}</Text>
                        <Text style={styles.welcomeText}>Hello, Admin</Text>
                    </View>
                </View>

                {/* Activity Rings Row */}
                <View style={styles.metricsRow}>
                    <View style={styles.heroSummary}>
                        <Text style={styles.heroNum}>{stats.total}</Text>
                        <Text style={styles.heroLabel}>TOTAL MEMBERS</Text>
                        <View style={styles.trendRow}>
                            <Clock size={12} color="rgba(255,255,255,0.4)" />
                            <Text style={styles.trendText}>SYNCED {format(new Date(), 'hh:mm a')}</Text>
                        </View>
                    </View>

                    <View style={styles.ringsContainer}>
                        <ActivityRing
                            percentage={(stats.gymPresent / (stats.gym || 1)) * 100}
                            color={colors.green}
                            icon={Activity}
                            size={100}
                        />
                        <ActivityRing
                            percentage={(stats.badmintonPresent / (stats.badminton || 1)) * 100}
                            color={colors.orange}
                            icon={Users}
                            size={100}
                        />
                    </View>
                </View>
            </LinearGradient>

            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.orange]} tintColor={isDark ? "#fff" : colors.orange} />}
                style={{ flex: 1, zIndex: 1 }}
                contentContainerStyle={{ paddingTop: 24 }}
            >
                {/* Management Hub Grid */}
                <View style={styles.contentSection}>
                    <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Management Hub</Text>
                        <LayoutGrid size={20} color={colors.sub} />
                    </View>

                    <View style={styles.actionGrid}>
                        <TouchableOpacity
                            style={styles.actionCard}
                            onPress={() => navigation.navigate('MainTabs', { screen: 'Members', params: { tab: 'reg' } } as any)}
                            activeOpacity={0.7}
                        >
                            <LinearGradient colors={cardColors} style={styles.actionGradient}>
                                <View style={[styles.actionIconBox, { backgroundColor: '#10B98115' }]}>
                                    <UserPlus color={colors.green} size={26} />
                                </View>
                                <Text style={[styles.actionText, { color: colors.text }]}>Member{"\n"}Registration</Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.actionCard}
                            onPress={() => navigation.navigate('MainTabs' as any, { screen: 'Billing' })}
                            activeOpacity={0.7}
                        >
                            <LinearGradient colors={cardColors} style={styles.actionGradient}>
                                <View style={[styles.actionIconBox, { backgroundColor: '#FC801915' }]}>
                                    <CreditCard color={colors.orange} size={26} />
                                </View>
                                <Text style={[styles.actionText, { color: colors.text }]}>Fee{"\n"}Collection</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={[styles.wideActionCard, { marginBottom: 16 }]}
                        onPress={() => navigation.navigate('MonthlyAttendance')}
                        activeOpacity={0.7}
                    >
                        <LinearGradient colors={cardColors} style={styles.wideGradient}>
                            <View style={styles.wideContent}>
                                <View style={[styles.actionIconBox, { backgroundColor: '#3B82F615' }]}>
                                    <Calendar color={colors.blue} size={24} />
                                </View>
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Text style={[styles.actionTitle, { color: colors.text }]}>Monthly Attendance</Text>
                                    </View>
                                    <Text style={styles.actionSub}>View reports & revenue insights</Text>
                                </View>
                                <ChevronRight size={18} color={colors.sub} opacity={0.4} />
                            </View>
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.wideActionCard}
                        onPress={() => navigation.navigate('Reports')}
                        activeOpacity={0.7}
                    >
                        <LinearGradient colors={cardColors} style={styles.wideGradient}>
                            <View style={styles.wideContent}>
                                <View style={[styles.actionIconBox, { backgroundColor: '#8B5CF615' }]}>
                                    <FileSpreadsheet color="#8B5CF6" size={24} />
                                </View>
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Text style={[styles.actionTitle, { color: colors.text }]}>Export to Excel</Text>
                                    </View>
                                    <Text style={styles.actionSub}>Download Attendance & Billing data</Text>
                                </View>
                                <ChevronRight size={18} color={colors.sub} opacity={0.4} />
                            </View>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>

                {/* Quick Presence Access */}
                <View style={styles.presenceSection}>
                    <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Daily Snapshot</Text>
                        <Text style={styles.dateSmall}>{format(new Date(), 'MMM d')}</Text>
                    </View>

                    <View style={styles.presenceGrid}>
                        <TouchableOpacity
                            style={{ flex: 1 }}
                            onPress={() => navigation.navigate('MainTabs' as any, { screen: 'Attend', params: { tab: 'Gym' } })}
                        >
                            <LinearGradient colors={['#10B981', '#059669']} style={styles.presenceCard}>
                                <View style={styles.presenceIconBack}><Activity color="#fff" size={16} strokeWidth={3} /></View>
                                <Text style={styles.presenceNum}>{stats.gymPresent}</Text>
                                <Text style={styles.presenceLabel}>Gym Members</Text>
                                <View style={styles.miniBar}><View style={[styles.miniFill, { width: `${(stats.gymPresent / 50) * 100}%` }]} /></View>
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={{ flex: 1 }}
                            onPress={() => navigation.navigate('MainTabs' as any, { screen: 'Attend', params: { tab: 'Badminton' } })}
                        >
                            <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.presenceCard}>
                                <View style={styles.presenceIconBack}><Users color="#fff" size={16} strokeWidth={3} /></View>
                                <Text style={styles.presenceNum}>{stats.badmintonPresent}</Text>
                                <Text style={styles.presenceLabel}>Court Players</Text>
                                <View style={styles.miniBar}><View style={[styles.miniFill, { width: `${(stats.badmintonPresent / 20) * 100}%` }]} /></View>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const makeStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#020617' : '#F8FAFC' },
    header: { paddingHorizontal: 22, borderBottomLeftRadius: 44, borderBottomRightRadius: 44, paddingBottom: 40 },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    iconCircle: { width: 44, height: 44, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
    brandName: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
    topActions: { flexDirection: 'row', gap: 10 },
    iconBtn: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    settingsBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },

    greetingRow: { marginBottom: 25 },
    welcomeDate: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5 },
    welcomeText: { color: '#fff', fontSize: 36, fontWeight: '900', marginTop: 4, letterSpacing: -1 },

    metricsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 32, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    heroSummary: { flex: 1 },
    heroNum: { color: '#fff', fontSize: 56, fontWeight: '900', letterSpacing: -3, lineHeight: 56 },
    heroLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginTop: 4 },
    trendRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
    trendText: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '800' },

    ringsContainer: { flexDirection: 'row', gap: 0, alignItems: 'center' },

    contentSection: { paddingHorizontal: 22, marginTop: 40 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    sectionTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.8 },
    dateSmall: { fontSize: 13, color: colors.sub, fontWeight: '700' },

    actionGrid: { flexDirection: 'row', gap: 16, marginBottom: 16 },
    actionCard: { flex: 1, height: 180, borderRadius: 32, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 4 },
    actionGradient: { flex: 1, padding: 24, justifyContent: 'space-between', borderWidth: 0.5, borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' },
    actionIconBox: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    actionText: { fontSize: 16, fontWeight: '900', letterSpacing: -0.3, lineHeight: 22 },

    wideActionCard: { borderRadius: 32, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 4 },
    wideGradient: { padding: 24, borderWidth: 0.5, borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' },
    wideContent: { flexDirection: 'row', alignItems: 'center' },
    actionTitle: { fontSize: 18, fontWeight: '900', letterSpacing: -0.2 },
    actionSub: { color: colors.sub, fontSize: 13, fontWeight: '600', marginTop: 2 },
    proBadge: { backgroundColor: colors.orange, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    proBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },

    presenceSection: { paddingHorizontal: 22, marginTop: 35 },
    presenceGrid: { flexDirection: 'row', gap: 16 },
    presenceCard: { flex: 1, padding: 20, borderRadius: 28, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 20, elevation: 5 },
    presenceIconBack: { width: 32, height: 32, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    presenceNum: { color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: -1 },
    presenceLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '700' },
    miniBar: { height: 4, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 2, marginTop: 12, overflow: 'hidden' },
    miniFill: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },

    statusRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 22, marginTop: 24, justifyContent: 'center' },
    statusItem: { paddingHorizontal: 25, paddingVertical: 15, borderRadius: 22, borderWidth: 1, alignItems: 'center', gap: 4, shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 10, elevation: 1 },
    statusVal: { fontSize: 14, fontWeight: '900', letterSpacing: -0.2 },
    statusLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
});
