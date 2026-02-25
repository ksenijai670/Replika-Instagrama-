import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Register from './pages/Register/Register'; // vrati se ksenija nesto nece 
import Login from './pages/Login/Login';
function App() {
  return (
    <Router>
      <Routes>
        {/* Putanja za registraciju - Zahtev 1.1 [cite: 7] */}
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        {/* Početna stranica - privremeno */}
        <Route path="/" element={<h1>Dobrodošli! Idite na /register</h1>} />
      </Routes>
    </Router>
  );
}

export default App;