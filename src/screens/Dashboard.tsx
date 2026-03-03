import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    ActivityIndicator, Alert, RefreshControl, StatusBar, Platform
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Zap, Users, ChevronRight, Activity, UserPlus, CreditCard } from 'lucide-react-native';
import { getActiveUsers, getAttendanceByDate, seedDemoData, setGymSessionDefault, GYM_DEFAULT_SESSION_ID } from '../lib/services';
import { format } from 'date-fns';
import { RootStackParamList } from '../types/navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function DashboardScreen() {
    const navigation = useNavigation<Nav>();
    const [stats, setStats] = useState({ total: 0, gym: 0, badminton: 0, gymPresent: 0, badmintonPresent: 0 });
    const [loading, setLoading] = useState(true);
    const [seeding, setSeeding] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [recentUsers, setRecentUsers] = useState<any[]>([]);

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
                badmintonPresent
            });
            setRecentUsers(users.slice(0, 5));
        } catch (e: any) {
            if (e.code === 'permission-denied' || e?.message?.includes('permission')) {
                Alert.alert('🔒 Firebase Setup Required', 'Go to console.firebase.google.com → Firestore Database → Rules → publish:\n\nallow read, write: if true;');
            }
        } finally { setLoading(false); setRefreshing(false); }
    };

    useFocusEffect(useCallback(() => { setLoading(true); loadStats(); }, []));
    const onRefresh = () => { setRefreshing(true); loadStats(); };

    const handleSeed = async () => {
        try {
            setSeeding(true);
            const msg = await seedDemoData();
            await loadStats();
            if (Platform.OS === 'web') window.alert(msg);
            else Alert.alert('Done!', msg);
        } catch (e: any) {
            const err = e.code === 'permission-denied' ? 'Firestore rules block writes. Update rules first.' : e.message;
            if (Platform.OS === 'web') window.alert('Error: ' + err);
            else Alert.alert('Error', err);
        } finally { setSeeding(false); }
    };

    const actColor = (u: any) => u.isGymMember && u.isBadmintonMember ? '#8B5CF6' : u.isGymMember ? '#10B981' : '#FC8019';

    return (
        <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
            <StatusBar barStyle="light-content" />
            <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#FC8019']} />}>

                {/* Premium Header */}
                <LinearGradient colors={['#1A1A2E', '#16213E', '#0F3460']} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <View style={styles.headerTop}>
                        <View>
                            <Text style={styles.greeting}>Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'} 👋</Text>
                            <Text style={styles.gymName}>BVM Gym</Text>
                            <Text style={styles.headerSub}>{format(new Date(), 'EEEE, MMMM d')}</Text>
                        </View>
                        <View style={styles.headerBadge}>
                            <Text style={styles.headerBadgeText}>{format(new Date(), 'MMM yy').toUpperCase()}</Text>
                        </View>
                    </View>

                    {/* Big stat */}
                    {loading ? <ActivityIndicator color="#FC8019" style={{ marginVertical: 24 }} /> : (
                        <View style={styles.heroStat}>
                            <View style={styles.heroStatLeft}>
                                <Text style={styles.heroNum}>{stats.total}</Text>
                                <Text style={styles.heroLabel}>Active Members</Text>
                                <View style={styles.heroTagRow}>
                                    <View style={[styles.heroTag, { backgroundColor: '#10B981' }]}>
                                        <Text style={styles.heroTagText}>{stats.gym} Gym</Text>
                                    </View>
                                    <View style={[styles.heroTag, { backgroundColor: '#FC8019' }]}>
                                        <Text style={styles.heroTagText}>{stats.badminton} Badminton</Text>
                                    </View>
                                </View>
                            </View>
                            <View style={styles.heroStatRight}>
                                <View style={styles.miniStat}>
                                    <Text style={[styles.miniStatNum, { color: '#6EE7B7' }]}>{stats.gymPresent}</Text>
                                    <Text style={styles.miniStatLabel}>Gym In</Text>
                                </View>
                                <View style={[styles.miniStat, { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', marginTop: 8, paddingTop: 8 }]}>
                                    <Text style={[styles.miniStatNum, { color: '#FCD34D' }]}>{stats.badmintonPresent}</Text>
                                    <Text style={styles.miniStatLabel}>Badminton In</Text>
                                </View>
                            </View>
                        </View>
                    )}
                </LinearGradient>

                {/* Quick Actions */}
                {!loading && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Quick Actions</Text>
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('MainTabs' as any, { screen: 'Members' })} activeOpacity={0.75}>
                                <View style={[styles.actionIcon, { backgroundColor: '#E8F5E9' }]}><UserPlus color="#10B981" size={20} strokeWidth={2.5} /></View>
                                <Text style={styles.actionText}>Add Member</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('MainTabs' as any, { screen: 'Billing' })} activeOpacity={0.75}>
                                <View style={[styles.actionIcon, { backgroundColor: '#FFF0E5' }]}><CreditCard color="#FC8019" size={20} strokeWidth={2.5} /></View>
                                <Text style={styles.actionText}>Collect Fees</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Attendance Snapshot */}
                {!loading && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Today — {format(new Date(), 'MMMM d, yyyy')}</Text>
                        <View style={styles.revenueRow}>
                            <TouchableOpacity style={{ flex: 1 }} onPress={() => navigation.navigate('MainTabs' as any, { screen: 'Attend', params: { tab: 'Gym' } })} activeOpacity={0.8}>
                                <LinearGradient colors={['#10B981', '#059669']} style={styles.revenueCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                    <Activity stroke="#fff" strokeWidth={2.5} size={20} />
                                    <Text style={styles.revenueAmt}>{stats.gymPresent}</Text>
                                    <Text style={styles.revenueLabel}>Gym Present</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                            <TouchableOpacity style={{ flex: 1 }} onPress={() => navigation.navigate('MainTabs' as any, { screen: 'Attend', params: { tab: 'Badminton' } })} activeOpacity={0.8}>
                                <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.revenueCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                    <Users stroke="#fff" strokeWidth={2.5} size={20} />
                                    <Text style={styles.revenueAmt}>{stats.badmintonPresent}</Text>
                                    <Text style={styles.revenueLabel}>Badminton Present</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Seed Button (Temporarily Disabled) */}
                {/* 
                <View style={[styles.section, { paddingBottom: 32 }]}>
                    <TouchableOpacity style={[styles.seedBtn, seeding && { opacity: 0.6 }]} onPress={handleSeed} disabled={seeding} activeOpacity={0.8}>
                        {seeding ? <ActivityIndicator color="#FC8019" size="small" /> : <Zap stroke="#FC8019" strokeWidth={2.5} size={16} />}
                        <Text style={styles.seedText}>{seeding ? 'Loading...' : 'Load Demo Data (10 members)'}</Text>
                    </TouchableOpacity>
                    <Text style={styles.seedHint}>⚠️ Requires Firestore rules: allow read, write: if true</Text>
                </View>
                */}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    greeting: { color: '#94A3B8', fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
    gymName: { color: '#FFF', fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
    headerSub: { color: '#60A5FA', fontSize: 14, fontWeight: '600', marginTop: 2 },
    headerBadge: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    headerBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
    heroStat: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    heroStatLeft: { flex: 1, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.1)', paddingRight: 16 },
    heroNum: { fontSize: 48, fontWeight: '900', color: '#FFF', letterSpacing: -1, lineHeight: 56 },
    heroLabel: { fontSize: 14, color: '#94A3B8', fontWeight: '600', marginBottom: 12 },
    heroTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    heroTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    heroTagText: { color: '#FFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
    heroStatRight: { width: 100, paddingLeft: 16, justifyContent: 'center' },
    miniStat: {},
    miniStatNum: { fontSize: 20, fontWeight: '800', color: '#FFF' },
    miniStatLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
    section: { paddingHorizontal: 20, paddingTop: 24 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A2E', letterSpacing: -0.3, marginBottom: 12 },
    seeAll: { color: '#FC8019', fontSize: 14, fontWeight: '700' },
    memberChip: { width: 90, alignItems: 'center', backgroundColor: '#FFF', padding: 12, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    memberChipAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    memberChipAvatarText: { fontSize: 18, fontWeight: '800' },
    memberChipName: { fontSize: 13, fontWeight: '700', color: '#1A1A2E', marginBottom: 2 },
    memberChipSub: { fontSize: 11, color: '#93959F', fontWeight: '600' },
    actionCard: { flex: 1, backgroundColor: '#FFF', padding: 16, borderRadius: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    actionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    actionText: { fontSize: 14, fontWeight: '700', color: '#1A1A2E' },
    revenueRow: { flexDirection: 'row', gap: 12 },
    revenueCard: { padding: 16, borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
    revenueAmt: { fontSize: 28, fontWeight: '900', color: '#FFF', marginVertical: 8, letterSpacing: -1 },
    revenueLabel: { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '700' },
    seedBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#FFE8D6' },
    seedText: { color: '#FC8019', fontWeight: '800', fontSize: 15 },
    seedHint: { textAlign: 'center', color: '#93959F', fontSize: 12, marginTop: 12, fontWeight: '500' },
});
