import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  // prepravih to sto mi se navbar video i pre prijave
  if (location.pathname === '/login' || location.pathname === '/register') {
    return null; 
  }

  const isActive = (path) => location.pathname === path;

  const activeColor = "#262626";
  const inactiveColor = "#8e8e8e";
  return (
    <div style={navbarContainerStyle}>
      <div style={navbarStyle}>
        
        {/* HOME */}
        <div onClick={() => { navigate('/'); window.location.reload(); }} style={iconWrapperStyle}>
          <svg aria-label="Home" height="24" viewBox="0 0 24 24" width="24">
            <path d="M12 2.093l-9 7.835V22h6v-6h6v6h6V9.928l-9-7.835z" 
                  fill={isActive('/') ? activeColor : "none"} 
                  stroke={activeColor} 
                  strokeWidth="2"/>
          </svg>
        </div>

        {/* SEARCH */}
        <div onClick={() => navigate('/search')} style={iconWrapperStyle}>
          <svg aria-label="Search" height="24" viewBox="0 0 24 24" width="24">
            <circle cx="11" cy="11" r="8" fill="none" stroke={isActive('/search') ? activeColor : inactiveColor} strokeWidth="2"/>
            <line x1="16.5" y1="16.5" x2="22" y2="22" stroke={isActive('/search') ? activeColor : inactiveColor} strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>

        {/* CREATEPOST */}
        <div onClick={() => navigate('/create')} style={iconWrapperStyle}>
          <svg aria-label="New Post" height="24" viewBox="0 0 24 24" width="24">
            <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke={isActive('/create') ? activeColor : inactiveColor} strokeWidth="2"/>
            <line x1="12" y1="8" x2="12" y2="16" stroke={isActive('/create') ? activeColor : inactiveColor} strokeWidth="2" strokeLinecap="round"/>
            <line x1="8" y1="12" x2="16" y2="12" stroke={isActive('/create') ? activeColor : inactiveColor} strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>

        {/* NOTIFICATIONS */}
        <div onClick={() => navigate('/notifications')} style={iconWrapperStyle}>
          <svg aria-label="Activity Feed" height="24" width="24" viewBox="0 0 24 24">
            <path 
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              fill={isActive('/notifications') ? activeColor : inactiveColor}
              style={{ opacity: isActive('/notifications') ? 1 : 0.5 }}
            />
          </svg>
        </div>

        {/* PROFILE */}
        <div onClick={() => navigate('/profile')} style={iconWrapperStyle}>
          <svg aria-label="Profile" height="24" viewBox="0 0 24 24" width="24">
            <circle cx="12" cy="7" r="4" fill="none" stroke={isActive('/profile') ? activeColor : inactiveColor} strokeWidth="2"/>
            <path d="M4 21c0-4 4-7 8-7s8 3 8 7" fill="none" stroke={isActive('/profile') ? activeColor : inactiveColor} strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>

      </div>
    </div>
  );
  
}

const navbarContainerStyle = { 
  position: 'fixed', 
  bottom: 0, 
  width: '100%', 
  display: 'flex', 
  justifyContent: 'center', 
  zIndex: 1000, 
  backgroundColor: '#ffffff',
  borderTop: '1px solid #efefef' 
};

const navbarStyle = { 
  width: '100%', 
  maxWidth: '470px', 
  backgroundColor: 'white', 
  display: 'flex', 
  justifyContent: 'space-around', 
  padding: '12px 0' 
};

const iconWrapperStyle = { 
  cursor: 'pointer', 
  display: 'flex', 
  alignItems: 'center', 
  justifyContent: 'center',
  width: '40px',
  height: '40px'
};

export default Navbar;