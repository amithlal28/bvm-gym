import React, { useState } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity, Pressable
} from 'react-native';
import { ChevronLeft, ChevronRight, Check, X } from 'lucide-react-native';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isAfter, isSameMonth } from 'date-fns';

interface AppDatePickerProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: (date: Date) => void;
    initialDate?: Date;
    maximumDate?: Date;
    /** Days of the week to disable (0=Sun, 6=Sat) */
    disabledDays?: number[];
}

const C = {
    orange: '#FC8019', bg: '#F8F9FA', card: '#FFFFFF', text: '#1A1A2E',
    sub: '#93959F', green: '#10B981', border: '#F0F0F0',
};

export const AppDatePicker: React.FC<AppDatePickerProps> = ({
    visible, onClose, onConfirm, initialDate, maximumDate, disabledDays = []
}) => {
    const [viewMonth, setViewMonth] = useState(initialDate || new Date());
    const [selected, setSelected] = useState(initialDate || new Date());

    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Pad start of grid with null for days before the first of month
    const startPad = getDay(monthStart); // 0 = Sun
    const gridCells: (Date | null)[] = [
        ...Array(startPad).fill(null),
        ...days
    ];

    const weekLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    const isDisabled = (d: Date) => {
        if (maximumDate && isAfter(d, maximumDate)) return true;
        if (disabledDays.includes(getDay(d))) return true;
        return false;
    };

    const handleDayPress = (d: Date) => {
        if (isDisabled(d)) return;
        setSelected(d);
    };

    const handleConfirm = () => {
        onConfirm(selected);
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="slide">
            <View style={styles.overlay}>
                <Pressable style={styles.backdrop} onPress={onClose} />
                <View style={styles.sheet}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                            <X size={22} color="#6B7280" />
                        </TouchableOpacity>
                        <Text style={styles.title}>Select Date</Text>
                        <TouchableOpacity onPress={handleConfirm} style={styles.iconBtn}>
                            <Check size={22} color={C.green} />
                        </TouchableOpacity>
                    </View>

                    {/* Month Navigator */}
                    <View style={styles.monthNav}>
                        <TouchableOpacity
                            style={styles.navBtn}
                            onPress={() => setViewMonth(subMonths(viewMonth, 1))}
                        >
                            <ChevronLeft size={20} color={C.text} strokeWidth={2.5} />
                        </TouchableOpacity>
                        <Text style={styles.monthLabel}>{format(viewMonth, 'MMMM yyyy')}</Text>
                        <TouchableOpacity
                            style={styles.navBtn}
                            onPress={() => {
                                const next = addMonths(viewMonth, 1);
                                if (maximumDate && isAfter(startOfMonth(next), maximumDate)) return;
                                setViewMonth(next);
                            }}
                        >
                            <ChevronRight size={20} color={C.text} strokeWidth={2.5} />
                        </TouchableOpacity>
                    </View>

                    {/* Week labels */}
                    <View style={styles.weekRow}>
                        {weekLabels.map((l, i) => (
                            <Text key={i} style={[styles.weekLabel, i === 0 && { color: '#EF4444' }]}>{l}</Text>
                        ))}
                    </View>

                    {/* Day grid */}
                    <View style={styles.grid}>
                        {gridCells.map((d, i) => {
                            if (!d) return <View key={`pad-${i}`} style={styles.dayCell} />;
                            const sel = isSameDay(d, selected);
                            const dis = isDisabled(d);
                            const isToday = isSameDay(d, new Date());
                            return (
                                <TouchableOpacity
                                    key={d.toISOString()}
                                    style={[
                                        styles.dayCell,
                                        sel && styles.dayCellSelected,
                                        isToday && !sel && styles.dayCellToday,
                                    ]}
                                    onPress={() => handleDayPress(d)}
                                    disabled={dis}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[
                                        styles.dayText,
                                        sel && styles.dayTextSelected,
                                        dis && styles.dayTextDisabled,
                                        isToday && !sel && { color: C.orange, fontWeight: '800' },
                                        getDay(d) === 0 && !sel && !dis && { color: '#EF4444' },
                                    ]}>
                                        {format(d, 'd')}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Selected label */}
                    <View style={styles.selectedRow}>
                        <Text style={styles.selectedLabel}>
                            Selected: <Text style={styles.selectedValue}>{format(selected, 'EEEE, MMMM d, yyyy')}</Text>
                        </Text>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    backdrop: { ...StyleSheet.absoluteFillObject },
    sheet: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        paddingBottom: 40,
        shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12, shadowRadius: 16, elevation: 12,
    },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
        borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    },
    title: { fontSize: 18, fontWeight: '800', color: '#111827' },
    iconBtn: { padding: 6, borderRadius: 10, backgroundColor: '#F9FAFB' },
    monthNav: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 16,
    },
    navBtn: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
    },
    monthLabel: { fontSize: 17, fontWeight: '800', color: '#111827' },
    weekRow: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 4 },
    weekLabel: {
        flex: 1, textAlign: 'center', fontSize: 12.5,
        fontWeight: '700', color: '#6B7280', paddingVertical: 6,
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12 },
    dayCell: {
        width: `${100 / 7}%`, aspectRatio: 1,
        alignItems: 'center', justifyContent: 'center',
        borderRadius: 100,
    },
    dayCellSelected: { backgroundColor: C.green },
    dayCellToday: { backgroundColor: '#FFF3E0', borderWidth: 1, borderColor: C.orange },
    dayText: { fontSize: 14, fontWeight: '600', color: '#374151' },
    dayTextSelected: { color: '#FFFFFF', fontWeight: '800' },
    dayTextDisabled: { color: '#D1D5DB', fontWeight: '400' },
    selectedRow: {
        alignItems: 'center', paddingTop: 16, paddingHorizontal: 20,
        borderTopWidth: 1, borderTopColor: '#F3F4F6', marginTop: 8,
    },
    selectedLabel: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
    selectedValue: { color: '#111827', fontWeight: '800' },
});
