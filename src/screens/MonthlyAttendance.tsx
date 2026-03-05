import React, { useState, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    ActivityIndicator, Platform, StatusBar
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, subMonths, addMonths, startOfMonth, endOfMonth, isSunday, isBefore, isAfter, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight, PauseCircle, Calendar } from 'lucide-react-native';

import { User, Session, Attendance } from '../types';
import { getActiveUsers, getBadmintonSessions, getAttendanceByMonth, GYM_DEFAULT_SESSION_ID } from '../lib/services';
import { RootStackParamList } from '../types/navigation';
import { useTheme } from '../contexts/ThemeContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function MonthlyAttendanceScreen() {
    const navigation = useNavigation<Nav>();
    const insets = useSafeAreaInsets();
    const safeTop = insets.top > 0 ? insets.top : Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0;
    const { colors: C, isDark } = useTheme();
    const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);

    const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()));
    const [mainTab, setMainTab] = useState<'Gym' | 'Badminton'>('Gym');
    const [selectedBatch, setSelectedBatch] = useState<string>(GYM_DEFAULT_SESSION_ID);

    const [users, setUsers] = useState<User[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [attendance, setAttendance] = useState<Attendance[]>([]);
    const [loading, setLoading] = useState(true);

    useFocusEffect(useCallback(() => {
        loadData(currentMonth, mainTab);
    }, [currentMonth.getTime(), mainTab]));

    const loadData = async (month: Date, tab: 'Gym' | 'Badminton') => {
        try {
            setLoading(true);
            const monthStr = format(month, 'yyyy-MM');
            const [u, s, a] = await Promise.all([
                getActiveUsers(),
                getBadmintonSessions(),
                getAttendanceByMonth(monthStr)
            ]);
            setUsers(u);
            setSessions(s);
            setAttendance(a);

            // Adjust batch if switching to Badminton
            if (tab === 'Badminton' && s.length > 0 && !s.find(batch => batch.id === selectedBatch)) {
                setSelectedBatch(s[0].id || '');
            }
        } catch (e: any) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleMonthChange = (amount: number) => {
        setCurrentMonth(prev => amount > 0 ? addMonths(prev, amount) : subMonths(prev, Math.abs(amount)));
    };

    const handleTabChange = (tab: 'Gym' | 'Badminton') => {
        setMainTab(tab);
        setSelectedBatch(tab === 'Gym' ? GYM_DEFAULT_SESSION_ID : (sessions[0]?.id || ''));
    };

    // Calculate total working days in the selected month
    const totalWorkingDays = useMemo(() => {
        let count = 0;
        const eom = endOfMonth(currentMonth);
        const today = new Date();
        // If current month, only count up to today. If past month, count up to end of month.
        const limitDate = isBefore(today, eom) ? today : eom;

        let d = startOfMonth(currentMonth);
        // If viewing a future month, return 0
        if (isAfter(d, today)) return 0;

        while (isBefore(d, limitDate) || isToday(d)) {
            if (!isSunday(d)) count++;
            d.setDate(d.getDate() + 1);
        }
        return count;
    }, [currentMonth.getTime()]);

    const activeSessionId = mainTab === 'Gym' ? GYM_DEFAULT_SESSION_ID : selectedBatch;

    // Filter and compute member stats
    const memberStats = useMemo(() => {
        const filteredUsers = users.filter(u =>
            mainTab === 'Gym'
                ? u.isGymMember
                : (u.isBadmintonMember && u.badmintonSessionId === activeSessionId)
        );

        return filteredUsers.map(u => {
            const isSuspended = mainTab === 'Gym' ? !!u.gymSuspendedAt : !!u.badmintonSuspendedAt;
            // Calculate presence limit to their join date if they joined mid-month
            let userWorkingDays = totalWorkingDays;
            if (u.dateJoined) {
                const joinDate = new Date(u.dateJoined);
                if (isAfter(joinDate, startOfMonth(currentMonth))) {
                    let d = joinDate;
                    let count = 0;
                    const eom = endOfMonth(currentMonth);
                    const today = new Date();
                    const limitDate = isBefore(today, eom) ? today : eom;
                    while (isBefore(d, limitDate) || isToday(d)) {
                        if (!isSunday(d)) count++;
                        d.setDate(d.getDate() + 1);
                    }
                    userWorkingDays = count;
                }
            }

            // Count presents for this session
            let presentCount = 0;
            if (u.id) {
                presentCount = attendance.filter(a => a.userId === u.id && a.sessionId === activeSessionId && a.isPresent).length;
            }

            const percentage = userWorkingDays === 0 ? 0 : Math.round((presentCount / userWorkingDays) * 100);

            return {
                ...u,
                isSuspended,
                presentCount,
                userWorkingDays,
                percentage
            };
        }).sort((a, b) => {
            // Suspended members at bottom
            if (a.isSuspended && !b.isSuspended) return 1;
            if (!a.isSuspended && b.isSuspended) return -1;
            // Then sort by percentage descending
            return b.percentage - a.percentage;
        });
    }, [users, attendance, activeSessionId, mainTab, totalWorkingDays, currentMonth]);

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: safeTop }]}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <ChevronLeft size={22} color={C.text} strokeWidth={2.5} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>Monthly Report</Text>
                    <Text style={styles.headerSub}>Attendance analytics</Text>
                </View>
            </View>

            {/* Month Selector */}
            <View style={styles.monthNav}>
                <TouchableOpacity style={styles.navBtn} onPress={() => handleMonthChange(-1)}>
                    <ChevronLeft size={20} color={C.text} strokeWidth={2.5} />
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Calendar size={16} color={C.orange} />
                    <Text style={styles.monthName}>{format(currentMonth, 'MMMM yyyy')}</Text>
                </View>
                <TouchableOpacity
                    style={[styles.navBtn, isAfter(currentMonth, subMonths(new Date(), 1)) && { opacity: 0.3 }]}
                    onPress={() => handleMonthChange(1)}
                    disabled={isAfter(currentMonth, subMonths(new Date(), 1))}
                >
                    <ChevronRight size={20} color={C.text} strokeWidth={2.5} />
                </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={styles.mainTabs}>
                <TouchableOpacity style={[styles.mainTab, mainTab === 'Gym' && styles.mainTabActive]} onPress={() => handleTabChange('Gym')} activeOpacity={0.8}>
                    <Text style={[styles.mainTabText, mainTab === 'Gym' && styles.mainTabTextActive]}>🏋️ Gym</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.mainTab, mainTab === 'Badminton' && styles.mainTabActive]} onPress={() => handleTabChange('Badminton')} activeOpacity={0.8}>
                    <Text style={[styles.mainTabText, mainTab === 'Badminton' && styles.mainTabTextActive]}>🏸 Badminton</Text>
                </TouchableOpacity>
            </View>

            {/* Batch Sub-tabs */}
            {mainTab === 'Badminton' && (
                <View style={styles.batchRow}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
                        {sessions.map(s => (
                            <TouchableOpacity key={s.id} style={[styles.batchChip, selectedBatch === s.id && styles.batchChipActive]} onPress={() => setSelectedBatch(s.id || '')} activeOpacity={0.8}>
                                <Text style={[styles.batchChipText, selectedBatch === s.id && styles.batchChipTextActive]}>{s.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* Overall Stat Banner */}
            <View style={styles.overallBanner}>
                <Text style={styles.overallText}>Working Days Tracked</Text>
                <Text style={styles.overallNum}>{totalWorkingDays}</Text>
            </View>

            {/* List */}
            {loading ? (
                <View style={styles.center}><ActivityIndicator size="large" color={C.orange} /></View>
            ) : (
                <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
                    {memberStats.length === 0 ? (
                        <Text style={styles.emptyText}>No members found for this batch.</Text>
                    ) : (
                        memberStats.map(m => (
                            <View key={m.id} style={[styles.card, m.isSuspended && styles.cardSuspended]}>
                                <View style={styles.cardHeader}>
                                    <View style={[styles.avatar, { backgroundColor: m.isSuspended ? C.pillBg : isDark ? C.bg : '#FFF0E5' }]}>
                                        <Text style={[styles.avatarText, { color: m.isSuspended ? C.sub : C.orange }]}>{m.fullName.charAt(0)}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.name, m.isSuspended && { color: C.sub }]} numberOfLines={1}>{m.fullName}</Text>
                                        <Text style={styles.phone}>{m.phoneNumber}</Text>
                                    </View>

                                    {m.isSuspended ? (
                                        <View style={styles.suspBadge}>
                                            <PauseCircle size={12} color={isDark ? C.orange : "#92400E"} strokeWidth={2.5} />
                                            <Text style={styles.suspBadgeText}>Suspended</Text>
                                        </View>
                                    ) : (
                                        <View style={styles.percentageWrap}>
                                            <Text style={[styles.percentageText, m.percentage >= 75 ? { color: C.green } : m.percentage >= 50 ? { color: C.orange } : { color: C.red }]}>
                                                {m.percentage}%
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                {!m.isSuspended && (
                                    <>
                                        <View style={styles.progressTrack}>
                                            <View
                                                style={[
                                                    styles.progressFill,
                                                    { width: `${m.percentage}%` },
                                                    m.percentage >= 75 ? { backgroundColor: C.green } : m.percentage >= 50 ? { backgroundColor: C.orange } : { backgroundColor: C.red }
                                                ]}
                                            />
                                        </View>
                                        <View style={styles.statsFooter}>
                                            <Text style={styles.statsFooterText}>
                                                <Text style={{ fontWeight: '800', color: C.text }}>{m.presentCount}</Text> days present
                                            </Text>
                                            <Text style={styles.statsFooterText}>
                                                <Text style={{ fontWeight: '800', color: C.text }}>{m.userWorkingDays}</Text> total days
                                            </Text>
                                        </View>
                                    </>
                                )}
                            </View>
                        ))
                    )}
                </ScrollView>
            )}
        </View>
    );
}

const makeStyles = (C: any, isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border },
    backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
    headerTitle: { fontSize: 18, fontWeight: '800', color: C.text },
    headerSub: { fontSize: 12, color: C.sub, marginTop: 2 },
    monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
    navBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
    monthName: { fontSize: 16, fontWeight: '800', color: C.text },
    mainTabs: { flexDirection: 'row', backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
    mainTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 6, borderBottomWidth: 3, borderBottomColor: 'transparent' },
    mainTabActive: { borderBottomColor: C.orange, backgroundColor: isDark ? C.pillBg : '#FFF9F5' },
    mainTabText: { fontSize: 14, fontWeight: '700', color: C.sub },
    mainTabTextActive: { color: C.text },
    batchRow: { paddingVertical: 12, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
    batchChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
    batchChipActive: { backgroundColor: isDark ? '#431407' : '#FFF0E5', borderColor: C.orange },
    batchChipText: { fontSize: 13, fontWeight: '600', color: C.sub },
    batchChipTextActive: { color: C.orange, fontWeight: '700' },
    overallBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: isDark ? '#064E3B' : '#E8F5E9', paddingHorizontal: 20, paddingVertical: 12 },
    overallText: { fontSize: 13, fontWeight: '700', color: C.green },
    overallNum: { fontSize: 16, fontWeight: '900', color: C.green },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: { padding: 16, paddingBottom: 60, gap: 12 },
    emptyText: { textAlign: 'center', color: C.sub, marginTop: 40, fontSize: 15 },
    card: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border },
    cardSuspended: { backgroundColor: C.bg, borderColor: C.border, opacity: 0.8 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 18, fontWeight: '800' },
    name: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 2 },
    phone: { fontSize: 12, color: C.sub, fontWeight: '500' },
    percentageWrap: { alignItems: 'flex-end' },
    percentageText: { fontSize: 20, fontWeight: '900' },
    progressTrack: { height: 6, backgroundColor: C.bg, borderRadius: 3, marginTop: 16, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 3 },
    statsFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    statsFooterText: { fontSize: 12, color: C.sub },
    suspBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isDark ? '#451A03' : '#FFFBEB', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
    suspBadgeText: { fontSize: 12, fontWeight: '700', color: isDark ? C.orange : '#92400E' },
});
