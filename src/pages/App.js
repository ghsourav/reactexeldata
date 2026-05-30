import React, { useState } from 'react';
import ShareTrackerDashboard from '../components/ShareTracker';
import StockSearch from '../components/StockSearch';
import '../styles/App.css';

const MENUS = [
  { key: 'tracker', label: '📊 Tracker' },
  { key: 'search',  label: '🔍 Stock Search' },
];

const App = () => {
  const [active, setActive] = useState('tracker');

  return (
    <>
      <nav className="app-nav">
        <div className="app-brand">
          <div className="app-brand-icon">📈</div>
          <div className="app-brand-info">
            <span className="app-brand-text">Share Tracker</span>
            <span className="app-brand-version">FriendsHotel.In · v1.3</span>
          </div>
        </div>
        <div className="app-nav-links">
          {MENUS.map(m => (
            <button
              key={m.key}
              className={`app-nav-btn${active === m.key ? ' app-nav-btn--active' : ''}`}
              onClick={() => setActive(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="app-content">
        {active === 'tracker' && <ShareTrackerDashboard />}
        {active === 'search'  && <StockSearch />}
      </div>
    </>
  );
};

export default App;
