import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Register() {
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '', 
    password: '',
    description: '',
    profilePicture: null
  });

  const navigate = useNavigate();

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.size > 50 * 1024 * 1024) {
      alert("Fajl je prevelik! Maksimalna veličina je 50MB.");
      e.target.value = null;
    } else {
      setFormData({ ...formData, profilePicture: file });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // secemo "Ime i prezime" na dva dela jer backend to trazi
    const nameParts = formData.name.trim().split(' ');
    const firstName = nameParts[0] || ''; 
    const lastName = nameParts.slice(1).join(' ') || '-'; // Sve posle razmaka je prezime

    try {
      const odgovor = await fetch('http://localhost:4000/api/authentication/register', { // proveriiiiii SA ALEKSOM da li se ruta zove /register ili /api/authentication/register
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        // saljem po backendu :)
        body: JSON.stringify({
          firstName: firstName,
          lastName: lastName,
          username: formData.username,
          email: formData.email,
          password: formData.password
        })
      });

      // U backend kodu pise res.status(201) za uspesnu reg i res.status(409) ako korisnik postoji
      if (odgovor.status === 201) {
        alert("Uspešna registracija! Sada se možete ulogovati.");
        navigate('/login');
      } else if (odgovor.status === 409) {
        alert("Greška: Korisnik sa tim imenom ili emailom već postoji!");
      } else if (odgovor.status === 500) {
        alert("Server je pukao! (Verovatno fali baza ili Redis lokalno)");
      } else {
        // Ako je stvarno 400 Bad Request (npr fali neko polje)
        const podaci = await odgovor.json();
        alert(`Server kaže: ${podaci.message}`); 
      }
    } catch (error) {
      alert("Server trenutno nije dostupan!");
      console.error("Greška pri registraciji:", error);
    }
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
            type="email" placeholder="Email adresa (Obavezno)" required
            style={inputStyle} onChange={(e) => setFormData({...formData, email: e.target.value})} 
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