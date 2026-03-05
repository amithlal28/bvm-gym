import AsyncStorage from '@react-native-async-storage/async-storage';

let Notifications: any = null;
try {
    Notifications = require('expo-notifications');
} catch (_) { /* Not installed — graceful degradation */ }

export const NOTIF_STORAGE_KEYS = {
    SUSPENSION: '@notif_suspension',
    ATTENDANCE: '@notif_attendance',
    ATTENDANCE_TIME: '@notif_attendance_time',
    FEE: '@notif_fee',
    FEE_DAY: '@notif_fee_day',
    AUTO_SUSPEND_DAYS: '@auto_suspend_days',
};

/**
 * EXPORTED HELPER — call this from wherever a member is suspended
 * to fire a suspension push notification if the user has enabled it.
 */
export const sendSuspensionNotification = async (memberName: string, activity: string) => {
    if (!Notifications) return;
    try {
        const enabled = await AsyncStorage.getItem(NOTIF_STORAGE_KEYS.SUSPENSION);
        if (enabled !== 'true') return;
        await Notifications.scheduleNotificationAsync({
            content: {
                title: '⏸ Member Suspended',
                body: `${memberName} has been suspended from ${activity}.`,
                sound: true,
            },
            trigger: null, // immediate
        });
    } catch (_) { }
};
