import React, { useState, useEffect } from 'react';
const getMyUsername = () => {
  const token = localStorage.getItem('token');
  if (!token) return '';
  try { return JSON.parse(atob(token.split('.')[1])).username; }
  catch { return ''; }
};
const myUsername = getMyUsername();
// ─── MediaItem komponenta ─────────────────────────────────
function MediaItem({ item, style }) {
  if (!item) return null;
  if (item.mediaType === 'video') {
    return (
      <video
        src={item.mediaUrl}
        style={style}
        controls
        playsInline
        preload="metadata"
      />
    );
  }
  return <img src={item.mediaUrl} alt="Post" style={style} />;
}

// ─── PostCard komponenta ──────────────────────────────────
function PostCard({ obj, myId, myUsername, onLajk, onObrisiObjavu, onSacuvajOpis }) {
  const [trenutnaSlikaIndex, setTrenutnaSlikaIndex] = useState(0);
  const [prikaziKomentare, setPrikaziKomentare] = useState(false);
  const [noviKomentar, setNoviKomentar] = useState('');
  const [izmenaKomentara, setIzmenaKomentara] = useState({ idKom: null, tekst: '' });
  const [izmenaOpisa, setIzmenaOpisa] = useState(false);
  const [noviOpis, setNoviOpis] = useState(obj.caption || '');
  const [otvorenMeni, setOtvorenMeni] = useState(false);
  const [komentari, setKomentari] = useState(obj.comments || []);

  const isMyPost = Number(obj.userId) === Number(myId);
  const media = obj.media || [];

  const dodajKomentar = async () => {
    if (!noviKomentar.trim()) return;

    const token = localStorage.getItem('token');

    try {
      const res = await fetch(
        `http://localhost:4000/api/interactions/posts/${obj.id}/comments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'x-user-id': String(myId)
          },
          body: JSON.stringify({ content: noviKomentar })
        }
      );

      if (res.ok) {
        const data = await res.json();

        setKomentari(prev => [
          {
            id: data.id,
            userId: myId,
            username: myUsername,
            content: noviKomentar,
            createdAt: new Date().toISOString()
          },
          ...prev
        ]);

        setNoviKomentar('');
        setPrikaziKomentare(true);
      }

    } catch (err) {
      console.error(err);
    }
  };

  const obrisiKomentar = async (commentId) => {
    if (!window.confirm('Obriši komentar?')) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`http://localhost:4000/api/interactions/comments/${commentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}`, 'x-user-id': String(myId) }
      });
      if (res.ok) setKomentari(prev => prev.filter(k => k.id !== commentId));
    } catch (err) { console.error(err); }
  };

  const sacuvajKomentar = async () => {
    if (!izmenaKomentara.tekst.trim()) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`http://localhost:4000/api/interactions/comments/${izmenaKomentara.idKom}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-user-id': String(myId) },
        body: JSON.stringify({ content: izmenaKomentara.tekst })
      });
      if (res.ok) {
        setKomentari(prev => prev.map(k => k.id === izmenaKomentara.idKom ? { ...k, content: izmenaKomentara.tekst } : k));
        setIzmenaKomentara({ idKom: null, tekst: '' });
      }
    } catch (err) { console.error(err); }
  };

  return (
    <div style={cardStyle}>

      {/* ─── Header ─── */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img
            src={obj.user?.profile_image_url || '/slike/outfit.jpg'}
            alt="avatar"
            style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #dbdbdb' }}
          />
          <strong style={{ fontSize: '14px' }}>{obj.user?.username || 'Nepoznat'}</strong>
        </div>
        {isMyPost && (
          <div style={{ position: 'relative' }}>
            <button onClick={() => setOtvorenMeni(!otvorenMeni)} style={dotsBtnStyle}>•••</button>
            {otvorenMeni && (
              <div style={dropdownMenuStyle}>
                <button onClick={() => { setIzmenaOpisa(true); setOtvorenMeni(false); }} style={dropdownItemStyle}>Izmeni opis</button>
                <button onClick={() => onObrisiObjavu(obj.id)} style={{ ...dropdownItemStyle, color: '#ed4956', fontWeight: 'bold' }}>Obriši objavu</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Media (slike i videi) ─── */}
      {media.length > 0 && (
        <div style={imageContainerStyle}>
          <MediaItem item={media[trenutnaSlikaIndex]} style={imageStyle} />
          {media.length > 1 && (
            <>
              {trenutnaSlikaIndex > 0 && (
                <button onClick={() => setTrenutnaSlikaIndex(i => i - 1)} style={leftBtnStyle}>◀</button>
              )}
              {trenutnaSlikaIndex < media.length - 1 && (
                <button onClick={() => setTrenutnaSlikaIndex(i => i + 1)} style={rightBtnStyle}>▶</button>
              )}
              <div style={dotsStyle}>
                {media.map((item, idx) => (
                  <span key={idx} style={{ ...dotStyle, opacity: idx === trenutnaSlikaIndex ? 1 : 0.4 }}>
                    {item.mediaType === 'video' ? '▶' : '•'}
                  </span>
                ))}
              </div>
            </>
          )}
          {/* Ikonica za video u uglu ako je video */}
          {media[trenutnaSlikaIndex]?.mediaType === 'video' && (
            <span style={videoIconStyle}>🎬</span>
          )}
        </div>
      )}

      {/* ─── Sadržaj ─── */}
      <div style={contentStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', fontSize: '24px', marginBottom: '8px' }}>
          <span onClick={() => onLajk(obj)} style={{ cursor: 'pointer', userSelect: 'none' }}>
            {obj.isLiked ? '❤️' : '🤍'}
          </span>
          <span onClick={() => setPrikaziKomentare(p => !p)} style={{ cursor: 'pointer', userSelect: 'none', fontSize: '20px' }}>
            💬
          </span>
        </div>

        <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '5px' }}>
          {obj.likes_count || 0} sviđanja
        </div>

        {/* Opis */}
        <div style={{ fontSize: '14px', marginBottom: '8px' }}>
          <strong>{obj.user?.username}</strong>{' '}
          {izmenaOpisa ? (
            <span style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
              <input value={noviOpis} onChange={e => setNoviOpis(e.target.value)} style={editInputStyle} />
              <button onClick={() => { onSacuvajOpis(obj.id, noviOpis); setIzmenaOpisa(false); }} style={saveBtnStyle}>✓</button>
              <button onClick={() => setIzmenaOpisa(false)} style={cancelBtnStyle}>✕</button>
            </span>
          ) : (
            <span>{obj.caption}</span>
          )}
        </div>

        {/* Komentari toggle */}
        {komentari.length > 0 && (
          <div onClick={() => setPrikaziKomentare(p => !p)} style={{ color: 'gray', fontSize: '14px', cursor: 'pointer', marginBottom: '8px' }}>
            {prikaziKomentare ? 'Sakrij komentare' : `Prikaži sve komentare (${komentari.length})`}
          </div>
        )}

        {/* Lista komentara */}
        {prikaziKomentare && (
          <div style={commentSectionStyle}>
            {komentari.map(kom => (
              <div key={kom.id} style={commentRowStyle}>
                {izmenaKomentara.idKom === kom.id ? (
                  <div style={{ display: 'flex', width: '100%', gap: '5px' }}>
                    <input value={izmenaKomentara.tekst} onChange={e => setIzmenaKomentara({ ...izmenaKomentara, tekst: e.target.value })} style={editInputStyle} />
                    <button onClick={sacuvajKomentar} style={saveBtnStyle}>✓</button>
                    <button onClick={() => setIzmenaKomentara({ idKom: null, tekst: '' })} style={cancelBtnStyle}>✕</button>
                  </div>
                ) : (
                  <>
                    <span style={{ fontSize: '14px' }}>
                      <strong>{kom.username || `Korisnik #${kom.userId}`}</strong>{' '}{kom.content}
                    </span>
                    {Number(kom.userId) === Number(myId) && (
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button onClick={() => setIzmenaKomentara({ idKom: kom.id, tekst: kom.content })} style={editBtnStyle}>✏️</button>
                        <button onClick={() => obrisiKomentar(kom.id)} style={deleteBtnStyle}>×</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Input za novi komentar */}
        <div style={inputAreaStyle}>
          <input
            type="text"
            placeholder="Dodaj komentar..."
            value={noviKomentar}
            onChange={e => setNoviKomentar(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && dodajKomentar()}
            style={inputStyle}
          />
          <button onClick={dodajKomentar} style={postBtnStyle}>Objavi</button>
        </div>
      </div>
    </div>
  );
}

// ─── Timeline komponenta ──────────────────────────────────
function Timeline() {
  const [objave, setObjave] = useState([]);
  const [ucitavam, setUcitavam] = useState(true);
  const [greska, setGreska] = useState(null);

  const getMyUserId = () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try { return JSON.parse(atob(token.split('.')[1])).userId; }
    catch { return null; }
  };

  const myId = getMyUserId();

  useEffect(() => {
    const fetchFeed = async () => {
      const token = localStorage.getItem('token');
      if (!token || !myId) { setUcitavam(false); return; }
      try {
        const res = await fetch('http://localhost:4000/api/feed', {
          headers: { 'Authorization': `Bearer ${token}`, 'x-user-id': String(myId) }
        });
        if (res.ok) {
          const data = await res.json();
          setObjave(data.posts || []);
        } else {
          setGreska('Greška pri učitavanju feed-a.');
        }
      } catch (err) {
        console.error(err);
        setGreska('Server nije dostupan.');
      } finally {
        setUcitavam(false);
      }
    };
    fetchFeed();
  }, []);

  const handleLajk = async (obj) => {
    const token = localStorage.getItem('token');
    const vecLajkovano = obj.isLiked;
    try {
      const res = await fetch(`http://localhost:4000/api/interactions/posts/${obj.id}/likes`, {
        method: vecLajkovano ? 'DELETE' : 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'x-user-id': String(myId) }
      });
      if (res.ok) {
        setObjave(prev => prev.map(o => o.id === obj.id ? {
          ...o,
          isLiked: !vecLajkovano,
          likes_count: vecLajkovano ? Math.max(0, o.likes_count - 1) : o.likes_count + 1
        } : o));
      }
    } catch (err) { console.error(err); }
  };

  const handleObrisiObjavu = async (objavaId) => {
    if (!window.confirm('Obriši objavu?')) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`http://localhost:4000/api/posts/${objavaId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}`, 'x-user-id': String(myId) }
      });
      if (res.ok) setObjave(prev => prev.filter(o => o.id !== objavaId));
    } catch (err) { console.error(err); }
  };

  const handleSacuvajOpis = async (objavaId, noviOpis) => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`http://localhost:4000/api/posts/${objavaId}/caption`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-user-id': String(myId) },
        body: JSON.stringify({ caption: noviOpis })
      });
      if (res.ok) setObjave(prev => prev.map(o => o.id === objavaId ? { ...o, caption: noviOpis } : o));
    } catch (err) { console.error(err); }
  };

  if (ucitavam) return <div style={centerStyle}>Učitavanje feed-a...</div>;
  if (greska) return <div style={centerStyle}>{greska}</div>;
  if (objave.length === 0) return <div style={centerStyle}>Nema objava. Zaprati nekoga ili dodaj svoju prvu objavu!</div>;

  return (
    <div style={containerStyle}>
      {objave.map(obj => (
        // Dodaj myUsername prop
        <PostCard
          key={obj.id}
          obj={obj}
          myId={myId}
          myUsername={myUsername}  // ← dodaj ovo
          onLajk={handleLajk}
          onObrisiObjavu={handleObrisiObjavu}
          onSacuvajOpis={handleSacuvajOpis}
        />
      ))}
    </div>
  );
}

