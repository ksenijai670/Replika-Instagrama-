import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'; 
import Timeline from './pages/Timeline/Timeline';
import Profile from './pages/Profile/Profile';
import Login from './pages/Login/Login';
import Register from './pages/Register/Register';
import Navbar from './components/Navbar';
import CreatePost from './pages/CreatePost/CreatePost';
import Search from './pages/Search/Search';
import Notifications from './pages/Notifications/Notifications'; 

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  if (!token) {
    // Ako nema tokena u Local Storage-u, vraća na Login
    return <Navigate to="/login" />;
  }
  return children;
};

function App() {
  return (
    <Router>
      <div style={{ position: 'relative', minHeight: '100vh', paddingBottom: '60px' }}> 
        
        <h1 style={hiddenTitleStyle}>
          Instagram Replica
        </h1>

        <Routes>
          {/* OVE STRANICE SU ZAKLJUČANE (DODATO ProtectedRoute) */}
          <Route path="/" element={<ProtectedRoute><Timeline /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/create" element={<ProtectedRoute><CreatePost /></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute><Search /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          
          {/* OVE STRANICE SU SLOBODNE */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Routes>
      </div>
      <Navbar />
    </Router>
  );
}

//zbog testa naslov aplikacije
const hiddenTitleStyle = {
  position: 'absolute', 
  top: '10px',
  left: '10px',
  fontSize: '14px',      
  color: '#262626',      
  margin: 0,
  fontWeight: 'bold',
  zIndex: 9999,          
  pointerEvents: 'none'  
};

export default App;