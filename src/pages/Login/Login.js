import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Login() {
  const [credentials, setCredentials] = useState({
    identifier: '', // Korisničko ime ili email po zahtevu 1.1.1
    password: ''
  });
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    console.log("Pokušaj prijave:", credentials);
    // Ovde će ići backend provera. Za sada samo simuliramo prelazak na Timeline.
    navigate('/'); 
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ fontFamily: 'cursive' }}>Instagram Replica</h1>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column' }}>
          <input 
            type="text" 
            placeholder="Korisničko ime ili email" 
            required 
            style={inputStyle}
            onChange={(e) => setCredentials({...credentials, identifier: e.target.value})} 
          />
          <input 
            type="password" 
            placeholder="Lozinka" 
            required 
            style={inputStyle}
            onChange={(e) => setCredentials({...credentials, password: e.target.value})} 
          />
          <button type="submit" style={buttonStyle}>Prijavi se</button>
        </form>
        <p style={{ fontSize: '14px' }}>
          Nemate nalog? <a href="/register" style={{ color: '#0095f6', textDecoration: 'none' }}>Registrujte se</a>
        </p>
      </div>
    </div>
  );
}

// Isti stilovi kao u Register.js da aplikacija izgleda koherentno
const containerStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', 
  padding: '40px', fontFamily: 'sans-serif', backgroundColor: '#fafafa', minHeight: '100vh' 
};

const cardStyle = {
  backgroundColor: 'white', border: '1px solid #dbdbdb', 
  padding: '30px', width: '350px', textAlign: 'center' 
};

const inputStyle = {
  padding: '10px', margin: '5px 0', border: '1px solid #dbdbdb',
  borderRadius: '3px', backgroundColor: '#fafafa', fontSize: '12px'
};

const buttonStyle = {
  backgroundColor: '#0095f6', color: 'white', border: 'none',
  borderRadius: '4px', padding: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px'
};

export default Login;