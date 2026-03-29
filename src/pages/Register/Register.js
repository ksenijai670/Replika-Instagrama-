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
            // 1. Registracija korisnika
            const regRes = await fetch(`${API}/api/authentication/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName,
                    lastName,
                    username: formData.username,
                    email: formData.email,
                    password: formData.password,
                    bio: formData.description
                })
            });

            if (!regRes.ok) {
                const errorData = await regRes.json();
                throw new Error(errorData.message || "Registracija neuspešna");
            }

            // 2. Login odmah nakon registracije da bismo dobili Token za upload slike
            const loginRes = await fetch(`${API}/api/authentication/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    identifier: formData.username,
                    password: formData.password
                })
            });

            if (loginRes.ok) {
                const loginData = await loginRes.json();
                const token = loginData.accessToken; // Koristimo accessToken koji vraća tvoj Auth servis

                // 3. Ako postoji slika, šaljemo je direktno na Profile Service (/avatar)
                if (formData.profilePicture && token) {
                    const avatarFormData = new FormData();
                    avatarFormData.append('avatar', formData.profilePicture);

                    try {
                        const avatarRes = await fetch(`${API}/api/profile/avatar`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`
                                // Ne postavljati Content-Type — browser sam postavlja multipart/form-data sa boundary
                            },
                            body: avatarFormData
                        });

                        if (!avatarRes.ok) {
                            const errData = await avatarRes.json().catch(() => ({}));
                            console.warn('[Register] Avatar upload neuspešan:', errData.detail || errData.error || avatarRes.status);
                            // Ne bacamo grešku — registracija je uspela, samo avatar nije postavljen
                        }
                    } catch (avatarErr) {
                        console.warn('[Register] Avatar upload greška:', avatarErr.message);
                        // Isto — ne blokiramo navigaciju
                    }
                }
            }

            alert("Uspešna registracija!");
            navigate('/login');
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={containerStyle}>
            <div style={cardStyle}>
                <h1 style={{ fontFamily: 'Lobster, cursive', fontSize: '3rem', marginBottom: '20px' }}>Instagram</h1>
                <p style={{ color: '#8e8e8e', fontWeight: '600', textAlign: 'center', marginBottom: '20px' }}>
                    Registruj se da vidiš slike i videe tvojih prijatelja.
                </p>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                    <input
                        type="text"
                        placeholder="Ime i prezime"
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
                        placeholder="Email (Obavezno)"
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

// Stilovi (zadržani iz tvog originalnog fajla)
const containerStyle = {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '40px', fontFamily: 'sans-serif', backgroundColor: '#fafafa', minHeight: '100vh'
};
const cardStyle = {
    backgroundColor: 'white', border: '1px solid #dbdbdb', padding: '30px',
    width: '350px', display: 'flex', flexDirection: 'column', alignItems: 'center'
};
const inputStyle = {
    width: '100%', padding: '10px', marginBottom: '10px',
    border: '1px solid #dbdbdb', borderRadius: '3px', backgroundColor: '#fafafa',
    boxSizing: 'border-box'
};
const buttonStyle = {
    width: '100%', padding: '8px', backgroundColor: '#0095f6',
    color: 'white', border: 'none', borderRadius: '4px',
    fontWeight: 'bold', cursor: 'pointer', marginTop: '10px'
};

export default Register;