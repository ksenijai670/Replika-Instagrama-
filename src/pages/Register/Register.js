import React, { useState } from 'react';

function Register() {
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    description: '',
    profilePicture: null
  });

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.size > 50 * 1024 * 1024) {
      alert("Fajl je prevelik! Maksimalna veličina je 50MB.");
      e.target.value = null;
    } else {
      setFormData({ ...formData, profilePicture: file });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Podaci za slanje:", formData);
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ fontFamily: 'cursive' }}>Instagram Replica</h1>
        <p style={{ color: '#8e8e8e', fontWeight: 'bold' }}>Registruj se</p>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
          <input 
            type="text" placeholder="Ime i prezime (Obavezno)" required
            style={inputStyle} onChange={(e) => setFormData({...formData, name: e.target.value})} 
          />
          <input 
            type="text" placeholder="Korisničko ime (Obavezno)" required
            style={inputStyle} onChange={(e) => setFormData({...formData, username: e.target.value})} 
          />
          <input 
            type="password" placeholder="Lozinka (Obavezno)" required
            style={inputStyle} onChange={(e) => setFormData({...formData, password: e.target.value})} 
          />
          <textarea 
            placeholder="Opis profila (Opciono)"
            style={inputStyle} onChange={(e) => setFormData({...formData, description: e.target.value})} 
          />
          
          <label style={{ fontSize: '12px', textAlign: 'left', color: '#8e8e8e', marginTop: '10px' }}>Profilna slika (Opciono):</label>
          <input type="file" accept="image/*" onChange={handleFileChange} style={{ marginBottom: '10px' }} />

          <button type="submit" style={buttonStyle}>Registruj se</button>
        </form>
      </div>
    </div>
  );
}

const containerStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px', fontFamily: 'sans-serif', backgroundColor: '#fafafa', minHeight: '100vh' };
const cardStyle = { backgroundColor: 'white', border: '1px solid #dbdbdb', padding: '30px', width: '350px', textAlign: 'center' };
const inputStyle = { padding: '10px', margin: '5px 0', border: '1px solid #dbdbdb', borderRadius: '3px', backgroundColor: '#fafafa', fontSize: '12px' };
const buttonStyle = { backgroundColor: '#0095f6', color: 'white', border: 'none', borderRadius: '4px', padding: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' };

export default Register;