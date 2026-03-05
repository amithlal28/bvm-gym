import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity,
    Platform, Alert, ActivityIndicator, TextInput
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, Settings2, CalendarClock, CreditCard, PauseCircle, BellOff, BellRing, Clock, Calendar, Moon, Sun, Zap, Bell } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppTimePicker } from '../components/AppTimePicker';
import { AppDayPicker } from '../components/AppDayPicker';
import { useTheme } from '../contexts/ThemeContext';

/**
 * NOTE: expo-notifications is used for scheduling local notifications.
 * The actual push notification delivery requires a native build (APK / IPA).
 * In Expo Go this will show a warning — the toggles still save properly.
 */
let Notifications: any = null;
let Device: any = null;
try {
    Notifications = require('expo-notifications');
    Device = require('expo-device');
} catch (_) { /* Not installed — graceful degradation */ }




import { NOTIF_STORAGE_KEYS } from '../lib/notifications';

const STORAGE_KEYS = NOTIF_STORAGE_KEYS;

const ATTENDANCE_NOTIF_ID = 'attendance_reminder_daily';
const FEE_NOTIF_ID = 'fee_reminder_monthly';

interface ToggleRowProps {
    icon: React.ReactNode;
    iconBg: string;
    title: string;
    subtitle: string;
    value: boolean;
    onChange: (v: boolean) => void;
    accentColor: string;
    textColor?: string;
    subColor?: string;
    borderColor?: string;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ icon, iconBg, title, subtitle, value, onChange, accentColor, textColor = '#1A1A2E', subColor = '#93959F', borderColor = '#F0F0F0' }) => (
    <View style={[styles.toggleRow, { borderColor }]}>
        <View style={[styles.toggleIcon, { backgroundColor: iconBg }]}>{icon}</View>
        <View style={styles.toggleInfo}>
            <Text style={[styles.toggleTitle, { color: textColor }]}>{title}</Text>
            <Text style={[styles.toggleSub, { color: subColor }]}>{subtitle}</Text>
        </View>
        <Switch
            value={value}
            onValueChange={onChange}
            trackColor={{ false: borderColor, true: `${accentColor}55` }}
            thumbColor={value ? accentColor : '#fff'}
        />
    </View>
);

