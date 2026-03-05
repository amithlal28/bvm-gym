import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    ActivityIndicator, StatusBar, Alert
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ChevronLeft, Download, FileSpreadsheet,
    CreditCard, Users, Check
} from 'lucide-react-native';
import { format, subMonths, getDaysInMonth, parseISO } from 'date-fns';
import { RootStackParamList } from '../types/navigation';
import { useTheme } from '../contexts/ThemeContext';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx-js-style';
import {
    getActiveUsers, getAttendanceByMonth, getAllSessions, getBillsByMonth, GYM_DEFAULT_SESSION_ID,
    getSuspensionsByMonth
} from '../lib/services';
import { User, Billing, Attendance, Session } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// --- Helper Functions ---

// Gets last N months for selection
const getRecentMonths = (num = 12) => {
    const months = [];
    const today = new Date();
    for (let i = 0; i < num; i++) {
        months.push(subMonths(today, i));
    }
    return months;
};

// Calculates optimal column widths
const getColWidths = (data: any[][], minWidths: number[] = []) => {
    const colWidths: number[] = [];
    data.forEach(row => {
        row.forEach((cell, i) => {
            const val = cell !== null && cell !== undefined ? String(cell) : '';
            const len = val.length + 2;
            if (!colWidths[i] || colWidths[i] < len) colWidths[i] = len;
        });
    });
    return colWidths.map((w, i) => Math.max(w, minWidths[i] || 10)); // default minimum 10
};

// Applies Professional Styles to the Excel Worksheet
const applyStylesToSheet = (ws: any, rowCount: number, colCount: number, colWidths: number[], headingRows: number[] = []) => {
    ws['!cols'] = colWidths.map(w => ({ wch: w }));

    for (let r = 0; r < rowCount; r++) {
        // Is this a Heading Row (e.g., "March 2026")?
        if (headingRows.includes(r)) {
            const cellRef = XLSX.utils.encode_cell({ c: 0, r });
            if (ws[cellRef]) {
                ws[cellRef].s = {
                    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 14 },
                    fill: { fgColor: { rgb: "1E293B" } }, // Dark Slate color for Month Headings
                    alignment: { horizontal: "center", vertical: "center" },
                    border: {
                        top: { style: "medium", color: { rgb: "333333" } },
                        bottom: { style: "medium", color: { rgb: "333333" } },
                    }
                };
            }
            continue;
        }

        // Determine if this is a column header row (it usually comes right after a Month Heading or at r=0 if no multi-month, but with multi-month it's r = headingRow + 1)
        const isColHeader = headingRows.includes(r - 1) || r === 0;

        for (let c = 0; c < colCount; c++) {
            const cellRef = XLSX.utils.encode_cell({ c, r });
            if (!ws[cellRef]) continue;

            if (isColHeader) {
                ws[cellRef].s = {
                    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
                    fill: { fgColor: { rgb: "FC8019" } },  // Brand Orange Header
                    alignment: { horizontal: "center", vertical: "center" },
                    border: {
                        top: { style: "thin", color: { auto: 1 } },
                        bottom: { style: "medium", color: { rgb: "333333" } },
                        left: { style: "thin", color: { auto: 1 } },
                        right: { style: "thin", color: { auto: 1 } }
                    }
                };
            } else {
                // Regular Data Rows
                const isAlternate = r % 2 === 0;
                const val = ws[cellRef].v;

                let fontColor = "333333";
                let fontBold = false;
                let align = typeof val === 'number' ? 'right' : 'left';

                // Conditional Formatting for specific values
                if (val === 'P' || val === 'Paid') { fontColor = "10B981"; fontBold = true; align = "center"; }
                else if (val === 'A' || val === 'Pending') { fontColor = "EF4444"; fontBold = true; align = "center"; }
                else if (val === 'S' || val === 'Suspended') { fontColor = "F59E0B"; fontBold = true; align = "center"; } // 'S' for suspended marked as Orange

                ws[cellRef].s = {
                    font: { sz: 11, color: { rgb: fontColor }, bold: fontBold },
                    fill: isAlternate ? { fgColor: { rgb: "F9FAFB" } } : undefined, // Subtle row banding
                    alignment: { horizontal: align, vertical: "center", wrapText: true },
                    border: {
                        top: { style: "thin", color: { rgb: "E5E7EB" } },
                        bottom: { style: "thin", color: { rgb: "E5E7EB" } },
                        left: { style: "thin", color: { rgb: "E5E7EB" } },
                        right: { style: "thin", color: { rgb: "E5E7EB" } }
                    }
                };
            }
        }
    }
};


