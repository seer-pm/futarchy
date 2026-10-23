import React, { createContext, useContext, useState, useEffect } from 'react';

/**
 * The one theme mechanism: 'light' or 'dark', stored in localStorage.theme and
 * applied as the `dark` class on <html> (Tailwind's class strategy).
 */
const ThemeContext = createContext();

export const THEMES = {
    LIGHT: 'light',
    DARK: 'dark',
};

export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(THEMES.LIGHT);

    useEffect(() => {
        // Load saved theme from localStorage
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme && (savedTheme === THEMES.LIGHT || savedTheme === THEMES.DARK)) {
            setTheme(savedTheme);
        } else {
            // Fallback to system preference for dark/light
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            setTheme(prefersDark ? THEMES.DARK : THEMES.LIGHT);
        }
    }, []);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === THEMES.DARK);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const cycleTheme = () => {
        setTheme(prev => prev === THEMES.LIGHT ? THEMES.DARK : THEMES.LIGHT);
    };

    const value = {
        theme,
        setTheme,
        cycleTheme,
        isDarkMode: theme === THEMES.DARK,
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within ThemeProvider');
    }
    return context;
};

export default ThemeContext;
