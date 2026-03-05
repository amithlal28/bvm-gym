import React, { useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Modal,
    Animated, TextInput, ActivityIndicator, Dimensions
} from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const C = {
    orange: '#FC8019', bg: '#F8F9FA', card: '#FFFFFF', text: '#1A1A2E',
    sub: '#93959F', green: '#10B981', red: '#EF4444', border: '#F0F0F0',
    purple: '#8B5CF6',
};

export type ModalVariant = 'danger' | 'success' | 'warning' | 'info' | 'suspend';

interface AppModalAction {
    label: string;
    onPress: () => void;
    loading?: boolean;
    variant?: 'primary' | 'danger' | 'cancel' | 'success';
}

interface AppModalProps {
    visible: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    icon?: string; // emoji
    variant?: ModalVariant;
    actions: AppModalAction[];
    /** Optional text input inside the modal */
    inputValue?: string;
    inputPlaceholder?: string;
    onInputChange?: (text: string) => void;
    /** Optional extra children */
    children?: React.ReactNode;
}

const variantStyles: Record<ModalVariant, { headerBg: string; iconBg: string; accent: string }> = {
    danger: { headerBg: '#FFF0F0', iconBg: '#FEE2E2', accent: '#EF4444' },
    success: { headerBg: '#F0FBF0', iconBg: '#D1FAE5', accent: '#10B981' },
    warning: { headerBg: '#FFFBEB', iconBg: '#FEF3C7', accent: '#F59E0B' },
    info: { headerBg: '#EFF6FF', iconBg: '#DBEAFE', accent: '#3B82F6' },
    suspend: { headerBg: '#FFF5F0', iconBg: '#FDE8D5', accent: '#FC8019' },
};

const actionColors: Record<string, { bg: string; text: string }> = {
    primary: { bg: C.orange, text: '#fff' },
    danger: { bg: C.red, text: '#fff' },
    success: { bg: C.green, text: '#fff' },
    cancel: { bg: C.bg, text: C.sub },
};

const AppModal: React.FC<AppModalProps> = ({
    visible, onClose, title, subtitle, icon, variant = 'info',
    actions, inputValue, inputPlaceholder, onInputChange, children,
}) => {
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
                Animated.spring(slideAnim, { toValue: 0, damping: 20, stiffness: 220, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
                Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 220, useNativeDriver: true }),
            ]).start();
        }
    }, [visible]);

    const vs = variantStyles[variant];

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
            {/* Backdrop */}
            <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
                <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
            </Animated.View>

            {/* Sheet */}
            <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
                {/* Drag handle */}
                <View style={styles.dragHandle} />

                {/* Header */}
                <View style={[styles.modalHeader, { backgroundColor: vs.headerBg }]}>
                    {icon && (
                        <View style={[styles.iconCircle, { backgroundColor: vs.iconBg }]}>
                            <Text style={styles.iconEmoji}>{icon}</Text>
                        </View>
                    )}
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.modalTitle, { color: vs.accent }]}>{title}</Text>
                        {subtitle ? <Text style={styles.modalSubtitle}>{subtitle}</Text> : null}
                    </View>
                </View>

                <View style={styles.modalBody}>
                    {/* Optional input */}
                    {onInputChange !== undefined && (
                        <TextInput
                            style={styles.modalInput}
                            value={inputValue}
                            onChangeText={onInputChange}
                            placeholder={inputPlaceholder || ''}
                            placeholderTextColor={C.sub}
                            multiline={false}
                        />
                    )}

                    {/* Custom children */}
                    {children}

                    {/* Action buttons */}
                    <View style={styles.actionsRow}>
                        {actions.map((action, idx) => {
                            const col = actionColors[action.variant || 'primary'];
                            return (
                                <TouchableOpacity
                                    key={idx}
                                    style={[
                                        styles.actionBtn,
                                        { backgroundColor: col.bg, flex: actions.length === 1 ? 1 : undefined, flexGrow: action.variant !== 'cancel' ? 1.5 : 1 },
                                        action.variant === 'cancel' && styles.cancelBorder,
                                    ]}
                                    onPress={action.onPress}
                                    disabled={action.loading}
                                    activeOpacity={0.8}
                                >
                                    {action.loading
                                        ? <ActivityIndicator size="small" color={col.text} />
                                        : <Text style={[styles.actionBtnText, { color: col.text }]}>{action.label}</Text>
                                    }
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            </Animated.View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: C.card,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
        elevation: 20,
    },
    dragHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#D1D5DB',
        alignSelf: 'center',
        marginTop: 10,
        marginBottom: 4,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 20,
        paddingBottom: 16,
    },
    iconCircle: {
        width: 52,
        height: 52,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconEmoji: {
        fontSize: 26,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '800',
        marginBottom: 3,
    },
    modalSubtitle: {
        fontSize: 13,
        color: C.sub,
        lineHeight: 18,
    },
    modalBody: {
        padding: 20,
        paddingTop: 8,
        paddingBottom: 36,
    },
    modalInput: {
        backgroundColor: C.bg,
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 15,
        color: C.text,
        borderWidth: 1,
        borderColor: C.border,
        marginBottom: 16,
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 10,
    },
    actionBtn: {
        flex: 1,
        paddingVertical: 15,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelBorder: {
        borderWidth: 1,
        borderColor: C.border,
    },
    actionBtnText: {
        fontSize: 15,
        fontWeight: '800',
    },
});

export default AppModal;