export default function ReportsScreen() {
    const navigation = useNavigation<Nav>();
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useTheme();

    const [availableMonths, setAvailableMonths] = useState<Date[]>([]);
    const [selectedMonths, setSelectedMonths] = useState<string[]>([]); // Array of "YYYY-MM" strings
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        const recent = getRecentMonths();
        setAvailableMonths(recent);
        if (recent.length > 0) {
            setSelectedMonths([format(recent[0], 'yyyy-MM')]); // Default select current month
        }
    }, []);

    const toggleMonth = (monthStr: string) => {
        setSelectedMonths(prev =>
            prev.includes(monthStr)
                ? prev.filter(m => m !== monthStr)
                : [...prev, monthStr].sort() // Keep them chronologically sorted
        );
    };

    const exportAttendance = async () => {
        if (selectedMonths.length === 0) return Alert.alert("Select Month", "Please select at least one month to export.");

        setIsExporting(true);
        try {
            const [users, sessions] = await Promise.all([
                getActiveUsers(),
                getAllSessions()
            ]);

            const wb = XLSX.utils.book_new();
            const sheetNames = new Set<string>();

            // Helper to generate the data for a specific sheet (Gym or Badminton Batch) over multiple months
            const buildSheetDataForSession = async (sheetName: string, targetSessionId: string, filteredUsers: User[]) => {
                const multiMonthData: any[][] = [];
                const headingRows: number[] = []; // Keep track of which rows are Month Headings
                const baseWidths = [22, 14, ...Array.from({ length: 31 }, () => 4), 12];
                let maxCols = 4; // Start with minimum cols (Name, Phone, Day1, Total)

                // Iterate through each selected month
                for (let i = 0; i < selectedMonths.length; i++) {
                    const monthKey = selectedMonths[i];
                    const [yyyy, MM] = monthKey.split('-');
                    const monthDate = new Date(parseInt(yyyy), parseInt(MM) - 1, 1);
                    const formattedMonthName = format(monthDate, 'MMMM yyyy'); // e.g. "March 2026"

                    const attendanceForMonth = await getAttendanceByMonth(monthKey);
                    const suspensionsForMonth = await getSuspensionsByMonth(monthKey); // Fetch suspensions

                    const daysInMonth = getDaysInMonth(monthDate);
                    const daysArray = Array.from({ length: daysInMonth }, (_, d) => d + 1);

                    if (daysInMonth + 3 > maxCols) maxCols = daysInMonth + 3; // +3 for Name, Phone, Total

                    // 1. Add Month Heading Row
                    headingRows.push(multiMonthData.length);
                    // The first cell gets the text, the rest are blank for merging
                    const headingRow = [formattedMonthName.toUpperCase(), ...Array.from({ length: daysInMonth + 1 }, () => '')];
                    multiMonthData.push(headingRow);

                    // 2. Add Column Header Row for this month
                    const header = ['Member Name', 'Phone', ...daysArray.map(d => String(d)), 'Tot. Present'];
                    multiMonthData.push(header);

                    // 3. Add Data Rows
                    filteredUsers.forEach(u => {
                        const userAtt = attendanceForMonth.filter(a => a.userId === u.id && a.sessionId === targetSessionId);
                        let totalPresent = 0;
                        const row: any[] = [u.fullName, u.phoneNumber];

                        daysArray.forEach(d => {
                            const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;
                            const isFutureDate = new Date(dateStr) > new Date(); // Check if date is in the future
                            const isSuspended = suspensionsForMonth.some(s => s.sessionId === targetSessionId && s.date === dateStr);

                            // Check Individual User Suspension
                            let isUserSuspendedOnDate = false;
                            const suspendedAtStr = targetSessionId === GYM_DEFAULT_SESSION_ID ? u.gymSuspendedAt : u.badmintonSuspendedAt;

                            if (suspendedAtStr) {
                                // Extract the YYYY-MM-DD portion or parse the date
                                const suspendedDateObj = new Date(suspendedAtStr);
                                const currentDateObj = new Date(dateStr);
                                // Set hours to 0 to compare just the dates accurately
                                suspendedDateObj.setHours(0, 0, 0, 0);
                                currentDateObj.setHours(0, 0, 0, 0);

                                if (currentDateObj >= suspendedDateObj) {
                                    isUserSuspendedOnDate = true;
                                }
                            }

                            if (isUserSuspendedOnDate) {
                                // Do not show attendance from the day they are suspended
                                row.push('');
                                return;
                            }

                            const present = userAtt.find(a => a.date === dateStr)?.isPresent;
                            if (present) {
                                row.push('P');
                                totalPresent++;
                            } else {
                                if (isFutureDate) {
                                    row.push('');
                                } else if (isSuspended) {
                                    row.push('S'); // Mark as 'S' if batch suspended on this day
                                } else {
                                    row.push('A');
                                }
                            }
                        });
                        row.push(totalPresent);
                        multiMonthData.push(row);
                    });

                    // Add empty row for spacing between months (except last)
                    if (i < selectedMonths.length - 1) {
                        multiMonthData.push([]);
                    }
                }

                // If nothing to add, skip
                if (multiMonthData.length === 0) return;

                const ws = XLSX.utils.aoa_to_sheet(multiMonthData);

                // Merge cells for Month Heading Rows across all used columns
                if (!ws['!merges']) ws['!merges'] = [];
                headingRows.forEach(rowIndex => {
                    ws['!merges'].push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: maxCols - 1 } });
                });

                const colWidths = getColWidths(multiMonthData, baseWidths);
                applyStylesToSheet(ws, multiMonthData.length, maxCols, colWidths, headingRows);

                let safeName = sheetName.replace(/[\[\]\\\/\?\*]/g, '').substring(0, 31);
                if (sheetNames.has(safeName)) safeName = safeName.substring(0, 28) + "...";
                sheetNames.add(safeName);

                XLSX.utils.book_append_sheet(wb, ws, safeName);
            };

            // 1. Build Gym Sheet
            const gymUsers = users.filter(u => u.isGymMember);
            await buildSheetDataForSession("Gym Attendance", GYM_DEFAULT_SESSION_ID, gymUsers);

            // 2. Build Badminton Sheets
            const badmintonSessions = sessions.filter(s => s.activityType === 'Badminton');
            for (const session of badmintonSessions) {
                const badUsers = users.filter(u => u.isBadmintonMember && u.badmintonSessionId === session.id);
                await buildSheetDataForSession(session.name, session.id, badUsers);
            }

            // Write File
            const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
            // Name file appropriately depending on single vs multi-month
            const fileNameDateStr = selectedMonths.length === 1 ? selectedMonths[0] : `${selectedMonths[0]}_to_${selectedMonths[selectedMonths.length - 1]}`;
            const uri = `${FileSystem.documentDirectory}Attendance_${fileNameDateStr}.xlsx`;

            await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });

            await Sharing.shareAsync(uri, {
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                dialogTitle: `Share Attendance Data`
            });

        } catch (error: any) {
            console.error("Export error:", error);
            Alert.alert("Export Error", error.message || "Something went wrong.");
        } finally {
            setIsExporting(false);
        }
    };

    const exportBilling = async () => {
        if (selectedMonths.length === 0) return Alert.alert("Select Month", "Please select at least one month to export.");

        setIsExporting(true);
        try {
            const [users, sessions] = await Promise.all([
                getActiveUsers(),
                getAllSessions()
            ]);

            const wb = XLSX.utils.book_new();
            const sheetNames = new Set<string>();

            // Helper to generate Billing Sheet Data across multiple months
            const buildBillingSheetForContext = async (sheetName: string, filterLogic: (u: User, b: Billing) => boolean) => {
                const multiMonthData: any[][] = [];
                const headingRows: number[] = [];
                const minWidths = [22, 14, 16, 12, 12, 14];
                const colCount = 6; // Fixed number of columns for Billing

                for (let i = 0; i < selectedMonths.length; i++) {
                    const monthKey = selectedMonths[i];
                    const [yyyy, MM] = monthKey.split('-');
                    const monthDate = new Date(parseInt(yyyy), parseInt(MM) - 1, 1);
                    const formattedMonthName = format(monthDate, 'MMMM yyyy');

                    // Note: Billing service uses "MM-yyyy"
                    const billMonthStr = format(monthDate, 'MM-yyyy');
                    const billsForMonth = await getBillsByMonth(billMonthStr);
                    const attendanceForMonth = await getAttendanceByMonth(monthKey);

                    // Filter bills according to the provided logic (All, Gym, or specific Batch)
                    const filteredBills = billsForMonth.filter(b => {
                        const user = users.find(u => u.id === b.userId);
                        return user ? filterLogic(user, b) : false;
                    });

                    if (filteredBills.length === 0) continue;

                    // 1. Add Month Heading Row
                    headingRows.push(multiMonthData.length);
                    // First cell has text, others empty for merging
                    const headingRow = [formattedMonthName.toUpperCase(), ...Array.from({ length: colCount - 1 }, () => '')];
                    multiMonthData.push(headingRow);

                    // 2. Add Column Header
                    const header = ['Member Name', 'Phone', 'Activity Type', 'Fee Amount', 'Status', 'Payment Date'];
                    multiMonthData.push(header);

                    // 3. Add Data Rows
                    filteredBills.forEach(b => {
                        const user = users.find(u => u.id === b.userId);
                        if (user) {
                            let finalStatus: string = b.status;

                            if (finalStatus === 'Pending') {
                                const targetSessionId = b.activityType === 'Gym' ? GYM_DEFAULT_SESSION_ID : (user.isBadmintonMember ? user.badmintonSessionId : null);
                                let presentCount = 0;
                                if (targetSessionId) {
                                    presentCount = attendanceForMonth.filter(a => a.userId === user.id && a.sessionId === targetSessionId && a.isPresent).length;
                                }

                                let isSuspendedMember = false;
                                const suspendedAtStr = b.activityType === 'Gym' ? user.gymSuspendedAt : user.badmintonSuspendedAt;
                                if (suspendedAtStr) {
                                    const suspendedDateObj = new Date(suspendedAtStr);
                                    const lastDayOfMonth = new Date(parseInt(yyyy), parseInt(MM), 0); // Day 0 of next month is last day of current
                                    if (suspendedDateObj <= lastDayOfMonth) {
                                        isSuspendedMember = true;
                                    }
                                }

                                // Only mark as Suspended if they haven't attended at all OR they are actively suspended in the system
                                if (presentCount === 0 || isSuspendedMember) {
                                    finalStatus = 'Suspended';
                                }
                            }

                            const paidDate = b.paidOn?.toDate ? format(b.paidOn.toDate(), 'dd/MM/yyyy') : (b.paidOn ? 'Paid' : '-');
                            multiMonthData.push([
                                user.fullName,
                                user.phoneNumber,
                                b.activityType,
                                b.amount,
                                finalStatus,
                                finalStatus === 'Paid' ? paidDate : '-'
                            ]);
                        }
                    });

                    // Add empty row for spacing
                    if (i < selectedMonths.length - 1) {
                        multiMonthData.push([]);
                    }
                }

                if (multiMonthData.length === 0) return;

                const ws = XLSX.utils.aoa_to_sheet(multiMonthData);

                // Merge heading rows across 6 columns
                if (!ws['!merges']) ws['!merges'] = [];
                headingRows.forEach(rowIndex => {
                    ws['!merges'].push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: colCount - 1 } });
                });

                const colWidths = getColWidths(multiMonthData, minWidths);
                applyStylesToSheet(ws, multiMonthData.length, colCount, colWidths, headingRows);

                let safeName = sheetName.replace(/[\[\]\\\/\?\*]/g, '').substring(0, 31);
                if (sheetNames.has(safeName)) safeName = safeName.substring(0, 28) + "...";
                sheetNames.add(safeName);

                XLSX.utils.book_append_sheet(wb, ws, safeName);
            };

            // 1. All Members Sheet (All bills)
            await buildBillingSheetForContext("All Members", () => true);

            // 2. Gym Bills Sheet
            await buildBillingSheetForContext("Gym", (u, b) => b.activityType === 'Gym');

            // 3. Badminton Batch-Specific Sheets
            const badmSessions = sessions.filter(s => s.activityType === 'Badminton');
            for (const session of badmSessions) {
                // Must be badminton activity AND belong to this specific session
                await buildBillingSheetForContext(session.name, (u, b) => b.activityType === 'Badminton' && u.isBadmintonMember && u.badmintonSessionId === session.id);
            }

            const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
            const fileNameDateStr = selectedMonths.length === 1 ? selectedMonths[0] : `${selectedMonths[0]}_to_${selectedMonths[selectedMonths.length - 1]}`;
            const uri = `${FileSystem.documentDirectory}Billing_${fileNameDateStr}.xlsx`;

            await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });

            await Sharing.shareAsync(uri, {
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                dialogTitle: `Share Billing Data`
            });

        } catch (error: any) {
            console.error("Export error:", error);
            Alert.alert("Export Error", error.message || "Something went wrong.");
        } finally {
            setIsExporting(false);
        }
    };

    const styles = StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bg },
        headerRow: {
            flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20,
            paddingTop: insets.top + 16, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: colors.border
        },
        backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(128,128,128,0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
        headerTitle: { fontSize: 22, fontWeight: '800', color: colors.text },

        content: { padding: 24 },
        card: {
            backgroundColor: colors.card, borderRadius: 24, padding: 24,
            borderWidth: 1, borderColor: colors.border, marginBottom: 24,
            shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.3 : 0.05, shadowRadius: 12, elevation: 5
        },
        sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
        sectionSub: { fontSize: 13, color: colors.sub, marginBottom: 16 },

        monthsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
        monthChip: {
            paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
            borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg,
            flexDirection: 'row', alignItems: 'center', gap: 6
        },
        monthChipActive: {
            backgroundColor: colors.orange + '20', borderColor: colors.orange,
        },
        monthChipText: { fontSize: 14, fontWeight: '600', color: colors.text },
        monthChipTextActive: { color: colors.orange, fontWeight: '800' },

        actionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
        iconBoxAtt: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#10B98115', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
        iconBoxBill: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#FC801915', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
        btnTextContainer: { flex: 1 },
        btnTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
        btnSub: { fontSize: 12, color: colors.sub, fontWeight: '500' },

        loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
        loadingBox: { backgroundColor: colors.card, padding: 24, borderRadius: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
        loadingText: { marginTop: 16, fontSize: 16, fontWeight: '700', color: colors.text }
    });

    return (
        <View style={styles.container}>
            <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
            <View style={styles.headerRow}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <ChevronLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Export Reports</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Select Months</Text>
                    <Text style={styles.sectionSub}>Tap to select multiple months for a combined report.</Text>

                    <View style={styles.monthsContainer}>
                        {availableMonths.map((d, idx) => {
                            const val = format(d, 'yyyy-MM');
                            const isActive = selectedMonths.includes(val);
                            return (
                                <TouchableOpacity
                                    key={idx}
                                    style={[styles.monthChip, isActive && styles.monthChipActive]}
                                    onPress={() => toggleMonth(val)}
                                >
                                    {isActive && <Check size={14} color={colors.orange} strokeWidth={3} />}
                                    <Text style={[styles.monthChipText, isActive && styles.monthChipTextActive]}>
                                        {format(d, 'MMM yy')}
                                    </Text>
                                </TouchableOpacity>
                            )
                        })}
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={[styles.sectionTitle, { color: colors.sub, textTransform: 'uppercase', letterSpacing: 1, fontSize: 13 }]}>Data Export</Text>
                    <View style={{ height: 10 }} />

                    <TouchableOpacity style={[styles.actionBtn, selectedMonths.length === 0 && { opacity: 0.5 }]} onPress={exportAttendance} disabled={isExporting || selectedMonths.length === 0}>
                        <View style={styles.iconBoxAtt}>
                            <Users size={24} color={colors.green} />
                        </View>
                        <View style={styles.btnTextContainer}>
                            <Text style={styles.btnTitle}>Attendance Sheet</Text>
                            <Text style={styles.btnSub}>Export daily presence records</Text>
                        </View>
                        <Download size={20} color={colors.text} />
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.actionBtn, selectedMonths.length === 0 && { opacity: 0.5 }]} onPress={exportBilling} disabled={isExporting || selectedMonths.length === 0}>
                        <View style={styles.iconBoxBill}>
                            <CreditCard size={24} color={colors.orange} />
                        </View>
                        <View style={styles.btnTextContainer}>
                            <Text style={styles.btnTitle}>Billing Status</Text>
                            <Text style={styles.btnSub}>Export fee collection & pending dues</Text>
                        </View>
                        <Download size={20} color={colors.text} />
                    </TouchableOpacity>
                </View>

                <View style={{ padding: 10, alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: 0.6 }}>
                        <FileSpreadsheet size={16} color={colors.sub} />
                        <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '600' }}>Pro Excel (.xlsx) format</Text>
                    </View>
                </View>
            </ScrollView>

            {isExporting && (
                <View style={styles.loadingOverlay}>
                    <View style={styles.loadingBox}>
                        <ActivityIndicator size="large" color={colors.orange} />
                        <Text style={styles.loadingText}>Generating Excel...</Text>
                    </View>
                </View>
            )}
        </View>
    );
}