// ─── Stilovi ─────────────────────────────────────────────
const centerStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh', color: 'gray', fontSize: '16px' };
const containerStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px', backgroundColor: '#fafafa', minHeight: '100vh', paddingBottom: '80px' };
const cardStyle = { backgroundColor: 'white', border: '1px solid #dbdbdb', borderRadius: '8px', width: '100%', maxWidth: '470px', marginBottom: '20px' };
const headerStyle = { padding: '12px 15px', borderBottom: '1px solid #efefef', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const dotsBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', fontWeight: 'bold', padding: '0 10px' };
const dropdownMenuStyle = { position: 'absolute', top: '30px', right: '0', backgroundColor: 'white', border: '1px solid #dbdbdb', borderRadius: '5px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', zIndex: 10, width: '140px' };
const dropdownItemStyle = { padding: '10px', background: 'none', border: 'none', borderBottom: '1px solid #efefef', cursor: 'pointer', textAlign: 'left', fontSize: '14px' };
const imageContainerStyle = { position: 'relative', width: '100%', aspectRatio: '1/1', backgroundColor: '#000' };
const imageStyle = { width: '100%', height: '100%', objectFit: 'contain' };
const videoIconStyle = { position: 'absolute', top: '10px', right: '10px', fontSize: '20px', pointerEvents: 'none' };
const dotsStyle = { position: 'absolute', bottom: '10px', width: '100%', display: 'flex', justifyContent: 'center', gap: '4px' };
const dotStyle = { color: 'white', fontSize: '18px', textShadow: '0 0 3px black' };
const leftBtnStyle = { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: '50%', cursor: 'pointer', padding: '5px 8px', zIndex: 1 };
const rightBtnStyle = { position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: '50%', cursor: 'pointer', padding: '5px 8px', zIndex: 1 };
const contentStyle = { padding: '12px 15px' };
const commentSectionStyle = { maxHeight: '150px', overflowY: 'auto', marginBottom: '10px' };
const commentRowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '5px 0', fontSize: '14px' };
const inputAreaStyle = { display: 'flex', borderTop: '1px solid #efefef', paddingTop: '10px', marginTop: '5px' };
const inputStyle = { flex: 1, border: 'none', outline: 'none', fontSize: '14px' };
const postBtnStyle = { background: 'none', border: 'none', color: '#0095f6', fontWeight: 'bold', cursor: 'pointer' };
const deleteBtnStyle = { background: 'none', border: 'none', color: '#ed4956', fontSize: '18px', cursor: 'pointer', padding: '0 5px' };
const editBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' };
const editInputStyle = { flex: 1, border: '1px solid #dbdbdb', borderRadius: '4px', padding: '4px 8px', fontSize: '14px' };
const saveBtnStyle = { background: '#0095f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontWeight: 'bold' };
const cancelBtnStyle = { background: '#efefef', color: 'black', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px' };

export default Timeline;