import React, { useState, useEffect } from 'react';

function Notifications() {
  const [zahtevi, setZahtevi] = useState([]);
  const [ucitavam, setUcitavam] = useState(true);

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

  useEffect(() => {
    const povuciNotifikacije = async () => {
      const token = localStorage.getItem('token');
      const myId = getMyUserId();

      if (!token || !myId) {
        setUcitavam(false);
        return;
      }

      try {
        
        const response = await fetch(`http://localhost:4000/api/follow/notifications/${myId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'x-user-id': String(myId)
          }
        });

        if (response.ok) {
          const data = await response.json();
          setZahtevi(data.pending_requests || []);
        }
      } catch (error) {
        console.error("Greška pri povlačenju notifikacija:", error);
      } finally {
        setUcitavam(false);
      }
    };

    povuciNotifikacije();
  }, []);

  const obradiZahtev = async (follower_id, akcija) => {
    const token = localStorage.getItem('token');
    const myId = getMyUserId();
    if (!token || !myId) return;

    // Biramo pravu rutu i metodu na osnovu Aninog server.js
    const url = akcija === 'accept' 
      ? 'http://localhost:4000/api/follow/accept' 
      : 'http://localhost:4000/api/follow/reject';
    
    const method = akcija === 'accept' ? 'PUT' : 'DELETE';

    try {
      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-user-id': String(myId)
        },
        body: JSON.stringify({ follower_id: follower_id })
      });

      if (response.ok) {
        
        setZahtevi(zahtevi.filter(z => z.follower_id !== follower_id));
      }
    } catch (error) {
      console.error(`Greška pri ${akcija} zahteva:`, error);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>Obaveštenja</h2>
      </div>

      <div style={contentStyle}>
        <h4 style={{ color: 'gray', marginTop: 0 }}>Zahtevi za praćenje</h4>
        {ucitavam ? (
          <p style={{ textAlign: 'center', color: 'gray', marginTop: '20px' }}>Učitavanje...</p>
        ) : zahtevi.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'gray', marginTop: '20px' }}>Nema novih zahteva.</p>
        ) : (
          zahtevi.map(zahtev => {
            return (
              <div key={zahtev.follower_id} style={rowStyle}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <img src={zahtev.avatar || "/slike/outfit.jpg"} alt="avatar" style={avatarStyle} />
                  <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{zahtev.username}</span>
                </div>
                <div>
                  <button onClick={() => obradiZahtev(zahtev.follower_id, 'accept')} style={acceptBtnStyle}>Prihvati</button>
                  <button onClick={() => obradiZahtev(zahtev.follower_id, 'reject')} style={rejectBtnStyle}>✕</button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const containerStyle = { backgroundColor: '#fafafa', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center' };
const headerStyle = { width: '100%', maxWidth: '470px', padding: '15px', backgroundColor: 'white', borderBottom: '1px solid #dbdbdb' };
const contentStyle = { width: '100%', maxWidth: '470px', backgroundColor: 'white', flex: 1, padding: '20px 15px' };
const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #efefef' };
const avatarStyle = { width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', marginRight: '10px', border: '1px solid #dbdbdb' };
const acceptBtnStyle = { backgroundColor: '#0095f6', color: 'white', border: 'none', borderRadius: '5px', padding: '6px 12px', fontWeight: 'bold', cursor: 'pointer', marginRight: '8px', fontSize: '12px' };
const rejectBtnStyle = { backgroundColor: '#efefef', color: 'black', border: 'none', borderRadius: '5px', padding: '6px 12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' };

export default Notifications;