const NotificationSettingsScreen = () => {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const safeTop = insets.top > 0 ? insets.top : Platform.OS === 'android' ? 24 : 0;
    const { isDark, toggleTheme, colors: C } = useTheme();
    const [seeding, setSeeding] = useState(false);

    const [suspensionNotif, setSuspensionNotif] = useState(false);
    const [attendanceNotif, setAttendanceNotif] = useState(false);
    const [attendanceTime, setAttendanceTime] = useState(new Date());
    const [showTimePicker, setShowTimePicker] = useState(false);

    const [feeNotif, setFeeNotif] = useState(false);
    const [feeDay, setFeeDay] = useState('1');
    const [showDayPicker, setShowDayPicker] = useState(false);

    const [autoSuspendDays, setAutoSuspendDays] = useState('30');

    const [permGranted, setPermGranted] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSettings();
        checkPermissions();
    }, []);

    const loadSettings = async () => {
        try {
            const [s, a, f, aTime, fDay, asDays] = await Promise.all([
                AsyncStorage.getItem(STORAGE_KEYS.SUSPENSION),
                AsyncStorage.getItem(STORAGE_KEYS.ATTENDANCE),
                AsyncStorage.getItem(STORAGE_KEYS.FEE),
                AsyncStorage.getItem(STORAGE_KEYS.ATTENDANCE_TIME),
                AsyncStorage.getItem(STORAGE_KEYS.FEE_DAY),
                AsyncStorage.getItem(STORAGE_KEYS.AUTO_SUSPEND_DAYS),
            ]);

            setSuspensionNotif(s === 'true');
            setAttendanceNotif(a === 'true');
            setFeeNotif(f === 'true');

            if (aTime) {
                const parsedDate = new Date(aTime);
                if (!isNaN(parsedDate.getTime())) {
                    setAttendanceTime(parsedDate);
                }
            } else {
                // Default to 10:00 PM if no time is saved
                setAttendanceTime(new Date(new Date().setHours(22, 0, 0, 0)));
            }
            if (fDay) setFeeDay(fDay);
            if (asDays) setAutoSuspendDays(asDays);
        } catch (err) {
            console.error('Error loading settings:', err);
        } finally {
            setLoading(false);
        }
    };

    const checkPermissions = async () => {
        if (!Notifications || !Device) { setPermGranted(false); return; }
        try {
            if (!Device.isDevice) { setPermGranted(false); return; }
            const { status } = await Notifications.getPermissionsAsync();
            setPermGranted(status === 'granted');
        } catch (_) { setPermGranted(false); }
    };

    const requestPermissions = async (): Promise<boolean> => {
        if (!Notifications || !Device) return false;
        try {
            if (!Device.isDevice) {
                Alert.alert('Simulator', 'Notifications only work on a physical device.');
                return false;
            }
            const { status } = await Notifications.requestPermissionsAsync();
            const granted = status === 'granted';
            setPermGranted(granted);
            if (!granted) {
                Alert.alert('Permission Denied', 'Please enable notifications in your phone settings for BVM Gym.');
            }
            return granted;
        } catch (_) { return false; }
    };

    const scheduleAttendanceReminder = async (enable: boolean, timeObj: Date = attendanceTime) => {
        if (!Notifications) return;
        try {
            await Notifications.cancelScheduledNotificationAsync(ATTENDANCE_NOTIF_ID).catch(() => { });
            if (enable) {
                await Notifications.scheduleNotificationAsync({
                    identifier: ATTENDANCE_NOTIF_ID,
                    content: {
                        title: '📋 Attendance Reminder',
                        body: 'Don\'t forget to mark today\'s attendance for all batches!',
                        sound: true,
                    },
                    trigger: {
                        hour: timeObj.getHours(),
                        minute: timeObj.getMinutes(),
                        repeats: true,
                    },
                });
            }
        } catch (e: any) { console.warn('Attendance schedule error:', e.message); }
    };

    const scheduleFeeReminder = async (enable: boolean, dayStr: string = feeDay) => {
        if (!Notifications) return;
        try {
            await Notifications.cancelScheduledNotificationAsync(FEE_NOTIF_ID).catch(() => { });
            if (enable) {
                const triggerDay = parseInt(dayStr) || 1;
                await Notifications.scheduleNotificationAsync({
                    identifier: FEE_NOTIF_ID,
                    content: {
                        title: '💳 Fee Collection Reminder',
                        body: 'Check pending fees for this month. Some members may have outstanding dues.',
                        sound: true,
                    },
                    trigger: {
                        day: triggerDay,
                        hour: 10,
                        minute: 0,
                        repeats: true,
                    },
                });
            }
        } catch (e: any) { console.warn('Fee schedule error:', e.message); }
    };

    const handleSuspensionToggle = async (v: boolean) => {
        if (v && !permGranted) {
            const ok = await requestPermissions();
            if (!ok) return;
        }
        setSuspensionNotif(v);
        await AsyncStorage.setItem(STORAGE_KEYS.SUSPENSION, String(v));
    };

    const handleAttendanceToggle = async (v: boolean) => {
        if (v && !permGranted) {
            const ok = await requestPermissions();
            if (!ok) return;
        }
        setAttendanceNotif(v);
        await AsyncStorage.setItem(STORAGE_KEYS.ATTENDANCE, String(v));
        await scheduleAttendanceReminder(v);
    };

    const handleFeeToggle = async (v: boolean) => {
        if (v && !permGranted) {
            const ok = await requestPermissions();
            if (!ok) return;
        }
        setFeeNotif(v);
        await AsyncStorage.setItem(STORAGE_KEYS.FEE, String(v));
        await scheduleFeeReminder(v);
    };

    const onTimeChange = async (selectedDate: Date) => {
        setShowTimePicker(false);
        if (selectedDate) {
            // Force a new Date instance to ensure state triggers re-render across all components
            const safeDate = new Date(selectedDate.getTime());
            setAttendanceTime(safeDate);
            try {
                await AsyncStorage.setItem(STORAGE_KEYS.ATTENDANCE_TIME, safeDate.toISOString());
                if (attendanceNotif) {
                    await scheduleAttendanceReminder(true, safeDate);
                }
            } catch (err) {
                console.error('Error saving time:', err);
                Alert.alert('Error', 'Failed to save attendance time.');
            }
        }
    };

    const onFeeDayChange = async (dayStr: string) => {
        setShowDayPicker(false);
        setFeeDay(dayStr);
        await AsyncStorage.setItem(STORAGE_KEYS.FEE_DAY, dayStr);
        if (feeNotif) await scheduleFeeReminder(true, dayStr);
    };

    const onAutoSuspendDaysChange = async (text: string) => {
        let num = text.replace(/[^0-9]/g, '');
        if (parseInt(num) > 365) num = '365';
        setAutoSuspendDays(num);
        await AsyncStorage.setItem(STORAGE_KEYS.AUTO_SUSPEND_DAYS, num);
    };


    const formatTime = (date: Date) => {
        let h = date.getHours();
        const m = date.getMinutes();
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12;
        const ms = m < 10 ? '0' + m : m;
        return `${h}:${ms} ${ampm}`;
    };

    const anyEnabled = suspensionNotif || attendanceNotif || feeNotif;

    return (
        <View style={[styles.container, { backgroundColor: C.bg }]}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: safeTop, backgroundColor: C.headerBg, borderBottomColor: C.border }]}>
                <TouchableOpacity style={[styles.backBtn, { backgroundColor: C.bg, borderColor: C.border }]} onPress={() => navigation.goBack()}>
                    <ChevronLeft size={22} color={C.text} strokeWidth={2.5} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.headerTitle, { color: C.text }]}>Settings</Text>
                    <Text style={[styles.headerSub, { color: C.sub }]}>Notifications & system preferences</Text>
                </View>
                <View style={[styles.statusChip, { backgroundColor: anyEnabled ? '#ECFDF5' : C.pillBg }]}>
                    {anyEnabled
                        ? <BellRing size={14} color={C.green} strokeWidth={2.5} />
                        : <Settings2 size={14} color={C.sub} strokeWidth={2.5} />}
                    <Text style={[styles.statusChipText, { color: anyEnabled ? C.green : C.sub }]}>
                        {anyEnabled ? 'Active' : 'Settings'}
                    </Text>
                </View>
            </View>

            {loading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="large" color={C.orange} />
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                    {/* Dark Mode Section */}
                    <Text style={[styles.sectionTitle, { color: C.sub }]}>Appearance</Text>
                    <View style={[styles.card, { backgroundColor: C.card }]}>
                        <ToggleRow
                            icon={isDark ? <Sun size={20} color={C.gold} strokeWidth={2.5} /> : <Moon size={20} color='#8B5CF6' strokeWidth={2.5} />}
                            iconBg={isDark ? '#2C2000' : '#EEF0FF'}
                            title="Dark Mode"
                            subtitle={isDark ? 'Dark theme active across all screens' : 'Switch to a dark, eye-friendly theme'}
                            value={isDark}
                            onChange={toggleTheme}
                            accentColor={isDark ? C.gold : '#8B5CF6'}
                            textColor={C.text}
                            subColor={C.sub}
                            borderColor={C.border}
                        />
                    </View>

                    {/* Permission Warning */}
                    {permGranted === false && (
                        <TouchableOpacity style={styles.permBanner} onPress={requestPermissions} activeOpacity={0.8}>
                            <Bell size={16} color="#92400E" strokeWidth={2.5} />
                            <Text style={styles.permBannerText}>Tap here to grant notification permission so alerts can be delivered to your phone.</Text>
                        </TouchableOpacity>
                    )}

                    {/* Notification Section */}
                    <Text style={[styles.sectionTitle, { color: C.sub }]}>Alert Types</Text>
                    <View style={[styles.card, { backgroundColor: C.card }]}>
                        <ToggleRow
                            icon={<PauseCircle size={20} color={C.amber} strokeWidth={2.5} />}
                            iconBg={isDark ? '#2C1500' : '#FFFBEB'}
                            title="Member Suspension"
                            subtitle="Get notified when a member is suspended (manually or auto)"
                            value={suspensionNotif}
                            onChange={handleSuspensionToggle}
                            accentColor={C.amber}
                            textColor={C.text} subColor={C.sub} borderColor={C.border}
                        />
                        <View style={[styles.rowDivider, { backgroundColor: C.border }]} />
                        <ToggleRow
                            icon={<CalendarClock size={20} color={C.blue} strokeWidth={2.5} />}
                            iconBg={isDark ? '#001230' : '#EFF6FF'}
                            title="Daily Attendance Reminder"
                            subtitle="Reminds you daily if attendance hasn't been marked"
                            value={attendanceNotif}
                            onChange={handleAttendanceToggle}
                            accentColor={C.blue}
                            textColor={C.text} subColor={C.sub} borderColor={C.border}
                        />
                        {attendanceNotif && (
                            <View style={[styles.configRow, { backgroundColor: C.inputBg, borderTopColor: C.border }]}>
                                <Text style={[styles.configLabel, { color: C.text }]}>Reminder Time</Text>
                                <TouchableOpacity style={[styles.configBtn, { backgroundColor: C.card, borderColor: C.border }]} onPress={() => setShowTimePicker(true)}>
                                    <Clock size={14} color={C.blue} strokeWidth={2.5} />
                                    <Text style={[styles.configValue, { color: C.blue }]}>{formatTime(attendanceTime)}</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        {showTimePicker && (
                            <AppTimePicker
                                visible={showTimePicker}
                                initialDate={attendanceTime}
                                onClose={() => setShowTimePicker(false)}
                                onConfirm={onTimeChange}
                            />
                        )}
                        <View style={[styles.rowDivider, { backgroundColor: C.border }]} />
                        <ToggleRow
                            icon={<CreditCard size={20} color={C.green} strokeWidth={2.5} />}
                            iconBg={isDark ? '#001A0D' : '#ECFDF5'}
                            title="Fee Reminder"
                            subtitle="Monthly reminder to collect pending fees"
                            value={feeNotif}
                            onChange={handleFeeToggle}
                            accentColor={C.green}
                            textColor={C.text} subColor={C.sub} borderColor={C.border}
                        />
                        {feeNotif && (
                            <View style={[styles.configRow, { backgroundColor: C.inputBg, borderTopColor: C.border }]}>
                                <Text style={[styles.configLabel, { color: C.text }]}>Day of month</Text>
                                <TouchableOpacity style={[styles.configBtn, { paddingVertical: 6, backgroundColor: C.card, borderColor: C.border }]} onPress={() => setShowDayPicker(true)}>
                                    <Calendar size={14} color={C.green} strokeWidth={2.5} />
                                    <Text style={[styles.configValue, { color: C.green }]}>
                                        {feeDay}{feeDay.endsWith('1') && feeDay !== '11' ? 'st' : feeDay.endsWith('2') && feeDay !== '12' ? 'nd' : feeDay.endsWith('3') && feeDay !== '13' ? 'rd' : 'th'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        {showDayPicker && (
                            <AppDayPicker
                                visible={showDayPicker}
                                initialDay={feeDay}
                                onClose={() => setShowDayPicker(false)}
                                onConfirm={onFeeDayChange}
                            />
                        )}
                    </View>

                    {/* Info Card */}
                    <View style={[styles.infoCard, { backgroundColor: C.card, borderColor: C.border }]}>
                        <Bell size={16} color={C.sub} strokeWidth={2} />
                        <Text style={[styles.infoText, { color: C.sub }]}>
                            Notifications are delivered locally on your device. An internet connection is not required.
                            Make sure notifications are enabled in your phone's Settings → BVM Gym.
                        </Text>
                    </View>

                    {/* System Rules */}
                    <Text style={[styles.sectionTitle, { color: C.sub, marginTop: 12 }]}>System Rules</Text>
                    <View style={[styles.card, { backgroundColor: C.card }]}>
                        <View style={styles.scheduleRow}>
                            <View style={{ flex: 1, paddingRight: 16 }}>
                                <Text style={[styles.scheduleLabel, { color: C.text }]}>Auto-Suspension threshold</Text>
                                <Text style={{ fontSize: 12, color: C.sub, marginTop: 4, lineHeight: 18 }}>Require this many days of absence before auto-suspending member.</Text>
                            </View>
                            <View style={[styles.configBtn, { paddingVertical: 4, paddingHorizontal: 12, backgroundColor: C.card, borderColor: C.border }]}>
                                <TextInput
                                    style={[styles.configValue, { color: C.amber, width: 35, textAlign: 'center', fontWeight: '800', padding: 0 }]}
                                    value={autoSuspendDays}
                                    onChangeText={onAutoSuspendDaysChange}
                                    keyboardType="number-pad"
                                    maxLength={3}
                                />
                                <Text style={[styles.configLabel, { color: C.sub, fontSize: 11 }]}>days</Text>
                            </View>
                        </View>
                    </View>

                    {/* Schedule summary */}
                    <Text style={[styles.sectionTitle, { color: C.sub, marginTop: 12 }]}>Current Notification Schedule</Text>
                    <View style={[styles.card, { backgroundColor: C.card }]}>
                        <View style={styles.scheduleRow}>
                            <Text style={[styles.scheduleLabel, { color: C.text }]}>Attendance Reminder</Text>
                            <Text style={[styles.scheduleValue, { color: attendanceNotif ? C.blue : C.sub }]}>
                                {attendanceNotif ? `Daily at ${formatTime(attendanceTime)}` : 'Off'}
                            </Text>
                        </View>
                        <View style={[styles.rowDivider, { backgroundColor: C.border }]} />
                        <View style={styles.scheduleRow}>
                            <Text style={[styles.scheduleLabel, { color: C.text }]}>Fee Reminder</Text>
                            <Text style={[styles.scheduleValue, { color: feeNotif ? C.green : C.sub }]}>
                                {feeNotif ? `On the ${feeDay}${feeDay.endsWith('1') && feeDay !== '11' ? 'st' : feeDay.endsWith('2') && feeDay !== '12' ? 'nd' : feeDay.endsWith('3') && feeDay !== '13' ? 'rd' : 'th'} of month` : 'Off'}
                            </Text>
                        </View>
                        <View style={[styles.rowDivider, { backgroundColor: C.border }]} />
                        <View style={styles.scheduleRow}>
                            <Text style={[styles.scheduleLabel, { color: C.text }]}>Suspension Alerts</Text>
                            <Text style={[styles.scheduleValue, { color: suspensionNotif ? C.amber : C.sub }]}>
                                {suspensionNotif ? 'When triggered' : 'Off'}
                            </Text>
                        </View>
                    </View>

                </ScrollView>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingBottom: 16,
        borderBottomWidth: 1,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1,
    },
    headerTitle: { fontSize: 18, fontWeight: '800' },
    headerSub: { fontSize: 12, marginTop: 2 },
    statusChip: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
    },
    statusChipText: { fontSize: 12, fontWeight: '700' },
    content: { padding: 16, paddingBottom: 80, gap: 8 },
    permBanner: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 12,
        backgroundColor: '#FFFBEB', borderRadius: 16, padding: 16,
        borderWidth: 1, borderColor: '#FDE68A', marginBottom: 8,
    },
    permBannerText: { flex: 1, fontSize: 13, color: '#92400E', fontWeight: '600', lineHeight: 20 },
    sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 8, marginBottom: 4, marginLeft: 4 },
    card: {
        borderRadius: 20, overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    },
    toggleRow: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingHorizontal: 16, paddingVertical: 16,
    },
    toggleIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    toggleInfo: { flex: 1 },
    toggleTitle: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
    toggleSub: { fontSize: 12, lineHeight: 17 },
    rowDivider: { height: 1, marginHorizontal: 16 },
    infoCard: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        borderRadius: 16, padding: 14,
        borderWidth: 1, marginTop: 4, marginBottom: 4,
    },
    infoText: { flex: 1, fontSize: 12, lineHeight: 18 },
    scheduleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
    scheduleLabel: { fontSize: 14, fontWeight: '600' },
    scheduleValue: { fontSize: 13, fontWeight: '700' },
    configRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
    configLabel: { fontSize: 13, fontWeight: '600' },
    configBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
    configValue: { fontSize: 13, fontWeight: '700' },
});

export default NotificationSettingsScreen;

