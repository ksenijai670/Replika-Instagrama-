import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function Search() {
  const [upit, setUpit] = useState('');
  const [rezultati, setRezultati] = useState([]);
  const [ucitavam, setUcitavam] = useState(false);
  const navigate = useNavigate();

  // ─── POMOĆNA FUNKCIJA ZA IZVLAČENJE TVOG ID-a ───
  const getMyUserId = () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const payloadBase64 = token.split('.')[1];
      const decodedPayload = JSON.parse(atob(payloadBase64));
      return decodedPayload.userId;
    } catch (error) {
      return null;
    }
  };

  // ─── SLANJE ZAHTEVA NA SERVER KADA SE UPIT PROMENI ───
  useEffect(() => {
    // Backend traži minimum 2 karaktera
    if (upit.trim().length < 2) {
      setRezultati([]);
      setUcitavam(false);
      return;
    }

    // Debounce: Čekamo 300ms da korisnik prestane da kuca pa tek onda šaljemo zahtev
    const delayDebounceFn = setTimeout(async () => {
      setUcitavam(true);
      const token = localStorage.getItem('token');
      const myUserId = getMyUserId();

      if (!token || !myUserId) {
        setUcitavam(false);
        return;
      }

      try {
        const response = await fetch(`http://localhost:4000/api/profile/search?q=${upit.trim()}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'x-user-id': String(myUserId)
          }
        });

        if (response.ok) {
          const data = await response.json();
          setRezultati(data.users || []);
        } else {
          setRezultati([]);
        }
      } catch (error) {
        console.error("Greška pri pretrazi:", error);
        setRezultati([]);
      } finally {
        setUcitavam(false);
      }
    }, 300);

    // Očisti tajmer ako korisnik nastavi da kuca pre isteka 300ms
    return () => clearTimeout(delayDebounceFn);
  }, [upit]);

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <input 
          type="text" 
          placeholder="Pretraži po imenu ili korisničkom imenu..." 
          value={upit}
          onChange={(e) => setUpit(e.target.value)}
          style={searchInputStyle}
        />
      </div>

      <div style={resultsStyle}>
        {upit.trim().length < 2 ? (
          <div style={emptyStateStyle}>
            <span style={{ fontSize: '40px' }}>🔍</span>
            <p>Unesite bar 2 slova za pretragu...</p>
          </div>
        ) : ucitavam ? (
          <div style={emptyStateStyle}>
            <p>Tražim...</p>
          </div>
        ) : rezultati.length > 0 ? (
          rezultati.map(korisnik => (
            <div 
              key={korisnik.id} 
              style={userRowStyle} 
              // Kada kliknemo, šaljemo podatke Profilu onako kako on to očekuje
              onClick={() => navigate('/profile', { 
                state: { 
                  korisnik: {
                    id: korisnik.id,
                    username: korisnik.username,
                    fullName: `${korisnik.first_name} ${korisnik.last_name}`,
                    avatar: korisnik.profile_image_url || '/slike/outfit.jpg',
                    bio: korisnik.bio
                  } 
                } 
              })}
            >
              <img src={korisnik.profile_image_url || '/slike/outfit.jpg'} alt="avatar" style={avatarStyle} />
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{korisnik.username}</div>
                <div style={{ color: 'gray', fontSize: '14px' }}>{korisnik.first_name} {korisnik.last_name}</div>
              </div>
            </div>
          ))
        ) : (
          <div style={emptyStateStyle}>
            <p>Nema rezultata za "{upit}".</p>
          </div>
        )}
      </div>
    </div>
  );
}

const containerStyle = { backgroundColor: '#fafafa', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center' };
const headerStyle = { width: '100%', maxWidth: '470px', padding: '15px', backgroundColor: 'white', borderBottom: '1px solid #dbdbdb' };
const searchInputStyle = { width: '100%', padding: '10px 15px', borderRadius: '8px', border: '1px solid #dbdbdb', outline: 'none', fontSize: '14px', backgroundColor: '#efefef' };
const resultsStyle = { width: '100%', maxWidth: '470px', backgroundColor: 'white', flex: 1 };
const userRowStyle = { display: 'flex', alignItems: 'center', padding: '15px', borderBottom: '1px solid #efefef', cursor: 'pointer' };
const avatarStyle = { width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', marginRight: '15px', border: '1px solid #dbdbdb' };
const emptyStateStyle = { textAlign: 'center', color: 'gray', marginTop: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center' };

export default Search;