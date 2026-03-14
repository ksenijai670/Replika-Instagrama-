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
      // 1.SADA GAĐAMO PRAVI API GATEWAY NA PORTU 4000
      const odgovor = await fetch('http://localhost:4000/api/authentication/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        // 2. sgaljemo ono što je trazio: username i password
        body: JSON.stringify({
          username: credentials.identifier, 
          password: credentials.password
        })
      });

      // 3. Da li nas je pustio unutra?
      if (odgovor.ok) {
        // 1. Pretvaramo odgovor servera u podatke koje React razume
        const podaci = await odgovor.json();
        
        // 2. Čuvamo token (VIP narukvicu) u memoriju pretraživača
        localStorage.setItem('token', podaci.token);

        alert("Uspešna prijava!");
        navigate('/'); // prelazak na Timeline
      } else {
        alert("Pogrešno korisničko ime ili lozinka!");
      }
      
    } catch (error) {
      // 4. Ovo iskače ako server uopšte ne radi ili fali CORS
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