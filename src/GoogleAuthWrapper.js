import React, { useState } from 'react';
import { GoogleLogin, googleLogout } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';

const ALLOWED_USERS = ['tapas1175@gmail.com', 'gh.sourav3399@gmail.com'];

export default function GoogleAuthWrapper({ children }) {
    const [user, setUser] = useState(null);
    const [error, setError] = useState('');

    const handleSuccess = (credentialResponse) => {
        const decoded = jwtDecode(credentialResponse.credential);
        const email = decoded.email || '';

        if (!ALLOWED_USERS.includes(email)) {
            setError(`Access denied for ${email}. This app is restricted to authorised users only.`);
            setUser(null);
            return;
        }
        setError('');
        setUser({ email, name: decoded.name, picture: decoded.picture });
    };

    const handleLogout = () => {
        googleLogout();
        setUser(null);
        setError('');
    };

    if (user) {
        return (
            <>
                {/* Top-right user badge */}
                <div style={s.badge}>
                    <img src={user.picture} alt="avatar" style={s.avatar} />
                    <span style={s.userName}>{user.name}</span>
                    <span style={s.userEmail}>({user.email})</span>
                    <button style={s.logoutBtn} onClick={handleLogout}>Logout</button>
                </div>
                {children}
            </>
        );
    }

    return (
        <div style={s.loginPage}>
            <div style={s.loginCard}>
                <div style={s.appIcon}>📈</div>
                <h2 style={s.appTitle}>Share Trading Tracker</h2>
                <p style={s.appSub}>Automation Dashboard</p>
                <div style={s.divider} />
                <p style={s.instruction}>Sign in with your Google account to continue</p>

                <div style={s.googleBtnWrap}>
                    <GoogleLogin
                        onSuccess={handleSuccess}
                        onError={() => setError('Google sign-in failed. Please try again.')}
                        useOneTap
                        theme="outline"
                        size="large"
                        text="signin_with"
                        shape="rectangular"
                    />
                </div>

                {error && <div style={s.errorBox}>{error}</div>}

                <p style={s.restriction}>
                    Access restricted to authorised users only.
                </p>
            </div>
        </div>
    );
}

const s = {
    loginPage: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    loginCard: {
        background: '#fff',
        borderRadius: 12,
        padding: '48px 40px',
        width: 360,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        textAlign: 'center',
        fontFamily: 'Consolas, monospace',
    },
    appIcon: {
        fontSize: 48,
        marginBottom: 8,
    },
    appTitle: {
        margin: '0 0 4px',
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1a1a2e',
    },
    appSub: {
        margin: '0 0 16px',
        fontSize: 13,
        color: '#6c757d',
    },
    divider: {
        height: 1,
        background: '#e9ecef',
        margin: '16px 0',
    },
    instruction: {
        fontSize: 13,
        color: '#444',
        marginBottom: 20,
    },
    googleBtnWrap: {
        display: 'flex',
        justifyContent: 'center',
        marginBottom: 16,
    },
    errorBox: {
        background: '#fff3f3',
        border: '1px solid #f5c2c7',
        color: '#842029',
        borderRadius: 6,
        padding: '10px 14px',
        fontSize: 12,
        marginBottom: 12,
        textAlign: 'left',
    },
    restriction: {
        fontSize: 11,
        color: '#aaa',
        marginTop: 8,
    },
    // Logged-in badge (top bar)
    badge: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: '#1a1a2e',
        padding: '6px 20px',
        justifyContent: 'flex-end',
    },
    avatar: {
        width: 28,
        height: 28,
        borderRadius: '50%',
        border: '2px solid #0d6efd',
    },
    userName: {
        color: '#fff',
        fontSize: 13,
        fontFamily: 'Consolas, monospace',
        fontWeight: 'bold',
    },
    userEmail: {
        color: '#adb5bd',
        fontSize: 12,
        fontFamily: 'Consolas, monospace',
    },
    logoutBtn: {
        marginLeft: 8,
        padding: '3px 12px',
        background: '#dc3545',
        color: '#fff',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 12,
        fontFamily: 'Consolas, monospace',
    },
};
