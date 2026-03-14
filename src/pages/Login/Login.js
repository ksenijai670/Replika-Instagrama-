import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Login() {
  const [credentials, setCredentials] = useState({
    identifier: '', // Korisničko ime ili email 
    password: ''
  });
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    
    try {
      const odgovor = await fetch('http://localhost:4000/api/authentication/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        // saljemo  rec "identifier" 
        body: JSON.stringify({
          identifier: credentials.identifier, 
          password: credentials.password
        })
      });

      if (odgovor.ok) {
        const podaci = await odgovor.json();
        
        // on salje "accessToken", pa mi to cuvamo (pod imenom 'token' da bi u App.js radilo bez prepravki)
        localStorage.setItem('token', podaci.accessToken);

        // posto on salje i refreshToken, mozemo i njega da sacuvamo zlu ne trebalo :/ 
        if (podaci.refreshToken) {
          localStorage.setItem('refreshToken', podaci.refreshToken);
        }

        alert("Uspešna prijava!");
        navigate('/'); // prelazak na Timeline
      } else {
        alert("Pogrešno korisničko ime ili lozinka!");
      }
      
    } catch (error) {
      alert("Server trenutno nije dostupan ili je blokiran (CORS)!");
      console.error("Greška pri fetch-u:", error);
    }
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