import React, { useState } from 'react'
import ShareTrackerDashboard from './ShareTrackerDashboard';
import StockSearch from './StockSearch';

const MENUS = [
    { key: 'tracker', label: 'Tracker Dashboard' },
    { key: 'search',  label: 'Stock Search' },
];

const App = () => {
    const [active, setActive] = useState('tracker');

    return (
        <>
            <nav style={styles.nav}>
                <span style={styles.brand}>📈 Share Tracker</span>
                <div style={styles.links}>
                    {MENUS.map(m => (
                        <button
                            key={m.key}
                            onClick={() => setActive(m.key)}
                            style={{ ...styles.link, ...(active === m.key ? styles.linkActive : {}) }}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>
            </nav>

            <div style={styles.content}>
                {active === 'tracker' && <ShareTrackerDashboard />}
                {active === 'search'  && <StockSearch />}
            </div>
        </>
    )
}

const styles = {
    nav: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        background: '#1a1a2e',
        padding: '10px 24px',
    },
    brand: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
        fontFamily: 'Consolas, monospace',
        marginRight: 'auto',
    },
    links: {
        display: 'flex',
        gap: 8,
    },
    link: {
        padding: '6px 18px',
        background: 'transparent',
        color: '#adb5bd',
        border: '1px solid #444',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 13,
        fontFamily: 'Consolas, monospace',
        transition: 'all 0.15s',
    },
    linkActive: {
        background: '#0d6efd',
        color: '#fff',
        border: '1px solid #0d6efd',
    },
    content: {
        padding: '16px',
    },
}

export default App
