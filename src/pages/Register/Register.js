import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API = 'http://localhost:4000';

function Register() {
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    description: '',
    profilePicture: null
  });
  const [loading, setLoading] = useState(false);
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
    setLoading(true);

    const nameParts = formData.name.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '-';

    try {
      // Registracija
      const regRes = await fetch(`${API}/api/authentication/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          username: formData.username,
          email: formData.email,
          password: formData.password,
          bio: formData.description || null,
        })
      });

      if (regRes.status === 409) {
        alert("Korisnik sa tim imenom ili emailom već postoji!");
        setLoading(false);
        return;
      }
      if (!regRes.ok) {
        const data = await regRes.json();
        alert(`Greška pri registraciji: ${data.message}`);
        setLoading(false);
        return;
      }

      // Ako nema slike
      if (!formData.profilePicture) {
        alert("Uspešna registracija!");
        navigate('/login');
        return;
      }

      // Auto-login da dobijemo token 
      const loginRes = await fetch(`${API}/api/authentication/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: formData.email,
          password: formData.password,
        })
      });

      if (!loginRes.ok) {
        alert("Registracija uspešna, ali nije moguće postaviti profilnu sliku sada. Možete je dodati kasnije.");
        navigate('/login');
        return;
      }

      const { accessToken } = await loginRes.json();

      // Upload slike kao post (bez caption-a) 
      const formDataUpload = new FormData();
      formDataUpload.append('files', formData.profilePicture);

      const postRes = await fetch(`${API}/api/posts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
        body: formDataUpload,
      });

      if (!postRes.ok) {
        alert("Registracija uspešna, ali upload slike nije uspeo. Možete je dodati kasnije.");
        navigate('/login');
        return;
      }

      const post = await postRes.json();

      // Fix MinIO internog URL-a 
      const rawUrl = post.media?.[0]?.mediaUrl || '';
      const imageUrl = rawUrl.replace('http://minio:9000', 'http://localhost:9000');

      // Postavi sliku kao profilnu 
      if (imageUrl) {
        await fetch(`${API}/api/authentication/me`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ profileImageUrl: imageUrl }),
        });
      }

      alert("Uspešna registracija!");
      navigate('/login');

    } catch (error) {
      alert("Server trenutno nije dostupan!");
      console.error("Greška pri registraciji:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ fontFamily: 'cursive' }}>Instagram Replica</h1>
        <p style={{ color: '#8e8e8e', fontWeight: 'bold' }}>Registruj se</p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
          <input
            type="text"
            placeholder="Ime i prezime (Obavezno)"
            required
            style={inputStyle}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <input
            type="text"
            placeholder="Korisničko ime (Obavezno)"
            required
            style={inputStyle}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
          />
          <input
            type="email"
            placeholder="Email adresa (Obavezno)"
            required
            style={inputStyle}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
          <input
            type="password"
            placeholder="Lozinka (Obavezno)"
            required
            style={inputStyle}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          />
          <textarea
            placeholder="Opis profila (Opciono)"
            style={inputStyle}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />

          <label style={{ fontSize: '12px', textAlign: 'left', color: '#8e8e8e', marginTop: '10px' }}>
            Profilna slika (Opciono):
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ marginBottom: '10px' }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{ ...buttonStyle, opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Registracija u toku...' : 'Registruj se'}
          </button>
        </form>
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

export default Register;