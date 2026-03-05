import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DARK_MODE_KEY = '@bvm_dark_mode';

export interface ThemeColors {
    bg: string;
    card: string;
    text: string;
    sub: string;
    border: string;
    orange: string;
    green: string;
    red: string;
    purple: string;
    gold: string;
    blue: string;
    amber: string;
    inputBg: string;
    modalOverlay: string;
    headerBg: string;
    tabBg: string;
    switchBg: string;
    cardShadow: string;
    pillBg: string;
}

const LIGHT: ThemeColors = {
    bg: '#F8F9FA',
    card: '#FFFFFF',
    text: '#1A1A2E',
    sub: '#93959F',
    border: '#F0F0F0',
    orange: '#FC8019',
    green: '#10B981',
    red: '#EF4444',
    purple: '#8B5CF6',
    gold: '#FBBF24',
    blue: '#3B82F6',
    amber: '#F59E0B',
    inputBg: '#F8F9FA',
    modalOverlay: 'rgba(0,0,0,0.4)',
    headerBg: '#FFFFFF',
    tabBg: '#FFFFFF',
    switchBg: '#F0F0F0',
    cardShadow: '#000000',
    pillBg: '#F3F4F6',
};

const DARK: ThemeColors = {
    bg: '#000000',
    card: '#121214',
    text: '#FFFFFF',
    sub: '#94949E',
    border: '#252528',
    orange: '#FF9F43',
    green: '#30D158',
    red: '#FF453A',
    purple: '#BF5AF2',
    gold: '#FFD60A',
    blue: '#0A84FF',
    amber: '#FFD60A',
    inputBg: '#1C1C1E',
    modalOverlay: 'rgba(0,0,0,0.85)',
    headerBg: '#080808',
    tabBg: '#080808',
    switchBg: '#2C2C2E',
    cardShadow: '#000000',
    pillBg: '#1C1C1E',
};

interface ThemeContextType {
    isDark: boolean;
    toggleTheme: () => void;
    colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextType>({
    isDark: false,
    toggleTheme: () => { },
    colors: LIGHT,
});

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        AsyncStorage.getItem(DARK_MODE_KEY).then(val => {
            if (val === 'true') setIsDark(true);
        }).catch(() => { });
    }, []);

    const toggleTheme = async () => {
        const next = !isDark;
        setIsDark(next);
        await AsyncStorage.setItem(DARK_MODE_KEY, String(next));
    };

    return (
        <ThemeContext.Provider value={{ isDark, toggleTheme, colors: isDark ? DARK : LIGHT }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
